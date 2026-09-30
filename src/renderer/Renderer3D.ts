import * as THREE from 'three';
import { CHUNK_SIZE, QUALITY_RENDER_RADIUS, RESOURCE_INFO } from '../game/constants';
import type { Direction, GameSettings, GameNotification, MiningJob, ResourceKind, ResolvedTile, TerrainMaterial, Vec2 } from '../game/types';
import { GameSimulation } from '../game/GameSimulation';
import {
  cabinShellGeometry,
  chunkyRockGeometry,
  drillCorkscrewGeometry,
  enableGameAssetShadows,
  heroBodyGeometry,
  makeCleanMaterial,
  mineralShardGeometry,
  roundedBoxGeometry,
  stylizedWallGeometry,
  trackShellGeometry,
} from '../assets/visualKit';
import { floorDiv, random01 } from '../world/prng';

const CELL_SIZE = 4.4;
const FLOOR_Y = 0;
const VEHICLE_Y = 0.42;
const BASE_TUNNEL_HEIGHT = 3.55;
const BASE_TUNNEL_WIDTH = 3.9;

const TERRAIN_COLORS: Record<TerrainMaterial, string> = {
  surface: '#c48b54',
  air: '#8f694d',
  soil: '#c9874a',
  dirt: '#9a6239',
  clay: '#b66548',
  limestone: '#b8b293',
  granite: '#85827d',
  hardRock: '#696969',
  deepRock: '#5d6574',
  crystal: '#6fb0bd',
  abandoned: '#6f513b',
  waterPocket: '#4c8aa0',
};

type RockMaterial = Exclude<TerrainMaterial, 'air' | 'surface'>;

type InstancedName =
  | 'floor'
  | 'ceiling'
  | 'support'
  | 'rail'
  | 'pipe'
  | 'cable'
  | 'rock'
  | 'largeRock'
  | 'tallFormation'
  | 'rubble'
  | 'crystalProp'
  | 'goldVein'
  | 'quartzVein'
  | 'rareMineralVein'
  | 'diamondShard'
  | 'diamondGlimmer'
  | 'barrel'
  | 'sign';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  spin: number;
  kind: 'dust' | 'spark' | 'scanner' | 'mote';
}

interface ScanPulse {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  level: number;
}

interface DiscoveryEffect {
  group: THREE.Group;
  light?: THREE.PointLight;
  life: number;
  maxLife: number;
  kind: string;
}

const YAW_BY_DIRECTION: Record<Direction, number> = {
  down: 0,
  right: Math.PI / 2,
  up: Math.PI,
  left: -Math.PI / 2,
};

const DIR_VECTOR: Record<Direction, THREE.Vector3> = {
  down: new THREE.Vector3(0, 0, 1),
  up: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
};

function gridToWorld(position: Vec2): THREE.Vector3 {
  return new THREE.Vector3(position.x * CELL_SIZE, FLOOR_Y, position.y * CELL_SIZE);
}

function isRockMaterial(material: TerrainMaterial): material is RockMaterial {
  return material !== 'air' && material !== 'surface';
}

function scannerLevelValue(tone: string | undefined): number {
  if (tone === 'very strong') return 1;
  if (tone === 'strong') return 0.82;
  if (tone === 'medium') return 0.62;
  if (tone === 'weak') return 0.42;
  if (tone === 'very weak') return 0.28;
  return 0.16;
}

function angleLerp(current: number, target: number, t: number): number {
  const wrapped = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  return current + wrapped * t;
}

export class Renderer3D {
  readonly canvas: HTMLCanvasElement;
  private readonly simulation: GameSimulation;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.08, 180);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly instancedMeshes = new Map<InstancedName, THREE.InstancedMesh>();
  private readonly wallMeshes = new Map<RockMaterial, THREE.InstancedMesh>();
  private readonly rockMaterials = new Map<RockMaterial, THREE.MeshStandardMaterial>();
  private readonly garage = new THREE.Group();
  private readonly excavator = new THREE.Group();
  private readonly chassis = new THREE.Group();
  private readonly drillAssembly = new THREE.Group();
  private readonly drillBit = new THREE.Group();
  private readonly drillLight = new THREE.PointLight('#ffb95c', 0, 6, 2);
  private readonly directionIndicator: THREE.Mesh;
  private readonly miningFace = new THREE.Group();
  private readonly headlights: THREE.SpotLight[] = [];
  private readonly headlightTargets: THREE.Object3D[] = [];
  private readonly trackWheels: THREE.Object3D[] = [];
  private readonly trackTreads: THREE.Object3D[] = [];
  private readonly hydraulicPistons: THREE.Object3D[] = [];
  private readonly exhaustPieces: THREE.Object3D[] = [];
  private readonly beaconLight = new THREE.PointLight('#ffb743', 0.55, 3.6, 1.8);
  private readonly particlePool: Particle[] = [];
  private readonly scanPulses: ScanPulse[] = [];
  private readonly discoveryEffects: DiscoveryEffect[] = [];
  private readonly cameraPosition = new THREE.Vector3(0, 6, -10);
  private readonly lookAtPosition = new THREE.Vector3(0, 1.2, 4);
  private readonly visualPosition = new THREE.Vector3();
  private readonly visualTarget = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly seenNotifications = new Set<string>();
  private readonly seenDiscoveries = new Set<string>();
  private currentYaw = YAW_BY_DIRECTION.down;
  private previousLogicalPosition: Vec2 | undefined;
  private previousScanCount = 0;
  private randomSeed = '';
  private randomGenerationVersion = 1;
  private shakeTime = 0;
  private shakeStrength = 0;
  private settings: GameSettings;
  private renderCapacity = 0;

  constructor(container: HTMLElement, simulation: GameSimulation) {
    this.simulation = simulation;
    this.settings = simulation.getSettings();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.settings.quality !== 'LOW',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.setClearColor('#9fc4d6');
    this.renderer.setPixelRatio(this.pixelRatioForQuality(this.settings.quality));
    this.renderer.shadowMap.enabled = this.settings.quality === 'HIGH' || this.settings.quality === 'ULTRA';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.canvas);

    this.scene.fog = new THREE.FogExp2('#c2a27a', 0.015);
    this.scene.add(new THREE.HemisphereLight('#fff0c8', '#9a6847', 1.22));
    this.scene.add(new THREE.AmbientLight('#ffdcb0', 0.32));
    const distantFill = new THREE.DirectionalLight('#fff3d0', 1.05);
    distantFill.position.set(-10, 16, -8);
    distantFill.castShadow = this.renderer.shadowMap.enabled;
    this.scene.add(distantFill);

    this.createMaterials();
    this.createEnvironmentMeshes();
    this.createGarage();
    this.createExcavator();
    this.createMiningFace();
    this.createParticles();

    this.directionIndicator = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.7, 3),
      new THREE.MeshBasicMaterial({ color: '#7df8ff', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.directionIndicator.rotation.x = Math.PI / 2;
    this.scene.add(this.directionIndicator);

    const initialSave = this.simulation.getSave();
    this.randomSeed = initialSave.seed;
    this.randomGenerationVersion = initialSave.generationVersion;
    const start = gridToWorld(this.simulation.snapshot().player.position);
    this.visualPosition.copy(start);
    this.visualTarget.copy(start);
    this.cameraPosition.set(start.x, start.y + 5.7, start.z - 10);
    this.lookAtPosition.set(start.x, start.y + 1.2, start.z + 4);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    for (const mesh of this.instancedMeshes.values()) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    for (const mesh of this.wallMeshes.values()) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.renderer.setPixelRatio(this.pixelRatioForQuality(settings.quality));
    this.renderer.shadowMap.enabled = settings.quality === 'HIGH' || settings.quality === 'ULTRA';
    for (const mesh of [...this.instancedMeshes.values(), ...this.wallMeshes.values()]) mesh.castShadow = this.renderer.shadowMap.enabled;
    for (const light of this.headlights) light.castShadow = this.renderer.shadowMap.enabled;
    this.resize();
  }

  render(deltaSeconds: number): void {
    const snapshot = this.simulation.snapshot();
    const player = snapshot.player;
    this.visualTarget.copy(gridToWorld(player.position));

    if (this.visualPosition.distanceTo(this.visualTarget) > CELL_SIZE * 6) {
      this.visualPosition.copy(this.visualTarget);
    } else {
      const movementEase = this.settings.reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 6.5);
      this.visualPosition.lerp(this.visualTarget, movementEase);
    }

    const targetYaw = YAW_BY_DIRECTION[player.facing];
    this.currentYaw = this.settings.reducedMotion ? targetYaw : angleLerp(this.currentYaw, targetYaw, 1 - Math.exp(-deltaSeconds * 7));

    this.updateEnvironment(player.position);
    this.updateExcavator(player.facing, snapshot.miningJob, deltaSeconds);
    this.updateMiningFace(snapshot.miningJob, deltaSeconds);
    this.updateScanner(snapshot, deltaSeconds);
    this.updateAmbientMotion(snapshot.player.position, deltaSeconds);
    this.updateParticles(deltaSeconds, snapshot.miningJob);
    this.updateDiscoveryEffects(deltaSeconds);
    this.detectNotificationShake(snapshot.notifications);
    this.detectDiscoveryEffects();
    this.updateCamera(deltaSeconds, player.facing, snapshot.miningJob);

    this.renderer.render(this.scene, this.camera);
    this.previousLogicalPosition = { ...player.position };
  }

  screenToTile(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    return { x: Math.round(hit.x / CELL_SIZE), y: Math.round(hit.z / CELL_SIZE) };
  }

  private readonly resize = (): void => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = width < 680 ? 58 : 52;
    this.camera.updateProjectionMatrix();
  };

  private createMaterials(): void {
    const rough = 0.9;
    const rocks = (Object.keys(TERRAIN_COLORS) as TerrainMaterial[]).filter(isRockMaterial);
    for (const material of rocks) {
      const color = new THREE.Color(TERRAIN_COLORS[material]);
      const meshMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: 0.02,
        flatShading: true,
        emissive: material === 'crystal' ? '#153958' : '#000000',
        emissiveIntensity: material === 'crystal' ? 0.16 : 0,
      });
      this.rockMaterials.set(material, meshMaterial);
    }
  }

  private createEnvironmentMeshes(): void {
    this.ensureEnvironmentCapacity(900);
  }

  private ensureEnvironmentCapacity(openCellCapacity: number): void {
    if (openCellCapacity <= this.renderCapacity) return;
    this.renderCapacity = openCellCapacity;

    for (const mesh of this.instancedMeshes.values()) this.scene.remove(mesh);
    for (const mesh of this.wallMeshes.values()) this.scene.remove(mesh);
    this.instancedMeshes.clear();
    this.wallMeshes.clear();

    const floorMaterial = makeCleanMaterial({ color: '#b98555', roughness: 0.82, metalness: 0.0 });
    const ceilingMaterial = makeCleanMaterial({ color: '#8f6345', roughness: 0.9, metalness: 0.0 });
    const supportMaterial = makeCleanMaterial({ color: '#8b5a31', roughness: 0.76, metalness: 0.02 });
    const railMaterial = makeCleanMaterial({ color: '#68727b', roughness: 0.42, metalness: 0.6 });
    const pipeMaterial = makeCleanMaterial({ color: '#66757c', roughness: 0.44, metalness: 0.5 });
    const cableMaterial = makeCleanMaterial({ color: '#3b3029', roughness: 0.78, metalness: 0.14 });
    const rockPropMaterial = makeCleanMaterial({ color: '#a89278', roughness: 0.86, metalness: 0.0 });
    const rubbleMaterial = makeCleanMaterial({ color: '#c09265', roughness: 0.9, metalness: 0.0 });
    const crystalMaterial = new THREE.MeshStandardMaterial({ color: '#9de8ff', emissive: '#4aa8c9', emissiveIntensity: 0.34, roughness: 0.3, metalness: 0.04, flatShading: true });
    const goldVeinMaterial = new THREE.MeshStandardMaterial({ color: '#f7bd35', emissive: '#ad6615', emissiveIntensity: 0.18, roughness: 0.28, metalness: 0.7, flatShading: true });
    const quartzVeinMaterial = new THREE.MeshPhysicalMaterial({ color: '#e7fbff', emissive: '#9ce7ff', emissiveIntensity: 0.16, roughness: 0.16, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.05, flatShading: true });
    const rareMineralVeinMaterial = new THREE.MeshStandardMaterial({ color: '#a875ff', emissive: '#6b35c8', emissiveIntensity: 0.28, roughness: 0.35, metalness: 0.08, flatShading: true });
    const diamondShardMaterial = new THREE.MeshPhysicalMaterial({
      color: '#d8fdff',
      emissive: '#73f2ff',
      emissiveIntensity: 0.32,
      roughness: 0.015,
      metalness: 0.02,
      transmission: 0.2,
      thickness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      reflectivity: 1,
      flatShading: true,
    });
    const diamondGlimmerMaterial = new THREE.MeshBasicMaterial({
      color: '#b8fbff',
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: '#9c4d35', roughness: 0.56, metalness: 0.35, flatShading: true });
    const signMaterial = new THREE.MeshStandardMaterial({ color: '#ffce4b', roughness: 0.45, metalness: 0.12, flatShading: true });

    this.registerInstanced('floor', roundedBoxGeometry(1, 1, 1, 0.08, 3), floorMaterial, openCellCapacity);
    this.registerInstanced('ceiling', stylizedWallGeometry(), ceilingMaterial, openCellCapacity);
    this.registerInstanced('support', roundedBoxGeometry(1, 1, 1, 0.12, 4), supportMaterial, openCellCapacity * 8);
    this.registerInstanced('rail', roundedBoxGeometry(1, 1, 1, 0.08, 3), railMaterial, openCellCapacity * 5);
    this.registerInstanced('pipe', new THREE.CapsuleGeometry(0.5, 1, 4, 8), pipeMaterial, openCellCapacity * 2);
    this.registerInstanced('cable', new THREE.CapsuleGeometry(0.5, 1, 3, 6), cableMaterial, openCellCapacity * 2);
    this.registerInstanced('rock', chunkyRockGeometry(0.5, 0), rockPropMaterial, openCellCapacity * 2);
    this.registerInstanced('largeRock', chunkyRockGeometry(0.82, 1), rockPropMaterial, openCellCapacity);
    this.registerInstanced('tallFormation', chunkyRockGeometry(0.62, 1), rockPropMaterial, openCellCapacity);
    this.registerInstanced('rubble', chunkyRockGeometry(0.38, 0), rubbleMaterial, openCellCapacity * 4);
    this.registerInstanced('crystalProp', mineralShardGeometry(0.5), crystalMaterial, openCellCapacity);
    this.registerInstanced('goldVein', chunkyRockGeometry(0.42, 0), goldVeinMaterial, openCellCapacity * 2);
    this.registerInstanced('quartzVein', mineralShardGeometry(0.42), quartzVeinMaterial, openCellCapacity * 2);
    this.registerInstanced('rareMineralVein', mineralShardGeometry(0.46), rareMineralVeinMaterial, openCellCapacity * 2);
    this.registerInstanced('diamondShard', mineralShardGeometry(0.5), diamondShardMaterial, openCellCapacity * 2);
    this.registerInstanced('diamondGlimmer', new THREE.CircleGeometry(0.5, 6), diamondGlimmerMaterial, openCellCapacity * 3);
    this.registerInstanced('barrel', new THREE.CapsuleGeometry(0.48, 0.42, 4, 10), barrelMaterial, openCellCapacity);
    this.registerInstanced('sign', roundedBoxGeometry(1, 0.12, 0.7, 0.05, 3), signMaterial, openCellCapacity);

    for (const [material, meshMaterial] of this.rockMaterials.entries()) {
      const wall = new THREE.InstancedMesh(stylizedWallGeometry(), meshMaterial, openCellCapacity * 5);
      wall.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      wall.userData.capacity = openCellCapacity * 5;
      wall.userData.next = 0;
      wall.castShadow = this.renderer.shadowMap.enabled;
      wall.receiveShadow = true;
      this.wallMeshes.set(material, wall);
      this.scene.add(wall);
    }
  }

  private registerInstanced(name: InstancedName, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): void {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.capacity = capacity;
    mesh.userData.next = 0;
    mesh.castShadow = this.renderer.shadowMap.enabled;
    mesh.receiveShadow = true;
    this.instancedMeshes.set(name, mesh);
    this.scene.add(mesh);
  }

  private createGarage(): void {
    this.garage.name = 'surface garage';

    const concrete = new THREE.MeshStandardMaterial({ color: '#343941', roughness: 0.78, metalness: 0.05, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: '#52606d', roughness: 0.48, metalness: 0.52, flatShading: true });
    const yellow = new THREE.MeshStandardMaterial({ color: '#e8a83b', roughness: 0.5, metalness: 0.18, flatShading: true });
    const red = new THREE.MeshStandardMaterial({ color: '#ad473a', roughness: 0.62, metalness: 0.18, flatShading: true });
    const lightMat = new THREE.MeshStandardMaterial({ color: '#fff0b6', emissive: '#ffd56b', emissiveIntensity: 1.1, roughness: 0.28 });
    const rock = this.rockMaterials.get('granite') ?? new THREE.MeshStandardMaterial({ color: '#555766' });

    const floor = new THREE.Mesh(roundedBoxGeometry(26, 0.22, 22), concrete);
    floor.position.set(0, -0.13, -5.2);
    floor.receiveShadow = true;
    this.garage.add(floor);

    const backWall = new THREE.Mesh(roundedBoxGeometry(27, 6, 0.8), metal);
    backWall.position.set(0, 3, -15.5);
    backWall.receiveShadow = true;
    backWall.castShadow = true;
    this.garage.add(backWall);

    const sideWallA = new THREE.Mesh(roundedBoxGeometry(0.8, 5.4, 17), metal);
    sideWallA.position.set(-13.2, 2.7, -6.9);
    const sideWallB = sideWallA.clone();
    sideWallB.position.x = 13.2;
    this.garage.add(sideWallA, sideWallB);

    const roofBeam = new THREE.Mesh(roundedBoxGeometry(27, 0.45, 0.55), metal);
    for (let i = 0; i < 4; i += 1) {
      const beam = roofBeam.clone();
      beam.position.set(0, 5.65, -13 + i * 4.2);
      this.garage.add(beam);
    }

    const portal = new THREE.Group();
    const archTop = new THREE.Mesh(roundedBoxGeometry(9.4, 2.2, 1.1), rock);
    archTop.position.set(0, 5.0, 4.65);
    const archLeft = new THREE.Mesh(roundedBoxGeometry(2.0, 5.5, 1.2), rock);
    archLeft.position.set(-5.55, 2.55, 4.65);
    const archRight = archLeft.clone();
    archRight.position.x = 5.55;
    portal.add(archTop, archLeft, archRight);
    this.garage.add(portal);

    this.addGarageStation('REPAIR', new THREE.Vector3(-7.9, 0, -4.2), red, lightMat);
    this.addGarageStation('FUEL', new THREE.Vector3(7.7, 0, -4.7), yellow, lightMat);
    this.addGarageStation('STORAGE', new THREE.Vector3(-8.2, 0, -10.8), metal, lightMat);

    for (let i = 0; i < 7; i += 1) {
      const crate = new THREE.Mesh(roundedBoxGeometry(1.15, 1.15, 1.15), i % 2 ? metal : yellow);
      crate.position.set(-10 + (i % 3) * 1.4, 0.58, -1.5 - Math.floor(i / 3) * 1.35);
      crate.rotation.y = i * 0.37;
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.garage.add(crate);
    }

    for (let i = 0; i < 5; i += 1) {
      const lamp = new THREE.Mesh(roundedBoxGeometry(1.25, 0.16, 0.35), lightMat);
      lamp.position.set(-8 + i * 4, 5.35, -8.8);
      this.garage.add(lamp);
      const lampLight = new THREE.PointLight('#ffcf7c', 0.72, 13, 1.8);
      lampLight.position.copy(lamp.position);
      this.garage.add(lampLight);
    }

    const tunnelGlow = new THREE.PointLight('#ffb25b', 1.1, 13, 2.1);
    tunnelGlow.position.set(0, 2.2, 2.8);
    this.garage.add(tunnelGlow);

    const cart = this.createMiningCartModel();
    cart.position.set(5.4, 0.05, -10.6);
    cart.rotation.y = -0.28;
    this.garage.add(cart);

    const bench = this.createToolBenchModel();
    bench.position.set(9.2, 0.02, -9.4);
    bench.rotation.y = -Math.PI / 2;
    this.garage.add(bench);

    enableGameAssetShadows(this.garage);
    this.scene.add(this.garage);
  }

  private createMiningCartModel(): THREE.Group {
    const cart = new THREE.Group();
    const tubMaterial = makeCleanMaterial({ color: '#6d7d86', roughness: 0.5, metalness: 0.45 });
    const trimMaterial = makeCleanMaterial({ color: '#43515b', roughness: 0.45, metalness: 0.58 });
    const wheelMaterial = makeCleanMaterial({ color: '#2f3136', roughness: 0.62, metalness: 0.38 });
    const oreMaterial = makeCleanMaterial({ color: '#d99a47', roughness: 0.78, metalness: 0.02 });

    const tub = new THREE.Mesh(roundedBoxGeometry(2.25, 0.92, 1.38, 0.18, 5), tubMaterial);
    tub.position.set(0, 0.88, 0);
    tub.scale.y = 0.78;
    cart.add(tub);

    const lip = new THREE.Mesh(roundedBoxGeometry(2.45, 0.18, 1.58, 0.09, 4), trimMaterial);
    lip.position.set(0, 1.31, 0);
    cart.add(lip);

    const frontPlate = new THREE.Mesh(roundedBoxGeometry(0.18, 0.86, 1.25, 0.1, 4), trimMaterial);
    frontPlate.position.set(1.16, 0.9, 0);
    frontPlate.rotation.z = -0.12;
    const backPlate = frontPlate.clone();
    backPlate.position.x = -1.16;
    backPlate.rotation.z = 0.12;
    cart.add(frontPlate, backPlate);

    for (const x of [-0.78, 0.78]) {
      for (const z of [-0.72, 0.72]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.075, 8, 18), wheelMaterial);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(x, 0.34, z);
        cart.add(wheel);
      }
    }

    for (let i = 0; i < 7; i += 1) {
      const ore = new THREE.Mesh(chunkyRockGeometry(0.19 + (i % 3) * 0.035, 0), oreMaterial);
      ore.position.set(-0.72 + (i % 4) * 0.46, 1.42 + (i % 2) * 0.08, -0.35 + Math.floor(i / 4) * 0.48);
      ore.rotation.set(i * 0.8, i * 0.42, i * 0.2);
      cart.add(ore);
    }

    enableGameAssetShadows(cart);
    return cart;
  }

  private createToolBenchModel(): THREE.Group {
    const bench = new THREE.Group();
    const wood = makeCleanMaterial({ color: '#9b6335', roughness: 0.72, metalness: 0.02 });
    const metal = makeCleanMaterial({ color: '#6f7880', roughness: 0.42, metalness: 0.58 });
    const accent = makeCleanMaterial({ color: '#d85c3f', roughness: 0.55, metalness: 0.18 });

    const top = new THREE.Mesh(roundedBoxGeometry(2.5, 0.22, 1.0, 0.08, 4), wood);
    top.position.y = 1.02;
    bench.add(top);
    for (const x of [-1.02, 1.02]) {
      for (const z of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(roundedBoxGeometry(0.16, 1.02, 0.16, 0.05, 3), metal);
        leg.position.set(x, 0.5, z);
        bench.add(leg);
      }
    }
    const toolbox = new THREE.Mesh(roundedBoxGeometry(0.82, 0.34, 0.46, 0.08, 4), accent);
    toolbox.position.set(-0.58, 1.34, 0.04);
    bench.add(toolbox);
    const toolRail = new THREE.Mesh(roundedBoxGeometry(0.08, 0.08, 1.3, 0.03, 3), metal);
    toolRail.position.set(0.55, 1.28, 0);
    toolRail.rotation.x = 0.45;
    bench.add(toolRail);
    enableGameAssetShadows(bench);
    return bench;
  }

  private addGarageStation(label: string, origin: THREE.Vector3, material: THREE.Material, lightMaterial: THREE.Material): void {
    const station = new THREE.Group();
    station.position.copy(origin);
    const base = new THREE.Mesh(roundedBoxGeometry(3.2, 0.28, 2.4), material);
    base.position.y = 0.14;
    const cabinet = new THREE.Mesh(roundedBoxGeometry(1.35, 2.3, 0.9), material);
    cabinet.position.set(0, 1.28, -0.52);
    const sign = new THREE.Mesh(roundedBoxGeometry(2.45, 0.12, 0.62), lightMaterial);
    sign.position.set(0, 2.55, -1.0);
    station.add(base, cabinet, sign);
    const beacon = new THREE.PointLight(label === 'FUEL' ? '#ffd96d' : label === 'REPAIR' ? '#ff7e68' : '#7de8ff', 0.58, 8, 1.7);
    beacon.position.set(0, 2.2, -0.6);
    station.add(beacon);
    this.garage.add(station);
  }

  private createExcavator(): void {
    const yellow = new THREE.MeshStandardMaterial({ color: '#e7a63f', roughness: 0.48, metalness: 0.22, flatShading: true });
    const yellowDark = new THREE.MeshStandardMaterial({ color: '#b96e24', roughness: 0.62, metalness: 0.18, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: '#13171c', roughness: 0.72, metalness: 0.38, flatShading: true });
    const rubber = new THREE.MeshStandardMaterial({ color: '#050608', roughness: 0.92, metalness: 0.04, flatShading: true });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#8eddf1',
      emissive: '#103a4e',
      emissiveIntensity: 0.46,
      roughness: 0.12,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.06,
      reflectivity: 0.75,
      flatShading: true,
    });
    const steel = new THREE.MeshStandardMaterial({ color: '#b4bdc8', roughness: 0.36, metalness: 0.68, flatShading: true });
    const chrome = new THREE.MeshStandardMaterial({ color: '#d8e0e8', roughness: 0.2, metalness: 0.82, flatShading: true });
    const fuel = new THREE.MeshStandardMaterial({ color: '#d95345', roughness: 0.44, metalness: 0.38, flatShading: true });
    const lightMat = new THREE.MeshStandardMaterial({ color: '#fff4b3', emissive: '#ffe08d', emissiveIntensity: 1.7 });
    const amberMat = new THREE.MeshStandardMaterial({ color: '#ffb743', emissive: '#ff9e2d', emissiveIntensity: 1.25, roughness: 0.24 });

    const shadow = <T extends THREE.Mesh>(mesh: T): T => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    const undercarriage = shadow(new THREE.Mesh(roundedBoxGeometry(2.75, 0.34, 2.78), dark));
    undercarriage.position.set(0, 0.54, 0.02);
    this.chassis.add(undercarriage);

    this.createTrack(-1.16, rubber, steel, yellowDark);
    this.createTrack(1.16, rubber, steel, yellowDark);

    const bellyPlate = shadow(new THREE.Mesh(roundedBoxGeometry(1.82, 0.22, 2.42), steel));
    bellyPlate.position.set(0, 0.82, -0.02);
    this.chassis.add(bellyPlate);

    const body = shadow(new THREE.Mesh(heroBodyGeometry(), yellow));
    body.position.set(0, 1.08, 0.02);
    body.scale.set(1.02, 1.12, 1.08);
    this.chassis.add(body);

    const rearCounterweight = shadow(new THREE.Mesh(roundedBoxGeometry(2.15, 0.92, 0.62), yellowDark));
    rearCounterweight.position.set(0, 1.16, -1.28);
    rearCounterweight.rotation.x = 0.04;
    this.chassis.add(rearCounterweight);

    const hood = shadow(new THREE.Mesh(roundedBoxGeometry(1.48, 0.56, 0.92), yellow));
    hood.position.set(0.14, 1.48, 0.46);
    hood.rotation.x = -0.08;
    this.chassis.add(hood);

    const hoodStripe = shadow(new THREE.Mesh(roundedBoxGeometry(0.18, 0.04, 0.98), dark));
    hoodStripe.position.set(0.14, 1.79, 0.48);
    hoodStripe.rotation.x = -0.08;
    this.chassis.add(hoodStripe);

    const cabinFrame = shadow(new THREE.Mesh(cabinShellGeometry(), yellowDark));
    cabinFrame.position.set(-0.36, 1.78, -0.42);
    cabinFrame.scale.set(1.08, 1.08, 1.04);
    cabinFrame.rotation.z = -0.035;
    this.chassis.add(cabinFrame);

    const frontWindow = shadow(new THREE.Mesh(roundedBoxGeometry(0.84, 0.64, 0.08), glass));
    frontWindow.position.set(-0.36, 1.84, 0.13);
    frontWindow.rotation.x = -0.08;
    this.chassis.add(frontWindow);

    const sideWindowA = shadow(new THREE.Mesh(roundedBoxGeometry(0.08, 0.58, 0.56), glass));
    sideWindowA.position.set(-0.98, 1.84, -0.42);
    const sideWindowB = sideWindowA.clone();
    sideWindowB.position.x = 0.26;
    this.chassis.add(sideWindowA, sideWindowB);

    const roof = shadow(new THREE.Mesh(roundedBoxGeometry(1.42, 0.18, 1.15), yellow));
    roof.position.set(-0.36, 2.42, -0.42);
    this.chassis.add(roof);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), amberMat);
    beacon.scale.y = 0.62;
    beacon.position.set(-0.36, 2.58, -0.42);
    this.chassis.add(beacon);
    this.beaconLight.position.copy(beacon.position).add(new THREE.Vector3(0, 0.08, 0));
    this.chassis.add(this.beaconLight);

    const exhaust = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.76, 4, 10), dark));
    exhaust.position.set(0.72, 2.0, -0.78);
    exhaust.rotation.z = -0.06;
    this.chassis.add(exhaust);
    this.exhaustPieces.push(exhaust);
    const exhaustCap = shadow(new THREE.Mesh(roundedBoxGeometry(0.24, 0.07, 0.2, 0.03, 3), dark));
    exhaustCap.position.set(0.75, 2.46, -0.78);
    exhaustCap.rotation.z = -0.08;
    this.chassis.add(exhaustCap);
    this.exhaustPieces.push(exhaustCap);

    const tank = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.18, 14), fuel));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(1.18, 1.25, -0.42);
    this.chassis.add(tank);

    for (let i = 0; i < 5; i += 1) {
      const grille = shadow(new THREE.Mesh(roundedBoxGeometry(0.05, 0.42, 0.055), dark));
      grille.position.set(1.03, 1.48, 0.12 + i * 0.12);
      this.chassis.add(grille);
    }

    for (let i = 0; i < 4; i += 1) {
      const bolt = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8), chrome));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(-0.72 + i * 0.48, 1.49, 1.19);
      this.chassis.add(bolt);
    }

    const frontMount = shadow(new THREE.Mesh(roundedBoxGeometry(1.18, 0.56, 0.42), steel));
    frontMount.position.set(0, 1.13, 1.36);
    this.drillAssembly.add(frontMount);

    const boomA = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 1.55, 10), yellowDark));
    boomA.rotation.x = Math.PI / 2;
    boomA.position.set(-0.28, 1.28, 2.02);
    const boomB = boomA.clone();
    boomB.position.x = 0.28;
    this.drillAssembly.add(boomA, boomB);

    const centralRail = shadow(new THREE.Mesh(roundedBoxGeometry(0.28, 0.24, 1.38), steel));
    centralRail.position.set(0, 1.22, 2.04);
    this.drillAssembly.add(centralRail);

    const hydraulicA = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1.32, 4, 8), chrome));
    hydraulicA.rotation.x = Math.PI / 2;
    hydraulicA.position.set(-0.46, 0.98, 1.96);
    const hydraulicB = hydraulicA.clone();
    hydraulicB.position.x = 0.46;
    this.drillAssembly.add(hydraulicA, hydraulicB);
    this.hydraulicPistons.push(hydraulicA, hydraulicB);

    const drillCollar = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 18), steel));
    drillCollar.rotation.x = Math.PI / 2;
    drillCollar.position.set(0, 1.16, 2.74);
    this.drillAssembly.add(drillCollar);

    const corkscrew = shadow(new THREE.Mesh(drillCorkscrewGeometry(), chrome));
    corkscrew.name = 'corkscrew-bit';
    this.drillBit.position.set(0, 1.16, 2.92);
    this.drillBit.add(corkscrew);

    const bitRim = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 18), steel));
    bitRim.rotation.x = Math.PI / 2;
    bitRim.position.z = -0.38;
    this.drillBit.add(bitRim);

    this.drillAssembly.add(this.drillBit);
    this.chassis.add(this.drillAssembly);

    const bladeGuard = shadow(new THREE.Mesh(roundedBoxGeometry(2.15, 0.32, 0.18), yellowDark));
    bladeGuard.position.set(0, 0.82, 1.58);
    bladeGuard.rotation.x = -0.18;
    this.chassis.add(bladeGuard);

    const headlightLeft = shadow(new THREE.Mesh(roundedBoxGeometry(0.28, 0.2, 0.1), lightMat));
    headlightLeft.position.set(-0.56, 1.18, 1.52);
    const headlightRight = headlightLeft.clone();
    headlightRight.position.x = 0.56;
    this.chassis.add(headlightLeft, headlightRight);

    const drillLamp = new THREE.PointLight('#ffc47d', 0.55, 4.2, 1.9);
    drillLamp.position.set(0, 1.22, 2.52);
    this.drillAssembly.add(drillLamp);

    for (const x of [-0.54, 0.54]) {
      const spot = new THREE.SpotLight('#ffe1a1', 5.8, 38, Math.PI / 5.8, 0.52, 1.22);
      spot.position.set(x, 1.18, 1.58);
      spot.castShadow = this.renderer.shadowMap.enabled;
      spot.shadow.mapSize.set(512, 512);
      const target = new THREE.Object3D();
      target.position.set(x * 0.18, 0.9, 9.4);
      this.chassis.add(spot, target);
      spot.target = target;
      this.headlights.push(spot);
      this.headlightTargets.push(target);
    }

    const cabGlow = new THREE.PointLight('#77dfff', 0.5, 3.8, 1.6);
    cabGlow.position.set(-0.36, 1.8, -0.2);
    this.chassis.add(cabGlow);

    this.excavator.add(this.chassis);
    this.excavator.scale.setScalar(1.12);
    this.excavator.position.copy(this.visualPosition).add(new THREE.Vector3(0, VEHICLE_Y, 0));
    enableGameAssetShadows(this.excavator);
    this.scene.add(this.excavator);
  }

  private createTrack(x: number, rubber: THREE.Material, steel: THREE.Material, accent: THREE.Material): void {
    const track = new THREE.Group();
    track.position.x = x;

    const belt = new THREE.Mesh(trackShellGeometry(), rubber);
    belt.position.set(0, 0.48, 0.02);
    belt.scale.set(1.0, 1.08, 1.08);
    belt.castShadow = true;
    belt.receiveShadow = true;
    track.add(belt);

    for (const z of [-1.22, 1.22]) {
      const roundedEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 16), rubber);
      roundedEnd.rotation.z = Math.PI / 2;
      roundedEnd.position.set(0, 0.48, z);
      roundedEnd.castShadow = true;
      roundedEnd.receiveShadow = true;
      track.add(roundedEnd);
    }

    const sprocketPositions = [-1.14, 1.14];
    for (const z of sprocketPositions) {
      const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 14), steel);
      sprocket.rotation.z = Math.PI / 2;
      sprocket.position.set(0, 0.49, z);
      sprocket.castShadow = true;
      track.add(sprocket);
      this.trackWheels.push(sprocket);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.13, 10), accent);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(sprocket.position);
      track.add(hub);
      this.trackWheels.push(hub);
    }

    for (let i = 0; i < 4; i += 1) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), steel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.34, -0.68 + i * 0.46);
      wheel.castShadow = true;
      track.add(wheel);
      this.trackWheels.push(wheel);
    }

    for (let i = 0; i < 12; i += 1) {
      const tread = new THREE.Mesh(roundedBoxGeometry(0.72, 0.075, 0.16), rubber);
      tread.position.set(0, i % 2 === 0 ? 0.75 : 0.19, -1.18 + i * 0.215);
      tread.userData.baseZ = tread.position.z;
      tread.userData.baseY = tread.position.y;
      tread.castShadow = true;
      tread.receiveShadow = true;
      track.add(tread);
      this.trackTreads.push(tread);
    }

    for (let i = 0; i < 3; i += 1) {
      const suspension = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), steel);
      suspension.rotation.z = Math.PI / 2;
      suspension.position.set(0, 0.68, -0.58 + i * 0.58);
      suspension.castShadow = true;
      track.add(suspension);
    }

    this.chassis.add(track);
  }

  private createMiningFace(): void {
    const rock = new THREE.MeshStandardMaterial({ color: '#5e554e', roughness: 0.95, metalness: 0.02, flatShading: true });
    const crack = new THREE.MeshBasicMaterial({ color: '#1b1210', transparent: true, opacity: 0.78 });
    const plate = new THREE.Mesh(roundedBoxGeometry(BASE_TUNNEL_WIDTH * 0.9, 2.95, 0.38), rock);
    plate.name = 'face';
    plate.position.y = 1.55;
    plate.castShadow = true;
    plate.receiveShadow = true;
    this.miningFace.add(plate);
    for (let i = 0; i < 9; i += 1) {
      const shard = new THREE.Mesh(roundedBoxGeometry(0.06, 0.03, 0.42), crack);
      shard.position.set((random01('crack', 1, i, 0, 1) - 0.5) * 2.8, 0.8 + random01('crack', 1, i, 1, 1) * 1.7, -0.23);
      shard.rotation.z = (random01('crack', 1, i, 2, 1) - 0.5) * Math.PI;
      shard.scale.x = 5 + random01('crack', 1, i, 3, 1) * 9;
      this.miningFace.add(shard);
    }
    this.miningFace.add(this.drillLight);
    this.miningFace.visible = false;
    this.scene.add(this.miningFace);
  }

  private createParticles(): void {
    const dustMaterial = new THREE.MeshBasicMaterial({ color: '#bfa48a', transparent: true, opacity: 0, depthWrite: false });
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffdf7b', transparent: true, opacity: 0, depthWrite: false });
    const particleGeometry = new THREE.SphereGeometry(0.085, 6, 6);
    for (let i = 0; i < 180; i += 1) {
      const material = i % 7 === 0 ? sparkMaterial.clone() : dustMaterial.clone();
      const mesh = new THREE.Mesh(particleGeometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1, active: false, spin: 0, kind: 'dust' });
    }
  }

  private updateEnvironment(playerPosition: Vec2): void {
    const save = this.simulation.getSave();
    this.randomSeed = save.seed;
    this.randomGenerationVersion = save.generationVersion;
    const radius = QUALITY_RENDER_RADIUS[this.settings.quality];
    const undergroundScale = this.settings.quality === 'LOW' ? 0.46 : this.settings.quality === 'MEDIUM' ? 0.55 : 0.65;
    const rangeX = Math.max(5, Math.floor(radius.x * undergroundScale));
    const rangeY = Math.max(8, Math.floor(radius.y * undergroundScale + 5));
    const capacity = (rangeX * 2 + 1) * (rangeY * 2 + 1);
    this.ensureEnvironmentCapacity(capacity + 140);
    this.beginInstancing();

    const activeChunks = new Set<string>();
    const startY = Math.max(0, playerPosition.y - Math.floor(rangeY * 0.55));
    const endY = playerPosition.y + rangeY;

    for (let y = startY; y <= endY; y += 1) {
      for (let x = playerPosition.x - rangeX; x <= playerPosition.x + rangeX; x += 1) {
        activeChunks.add(`${floorDiv(x, CHUNK_SIZE)},${floorDiv(y, CHUNK_SIZE)}`);
        const tile = this.simulation.getResolvedTile(x, y);
        if (!this.isOpenSpace(tile)) continue;
        if (y === 0 && Math.abs(x) < 7) continue;
        this.addTunnelCell(tile);
      }
    }

    this.endInstancing();
    this.simulation.setActiveChunkCount(activeChunks.size);
  }

  private addTunnelCell(tile: ResolvedTile): void {
    const center = gridToWorld(tile);
    const isCave = tile.cave || tile.material === 'waterPocket';
    const height = this.tunnelHeight(tile.x, tile.y, isCave);
    const width = this.tunnelWidth(tile.x, tile.y, isCave);
    const floorMesh = this.instancedMeshes.get('floor');
    const ceilingMesh = this.instancedMeshes.get('ceiling');

    const floorLift = (this.random(tile.x, tile.y, 9) - 0.5) * 0.08;
    if (floorMesh) {
      this.addInstance(
        floorMesh,
        new THREE.Vector3(center.x, floorLift - 0.08, center.z),
        new THREE.Quaternion(),
        new THREE.Vector3(width * 1.08, 0.18, width * 1.08),
      );
    }

    if (ceilingMesh && tile.y > 0) {
      this.addInstance(
        ceilingMesh,
        new THREE.Vector3(center.x, height + (this.random(tile.x, tile.y, 10) - 0.5) * 0.22, center.z),
        new THREE.Quaternion(),
        new THREE.Vector3(width * 1.06, 0.38, width * 1.06),
      );
    }

    this.addBoundaryWalls(tile, height, width);
    this.addProps(tile, height, width);
  }

  private addBoundaryWalls(tile: ResolvedTile, height: number, width: number): void {
    const center = gridToWorld(tile);
    const dirs: { dx: number; dy: number; yaw: number; side: 'x' | 'z' }[] = [
      { dx: -1, dy: 0, yaw: 0, side: 'x' },
      { dx: 1, dy: 0, yaw: 0, side: 'x' },
      { dx: 0, dy: -1, yaw: Math.PI / 2, side: 'z' },
      { dx: 0, dy: 1, yaw: Math.PI / 2, side: 'z' },
    ];

    for (const dir of dirs) {
      const neighbor = this.simulation.getResolvedTile(tile.x + dir.dx, tile.y + dir.dy);
      if (this.isOpenSpace(neighbor)) continue;
      const material = this.wallMaterialFor(neighbor.material);
      const mesh = this.wallMeshes.get(material);
      if (!mesh) continue;
      const rough = this.random(tile.x + dir.dx, tile.y + dir.dy, 13);
      const thickness = 0.5 + rough * 0.38;
      const wallHeight = height + (rough - 0.5) * 0.5;
      const offset = (this.random(tile.x, tile.y, 17 + dir.dx * 3 + dir.dy * 5) - 0.5) * 0.24;
      const pos = new THREE.Vector3(center.x, wallHeight * 0.5 - 0.02, center.z);
      if (dir.side === 'x') {
        pos.x += dir.dx * (width * 0.5 + thickness * 0.24) + offset * dir.dx;
        this.quaternion.setFromEuler(new THREE.Euler(0, 0, (rough - 0.5) * 0.035));
        this.scale.set(thickness, wallHeight, CELL_SIZE * (tile.cave ? 1.22 : 1.05));
      } else {
        pos.z += dir.dy * (width * 0.5 + thickness * 0.24) + offset * dir.dy;
        this.quaternion.setFromEuler(new THREE.Euler(0, 0, (rough - 0.5) * 0.035));
        this.scale.set(CELL_SIZE * (tile.cave ? 1.22 : 1.05), wallHeight, thickness);
      }
      this.addInstance(mesh, pos, this.quaternion, this.scale);
      this.addWallDiamondFragments(tile, neighbor, dir, pos, wallHeight, width);
      this.addWallResourceVeins(tile, neighbor, dir, pos, wallHeight);
    }
  }

  private addWallDiamondFragments(
    tile: ResolvedTile,
    neighbor: ResolvedTile,
    dir: { dx: number; dy: number; side: 'x' | 'z' },
    wallPosition: THREE.Vector3,
    wallHeight: number,
    tunnelWidth: number,
  ): void {
    if (tile.y <= 0) return;
    const shardMesh = this.instancedMeshes.get('diamondShard');
    const glimmerMesh = this.instancedMeshes.get('diamondGlimmer');
    if (!shardMesh) return;

    const realDiamondHint = neighbor.resource === 'diamond' && neighbor.discovered;
    const crystalWall = neighbor.material === 'crystal';
    const deepGlint = neighbor.material === 'deepRock' || neighbor.material === 'granite' || neighbor.material === 'hardRock';
    const decorativeGlint = crystalWall
      ? this.random(tile.x + dir.dx, tile.y + dir.dy, 191) > 0.55
      : deepGlint && this.random(tile.x + dir.dx, tile.y + dir.dy, 193) > 0.965;
    const starterShowcaseGlint = tile.y > 0 && tile.y <= 5 && Math.abs(tile.x) <= 2 && this.random(tile.x + dir.dx, tile.y + dir.dy, 195) > 0.68;

    if (!realDiamondHint && !decorativeGlint && !starterShowcaseGlint) return;

    const clusterCount = realDiamondHint ? 5 : crystalWall ? 3 : starterShowcaseGlint ? 2 : 1;
    const wallNormal = new THREE.Vector3(dir.dx, 0, dir.dy).normalize();
    const along = dir.side === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < clusterCount; i += 1) {
      const localA = (this.random(tile.x, tile.y, 201 + i) - 0.5) * CELL_SIZE * (tile.cave ? 0.92 : 0.66);
      const localY = 0.7 + this.random(tile.x, tile.y, 211 + i) * Math.max(1, wallHeight - 1.0);
      const protrude = 0.09 + this.random(tile.x, tile.y, 221 + i) * 0.12;
      const pos = wallPosition
        .clone()
        .add(along.clone().multiplyScalar(localA))
        .add(wallNormal.clone().multiplyScalar(protrude));
      pos.y = localY;

      this.quaternion.setFromEuler(
        new THREE.Euler(
          (this.random(tile.x, tile.y, 231 + i) - 0.5) * Math.PI,
          Math.atan2(wallNormal.x, wallNormal.z) + (this.random(tile.x, tile.y, 241 + i) - 0.5) * 0.9,
          this.random(tile.x, tile.y, 251 + i) * Math.PI,
        ),
      );

      const base = realDiamondHint ? 0.34 : 0.18 + this.random(tile.x, tile.y, 261 + i) * 0.15;
      const heightScale = realDiamondHint ? 0.62 : 0.28 + this.random(tile.x, tile.y, 271 + i) * 0.24;
      const depth = Math.max(0.04, tunnelWidth * 0.012);
      this.addInstance(shardMesh, pos, this.quaternion, new THREE.Vector3(base, heightScale, depth));

      if (glimmerMesh) {
        const glimmerPosition = pos.clone().add(wallNormal.clone().multiplyScalar(0.018));
        const wallQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), wallNormal);
        const spinQuat = new THREE.Quaternion().setFromAxisAngle(wallNormal, this.random(tile.x, tile.y, 281 + i) * Math.PI);
        wallQuat.multiply(spinQuat);
        const glimmerSize = realDiamondHint ? 0.72 + this.random(tile.x, tile.y, 291 + i) * 0.42 : 0.35 + this.random(tile.x, tile.y, 301 + i) * 0.28;
        this.addInstance(glimmerMesh, glimmerPosition, wallQuat, new THREE.Vector3(glimmerSize, glimmerSize * 0.28, 1));
      }
    }
  }

  private addWallResourceVeins(
    tile: ResolvedTile,
    neighbor: ResolvedTile,
    dir: { dx: number; dy: number; side: 'x' | 'z' },
    wallPosition: THREE.Vector3,
    wallHeight: number,
  ): void {
    if (!neighbor.resource || !neighbor.discovered || neighbor.resource === 'diamond') return;

    const meshName: InstancedName | undefined = neighbor.resource.startsWith('gold')
      ? 'goldVein'
      : neighbor.resource === 'quartz'
        ? 'quartzVein'
        : neighbor.resource === 'rareMineral'
          ? 'rareMineralVein'
          : undefined;
    if (!meshName) return;
    const veinMesh = this.instancedMeshes.get(meshName);
    if (!veinMesh) return;

    const wallNormal = new THREE.Vector3(dir.dx, 0, dir.dy).normalize();
    const along = dir.side === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const pieces = neighbor.resource === 'goldLarge' ? 7 : neighbor.resource === 'goldMedium' ? 5 : 3;

    for (let i = 0; i < pieces; i += 1) {
      const pos = wallPosition
        .clone()
        .add(along.clone().multiplyScalar((this.random(tile.x, tile.y, 331 + i) - 0.5) * CELL_SIZE * 0.62))
        .add(wallNormal.clone().multiplyScalar(0.14));
      pos.y = 0.62 + this.random(tile.x, tile.y, 341 + i) * Math.max(0.9, wallHeight - 1.05);
      this.quaternion.setFromEuler(
        new THREE.Euler(
          this.random(tile.x, tile.y, 351 + i) * Math.PI,
          Math.atan2(wallNormal.x, wallNormal.z) + (this.random(tile.x, tile.y, 361 + i) - 0.5) * 0.7,
          this.random(tile.x, tile.y, 371 + i) * Math.PI,
        ),
      );
      const size = 0.18 + this.random(tile.x, tile.y, 381 + i) * (neighbor.resource.startsWith('gold') ? 0.34 : 0.26);
      this.addInstance(veinMesh, pos, this.quaternion, new THREE.Vector3(size * 1.25, size, size * 0.36));
    }
  }

  private addProps(tile: ResolvedTile, height: number, width: number): void {
    const center = gridToWorld(tile);
    const y = tile.y;
    const openUp = this.isOpenSpace(this.simulation.getResolvedTile(tile.x, tile.y - 1));
    const openDown = this.isOpenSpace(this.simulation.getResolvedTile(tile.x, tile.y + 1));
    const openLeft = this.isOpenSpace(this.simulation.getResolvedTile(tile.x - 1, tile.y));
    const openRight = this.isOpenSpace(this.simulation.getResolvedTile(tile.x + 1, tile.y));
    const alongZ = (openUp || openDown) && !(openLeft || openRight);
    const alongX = (openLeft || openRight) && !(openUp || openDown);
    const dominantZ = alongZ || (!alongX && this.random(tile.x, tile.y, 19) > 0.35);

    if (y > 0 && (this.random(tile.x, tile.y, 21) > 0.74 || tile.material === 'abandoned')) {
      this.addRails(center, dominantZ);
    }

    if (y > 0 && !tile.cave && this.random(tile.x, tile.y, 23) > 0.84) {
      this.addSupport(center, dominantZ, height, width);
    }

    if (y > 0 && this.random(tile.x, tile.y, 25) > 0.62) {
      const rockMesh = this.instancedMeshes.get('rock');
      if (rockMesh) {
        this.quaternion.setFromEuler(new THREE.Euler(
          this.random(tile.x, tile.y, 26) * Math.PI,
          this.random(tile.x, tile.y, 27) * Math.PI,
          this.random(tile.x, tile.y, 28) * Math.PI,
        ));
        this.addInstance(
          rockMesh,
          new THREE.Vector3(center.x + (this.random(tile.x, tile.y, 29) - 0.5) * width * 0.55, 0.18, center.z + (this.random(tile.x, tile.y, 30) - 0.5) * width * 0.55),
          this.quaternion,
          new THREE.Vector3(0.28 + this.random(tile.x, tile.y, 31) * 0.55, 0.2 + this.random(tile.x, tile.y, 32) * 0.4, 0.28 + this.random(tile.x, tile.y, 33) * 0.55),
        );
      }
    }

    if (y > 0 && (tile.cave || this.random(tile.x, tile.y, 34) > 0.88)) {
      const formationMesh = this.instancedMeshes.get(tile.cave && this.random(tile.x, tile.y, 341) > 0.45 ? 'tallFormation' : 'largeRock');
      if (formationMesh) {
        this.quaternion.setFromEuler(new THREE.Euler(0, this.random(tile.x, tile.y, 342) * Math.PI * 2, 0));
        const s = 0.62 + this.random(tile.x, tile.y, 343) * (tile.cave ? 1.05 : 0.45);
        this.addInstance(
          formationMesh,
          new THREE.Vector3(center.x + (this.random(tile.x, tile.y, 344) - 0.5) * width * 0.62, 0.32, center.z + (this.random(tile.x, tile.y, 345) - 0.5) * width * 0.62),
          this.quaternion,
          new THREE.Vector3(s, tile.cave ? s * (1.25 + this.random(tile.x, tile.y, 346)) : s * 0.72, s * 0.82),
        );
      }
    }

    if (y > 0 && this.random(tile.x, tile.y, 35) > 0.7) {
      const rubbleMesh = this.instancedMeshes.get('rubble');
      if (rubbleMesh) {
        const count = this.random(tile.x, tile.y, 36) > 0.86 ? 3 : 1;
        for (let i = 0; i < count; i += 1) {
          this.quaternion.setFromEuler(new THREE.Euler(
            this.random(tile.x, tile.y, 37 + i) * Math.PI,
            this.random(tile.x, tile.y, 41 + i) * Math.PI,
            this.random(tile.x, tile.y, 45 + i) * Math.PI,
          ));
          const s = 0.18 + this.random(tile.x, tile.y, 49 + i) * 0.28;
          this.addInstance(
            rubbleMesh,
            new THREE.Vector3(center.x + (this.random(tile.x, tile.y, 53 + i) - 0.5) * width, 0.1, center.z + (this.random(tile.x, tile.y, 57 + i) - 0.5) * width),
            this.quaternion,
            new THREE.Vector3(s, s * 0.72, s),
          );
        }
      }
    }

    if ((tile.material === 'crystal' || tile.cave) && this.random(tile.x, tile.y, 61) > 0.72) {
      const crystalMesh = this.instancedMeshes.get('crystalProp');
      if (crystalMesh) {
        const s = 0.32 + this.random(tile.x, tile.y, 62) * 0.64;
        this.quaternion.setFromEuler(new THREE.Euler(0, this.random(tile.x, tile.y, 63) * Math.PI, 0));
        this.addInstance(
          crystalMesh,
          new THREE.Vector3(center.x + (this.random(tile.x, tile.y, 64) - 0.5) * width * 0.65, 0.45, center.z + (this.random(tile.x, tile.y, 65) - 0.5) * width * 0.65),
          this.quaternion,
          new THREE.Vector3(s * 0.5, s, s * 0.5),
        );
      }
    }

    if (y > 0 && this.random(tile.x, tile.y, 67) > 0.9) {
      this.addPipeOrCable(center, dominantZ, height, width, this.random(tile.x, tile.y, 68) > 0.45 ? 'pipe' : 'cable');
    }

    if (tile.material === 'abandoned' && this.random(tile.x, tile.y, 71) > 0.82) {
      const barrel = this.instancedMeshes.get('barrel');
      if (barrel) {
        this.quaternion.setFromEuler(new THREE.Euler(0, this.random(tile.x, tile.y, 72) * Math.PI, 0));
        this.addInstance(
          barrel,
          new THREE.Vector3(center.x + (this.random(tile.x, tile.y, 73) - 0.5) * width * 0.45, 0.5, center.z + (this.random(tile.x, tile.y, 74) - 0.5) * width * 0.45),
          this.quaternion,
          new THREE.Vector3(0.72, 0.92, 0.72),
        );
      }
    }
  }

  private addRails(center: THREE.Vector3, alongZ: boolean): void {
    const rail = this.instancedMeshes.get('rail');
    if (!rail) return;
    const length = CELL_SIZE * 1.08;
    const offset = 0.58;
    const railScale = alongZ ? new THREE.Vector3(0.08, 0.08, length) : new THREE.Vector3(length, 0.08, 0.08);
    const sleeperScale = alongZ ? new THREE.Vector3(1.55, 0.08, 0.14) : new THREE.Vector3(0.14, 0.08, 1.55);
    const offsets = alongZ ? [new THREE.Vector3(-offset, 0.08, 0), new THREE.Vector3(offset, 0.08, 0)] : [new THREE.Vector3(0, 0.08, -offset), new THREE.Vector3(0, 0.08, offset)];
    for (const off of offsets) this.addInstance(rail, center.clone().add(off), new THREE.Quaternion(), railScale);
    for (let i = -1; i <= 1; i += 1) {
      const sleeperPos = center.clone();
      if (alongZ) sleeperPos.z += i * 1.25;
      else sleeperPos.x += i * 1.25;
      sleeperPos.y = 0.05;
      this.addInstance(rail, sleeperPos, new THREE.Quaternion(), sleeperScale);
    }
  }

  private addSupport(center: THREE.Vector3, alongZ: boolean, height: number, width: number): void {
    const support = this.instancedMeshes.get('support');
    if (!support) return;
    const side = width * 0.45;
    const positions = alongZ
      ? [new THREE.Vector3(-side, height * 0.45, 0), new THREE.Vector3(side, height * 0.45, 0)]
      : [new THREE.Vector3(0, height * 0.45, -side), new THREE.Vector3(0, height * 0.45, side)];
    const postScale = new THREE.Vector3(0.22, height * 0.9, 0.22);
    for (const off of positions) this.addInstance(support, center.clone().add(off), new THREE.Quaternion(), postScale);
    const beamScale = alongZ ? new THREE.Vector3(width * 1.02, 0.22, 0.25) : new THREE.Vector3(0.25, 0.22, width * 1.02);
    this.addInstance(support, new THREE.Vector3(center.x, height - 0.15, center.z), new THREE.Quaternion(), beamScale);
  }

  private addPipeOrCable(center: THREE.Vector3, alongZ: boolean, height: number, width: number, kind: 'pipe' | 'cable'): void {
    const mesh = this.instancedMeshes.get(kind);
    if (!mesh) return;
    const wallSide = this.random(Math.round(center.x), Math.round(center.z), kind === 'pipe' ? 79 : 81) > 0.5 ? 1 : -1;
    const pos = center.clone();
    pos.y = height * (kind === 'pipe' ? 0.68 : 0.82);
    if (alongZ) pos.x += wallSide * width * 0.49;
    else pos.z += wallSide * width * 0.49;
    const rotation = alongZ ? new THREE.Euler(Math.PI / 2, 0, 0) : new THREE.Euler(0, 0, Math.PI / 2);
    this.quaternion.setFromEuler(rotation);
    const thickness = kind === 'pipe' ? 0.12 : 0.045;
    this.addInstance(mesh, pos, this.quaternion, new THREE.Vector3(thickness, CELL_SIZE * 1.06, thickness));
  }

  private updateExcavator(facing: Direction, miningJob: MiningJob | undefined, deltaSeconds: number): void {
    const movementAmount = this.previousLogicalPosition
      ? Math.hypot(this.visualTarget.x - this.visualPosition.x, this.visualTarget.z - this.visualPosition.z) / CELL_SIZE
      : 0;
    const isMoving = movementAmount > 0.015;
    const idleBob = this.settings.reducedMotion ? 0 : Math.sin(performance.now() * 0.006) * 0.018;
    const drillShake = miningJob && !this.settings.reducedMotion ? Math.sin(performance.now() * 0.05) * 0.045 : 0;

    const driveBounce = isMoving && !this.settings.reducedMotion ? Math.sin(performance.now() * 0.014) * 0.045 : 0;
    this.excavator.position.set(this.visualPosition.x, VEHICLE_Y + idleBob + driveBounce + drillShake, this.visualPosition.z);
    this.excavator.rotation.y = this.currentYaw;
    this.excavator.rotation.x = isMoving && !this.settings.reducedMotion ? Math.sin(performance.now() * 0.012) * 0.018 : 0;
    this.excavator.rotation.z = miningJob && !this.settings.reducedMotion ? Math.sin(performance.now() * 0.07) * 0.012 : Math.sin(performance.now() * 0.004) * 0.004;
    this.chassis.rotation.x += ((isMoving ? -0.025 : 0) - this.chassis.rotation.x) * Math.min(1, deltaSeconds * 7);

    const trackDirection = facing === 'up' || facing === 'left' ? -1 : 1;
    for (const wheel of this.trackWheels) {
      wheel.rotation.x += (isMoving ? 12 : 1.2) * deltaSeconds * trackDirection;
    }
    for (const tread of this.trackTreads) {
      const baseZ = (tread.userData.baseZ as number) ?? tread.position.z;
      const baseY = (tread.userData.baseY as number) ?? tread.position.y;
      const offset = isMoving ? Math.sin(performance.now() * 0.012 + baseZ * 3) * 0.035 : 0;
      tread.position.y = baseY + offset;
      tread.rotation.x = isMoving ? Math.sin(performance.now() * 0.01 + baseZ) * 0.05 : 0;
    }
    this.beaconLight.intensity = 0.35 + Math.max(0, Math.sin(performance.now() * 0.006)) * 0.65;
    for (const exhaust of this.exhaustPieces) {
      exhaust.rotation.z = -0.06 + Math.sin(performance.now() * 0.007) * 0.018;
    }

    if (miningJob) {
      const progress = Math.min(1, miningJob.elapsed / miningJob.duration);
      this.drillAssembly.position.z = 0.12 + Math.sin(progress * Math.PI) * 0.22;
      this.drillAssembly.rotation.x = -0.05 - progress * 0.08;
      this.drillBit.rotation.z += deltaSeconds * (28 + progress * 38);
      for (const piston of this.hydraulicPistons) piston.scale.y = 1 + progress * 0.16 + Math.sin(performance.now() * 0.045) * 0.035;
    } else {
      this.drillAssembly.position.z += (0 - this.drillAssembly.position.z) * Math.min(1, deltaSeconds * 8);
      this.drillAssembly.rotation.x += (0 - this.drillAssembly.rotation.x) * Math.min(1, deltaSeconds * 8);
      this.drillBit.rotation.z += deltaSeconds * 2;
      for (const piston of this.hydraulicPistons) piston.scale.y += (1 - piston.scale.y) * Math.min(1, deltaSeconds * 8);
    }

    if (isMoving && !this.settings.reducedMotion && Math.random() > 0.72) {
      const back = DIR_VECTOR[facing].clone().multiplyScalar(-1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.currentYaw - YAW_BY_DIRECTION[facing]);
      this.spawnParticle(this.visualPosition.clone().add(back).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.35, (Math.random() - 0.5) * 1.5)), 'dust', 0.58);
    }
  }

  private updateMiningFace(miningJob: MiningJob | undefined, deltaSeconds: number): void {
    if (!miningJob) {
      this.miningFace.visible = false;
      this.drillLight.intensity = Math.max(0, this.drillLight.intensity - deltaSeconds * 8);
      return;
    }

    const progress = Math.min(1, miningJob.elapsed / miningJob.duration);
    const target = gridToWorld(miningJob.target);
    const player = this.simulation.snapshot().player;
    const facing = player.facing;
    const forward = DIR_VECTOR[facing].clone();
    const wallPosition = target.clone().add(forward.clone().multiplyScalar(-CELL_SIZE * 0.46));
    this.miningFace.visible = true;
    this.miningFace.position.set(wallPosition.x, 0, wallPosition.z);
    this.miningFace.rotation.y = YAW_BY_DIRECTION[facing];
    this.miningFace.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.035);

    const face = this.miningFace.getObjectByName('face') as THREE.Mesh | undefined;
    if (face) {
      const material = face.material as THREE.MeshStandardMaterial;
      material.opacity = 1;
      material.transparent = progress > 0.72;
      material.opacity = progress > 0.72 ? 1 - (progress - 0.72) / 0.28 : 1;
      material.color.lerp(this.tmpColor.set('#3a302b'), progress * 0.025);
    }

    this.drillLight.position.set(0, 1.55, -0.25);
    this.drillLight.intensity = 1.4 + progress * 3.6 + Math.sin(performance.now() * 0.06) * 0.55;

    if (!this.settings.reducedMotion) {
      this.shakeTime = Math.max(this.shakeTime, 0.08);
      this.shakeStrength = Math.max(this.shakeStrength, 0.026 + progress * 0.035);
      const burstCount = progress > 0.65 ? 3 : 1;
      for (let i = 0; i < burstCount; i += 1) {
        if (Math.random() > 0.38) {
          const spawn = wallPosition.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.8, 1.1 + Math.random() * 1.35, (Math.random() - 0.5) * 1.8));
          this.spawnParticle(spawn, Math.random() > 0.86 ? 'spark' : 'dust', 0.75 + progress * 0.4);
        }
      }
    }
  }

  private updateScanner(snapshot: ReturnType<GameSimulation['snapshot']>, deltaSeconds: number): void {
    const scansUsed = snapshot.player.stats.scansUsed;
    if (scansUsed !== this.previousScanCount) {
      this.previousScanCount = scansUsed;
      this.spawnScanPulse(scannerLevelValue(snapshot.scannerResult?.level));
    }

    for (let i = this.scanPulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.scanPulses[i];
      pulse.life += deltaSeconds;
      const t = pulse.life / pulse.maxLife;
      const scale = 1.2 + t * (7 + pulse.level * 6);
      pulse.mesh.position.set(this.visualPosition.x, 0.14, this.visualPosition.z);
      pulse.mesh.scale.set(scale, scale, scale);
      const material = pulse.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, (1 - t) * (0.18 + pulse.level * 0.42));
      if (pulse.life >= pulse.maxLife) {
        this.scene.remove(pulse.mesh);
        pulse.mesh.geometry.dispose();
        material.dispose();
        this.scanPulses.splice(i, 1);
      }
    }

    const material = this.directionIndicator.material as THREE.MeshBasicMaterial;
    if (!snapshot.scannerResult || snapshot.scannerResult.level === 'none') {
      material.opacity = Math.max(0, material.opacity - deltaSeconds * 1.8);
      return;
    }

    const dir = this.directionFromScanner(snapshot.scannerResult.direction);
    const strength = scannerLevelValue(snapshot.scannerResult.level);
    this.directionIndicator.position.copy(this.visualPosition).add(dir.clone().multiplyScalar(3.3 + strength * 1.6));
    this.directionIndicator.position.y = 0.2;
    this.directionIndicator.rotation.y = Math.atan2(dir.x, dir.z);
    this.directionIndicator.scale.setScalar(0.8 + strength * 0.8 + Math.sin(performance.now() * 0.008) * 0.08);
    material.opacity = 0.28 + strength * 0.44;
  }

  private spawnScanPulse(level: number): void {
    if (this.settings.reducedMotion) return;
    const ringGeometry = new THREE.RingGeometry(0.9, 1.02, 96);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#7df8ff', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.visualPosition.x, 0.16, this.visualPosition.z);
    this.scene.add(ring);
    this.scanPulses.push({ mesh: ring, life: 0, maxLife: 1.25 - level * 0.35, level });
    for (let i = 0; i < 18 + level * 18; i += 1) {
      const angle = (i / (18 + level * 18)) * Math.PI * 2;
      const spawn = this.visualPosition.clone().add(new THREE.Vector3(Math.sin(angle) * 1.6, 0.45 + Math.random() * 0.8, Math.cos(angle) * 1.6));
      this.spawnParticle(spawn, 'scanner', 0.45 + level * 0.35);
    }
  }

  private updateAmbientMotion(playerPosition: Vec2, deltaSeconds: number): void {
    if (this.settings.reducedMotion) return;
    const underground = playerPosition.y > 0;
    const chance = underground ? 0.28 : 0.12;
    if (Math.random() < chance * deltaSeconds * 8) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.8 + Math.random() * 6.5;
      const origin = this.visualPosition.clone().add(new THREE.Vector3(Math.sin(angle) * radius, 0.7 + Math.random() * 2.5, Math.cos(angle) * radius));
      this.spawnParticle(origin, 'mote', 0.16 + Math.random() * 0.12);
    }
  }

  private updateParticles(deltaSeconds: number, miningJob: MiningJob | undefined): void {
    for (const particle of this.particlePool) {
      if (!particle.active) continue;
      particle.life += deltaSeconds;
      particle.mesh.position.addScaledVector(particle.velocity, deltaSeconds);
      particle.velocity.y -= deltaSeconds * 1.8;
      particle.mesh.rotation.y += particle.spin * deltaSeconds;
      const t = particle.life / particle.maxLife;
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = particle.kind === 'mote' ? 0.22 : particle.kind === 'spark' ? 1 : miningJob ? 0.72 : 0.46;
      material.opacity = Math.max(0, (1 - t) * baseOpacity);
      particle.mesh.scale.setScalar(Math.max(0.02, 1 - t * 0.64));
      if (particle.life >= particle.maxLife) {
        particle.active = false;
        particle.mesh.visible = false;
      }
    }
  }

  private spawnParticle(origin: THREE.Vector3, kind: 'dust' | 'spark' | 'scanner' | 'mote', intensity: number): void {
    const particle = this.particlePool.find((candidate) => !candidate.active);
    if (!particle) return;
    particle.active = true;
    particle.kind = kind;
    particle.life = 0;
    particle.maxLife = kind === 'spark' ? 0.28 + Math.random() * 0.18 : kind === 'scanner' ? 0.9 : kind === 'mote' ? 2.4 + Math.random() * 1.4 : 0.62 + Math.random() * 0.55;
    particle.velocity.set((Math.random() - 0.5) * 1.6, 0.25 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6).multiplyScalar(intensity);
    if (kind === 'spark') particle.velocity.y += 1.1;
    if (kind === 'mote') particle.velocity.y = 0.06 + Math.random() * 0.12;
    particle.mesh.position.copy(origin);
    particle.mesh.scale.setScalar(kind === 'spark' ? 0.48 : kind === 'scanner' ? 0.33 : kind === 'mote' ? 0.42 : 1);
    const material = particle.mesh.material as THREE.MeshBasicMaterial;
    material.color.set(kind === 'spark' ? '#ffde79' : kind === 'scanner' ? '#7df8ff' : kind === 'mote' ? '#ffe4a2' : '#bfa48a');
    material.opacity = kind === 'spark' ? 1 : kind === 'mote' ? 0.22 : 0.58;
    particle.spin = (Math.random() - 0.5) * 6;
    particle.mesh.visible = true;
  }

  private detectNotificationShake(notifications: GameNotification[]): void {
    for (const notification of notifications) {
      if (this.seenNotifications.has(notification.id)) continue;
      this.seenNotifications.add(notification.id);
      if (notification.tone === 'danger') this.triggerShake(0.55, 0.42);
      if (notification.tone === 'rare') this.triggerShake(0.75, 0.32);
      if (notification.tone === 'success') this.triggerShake(0.2, 0.08);
    }
  }

  private detectDiscoveryEffects(): void {
    const save = this.simulation.getSave();
    for (const entry of save.discoveredLog.slice(0, 3)) {
      if (this.seenDiscoveries.has(entry.id)) continue;
      this.seenDiscoveries.add(entry.id);
      if (entry.kind in RESOURCE_INFO || entry.kind === 'cave' || entry.kind === 'structure') {
        this.spawnDiscoveryEffect(entry.kind, new THREE.Vector3(entry.x * CELL_SIZE, 1.1, entry.y * CELL_SIZE));
      }
    }
  }

  private spawnDiscoveryEffect(kind: string, position: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.copy(position);
    const isDiamond = kind === 'diamond';
    const isArtifact = kind === 'artifact';
    const isGold = kind.startsWith('gold');
    const color = kind in RESOURCE_INFO ? RESOURCE_INFO[kind as ResourceKind].color : '#8ef7ff';
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isDiamond ? 1.5 : isArtifact ? 0.9 : isGold ? 0.58 : 0.36,
      roughness: isDiamond ? 0.18 : 0.34,
      metalness: isGold ? 0.45 : 0.05,
      flatShading: true,
    });

    const chunks = isDiamond ? 1 : isGold ? 6 : 4;
    for (let i = 0; i < chunks; i += 1) {
      const geometry = isDiamond ? new THREE.OctahedronGeometry(0.72, 0) : isArtifact ? new THREE.IcosahedronGeometry(0.42, 0) : new THREE.DodecahedronGeometry(0.28 + Math.random() * 0.22, 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set((Math.random() - 0.5) * 1.8, Math.random() * 1.3, (Math.random() - 0.5) * 1.4);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = true;
      group.add(mesh);
    }

    const light = new THREE.PointLight(color, isDiamond ? 4.5 : isGold ? 2.4 : 1.7, isDiamond ? 13 : 8, 1.8);
    light.position.set(0, 1.0, 0);
    group.add(light);
    this.scene.add(group);
    this.discoveryEffects.push({ group, light, life: 0, maxLife: isDiamond ? 5.2 : 3.0, kind });
    this.triggerShake(isDiamond ? 0.92 : isGold ? 0.44 : 0.3, isDiamond ? 0.38 : 0.16);

    const particleCount = isDiamond ? 70 : isGold ? 34 : 22;
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (isDiamond ? 2.6 : 1.7);
      this.spawnParticle(position.clone().add(new THREE.Vector3(Math.sin(angle) * radius, Math.random() * 1.8, Math.cos(angle) * radius)), isDiamond ? 'scanner' : 'spark', isDiamond ? 1.2 : 0.75);
    }
  }

  private updateDiscoveryEffects(deltaSeconds: number): void {
    for (let i = this.discoveryEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.discoveryEffects[i];
      effect.life += deltaSeconds;
      const t = effect.life / effect.maxLife;
      effect.group.rotation.y += deltaSeconds * (effect.kind === 'diamond' ? 0.85 : 0.45);
      effect.group.position.y += Math.sin(performance.now() * 0.004) * 0.002;
      if (effect.light) effect.light.intensity *= 0.985;
      effect.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.transparent = true;
        material.opacity = Math.max(0, 1 - Math.max(0, t - 0.65) / 0.35);
      });
      if (effect.life >= effect.maxLife) {
        this.scene.remove(effect.group);
        effect.group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
            else material.dispose();
          }
        });
        this.discoveryEffects.splice(i, 1);
      }
    }
  }

  private updateCamera(deltaSeconds: number, facing: Direction, miningJob: MiningJob | undefined): void {
    const forward = DIR_VECTOR[facing].clone();
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.currentYaw - YAW_BY_DIRECTION[facing]);
    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    const underground = this.simulation.snapshot().player.position.y > 0;
    const distance = underground ? 6.25 : 7.4;
    const height = underground ? 3.45 : 4.35;
    const lookAhead = underground ? 4.85 : 5.9;
    const idleOrbit = !underground && !miningJob && !this.settings.reducedMotion ? Math.sin(performance.now() * 0.00045) * 1.1 : 0;
    const targetCamera = this.visualPosition
      .clone()
      .add(forward.clone().multiplyScalar(-distance))
      .add(side.clone().multiplyScalar(0.55 + idleOrbit))
      .add(new THREE.Vector3(0, height + Math.abs(idleOrbit) * 0.18, 0));
    const targetLook = this.visualPosition.clone().add(forward.clone().multiplyScalar(lookAhead)).add(new THREE.Vector3(0, 1.35, 0));

    const cameraEase = this.settings.reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 4.2);
    const lookEase = this.settings.reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 5.4);
    this.cameraPosition.lerp(targetCamera, cameraEase);
    this.lookAtPosition.lerp(targetLook, lookEase);

    let shake = new THREE.Vector3();
    if (this.shakeTime > 0 && !this.settings.reducedMotion) {
      this.shakeTime = Math.max(0, this.shakeTime - deltaSeconds);
      const fade = this.shakeTime;
      const drillBonus = miningJob ? 0.03 : 0;
      shake = new THREE.Vector3((Math.random() - 0.5) * this.shakeStrength, (Math.random() - 0.5) * this.shakeStrength * 0.7, (Math.random() - 0.5) * this.shakeStrength)
        .multiplyScalar(1 + fade + drillBonus);
      this.shakeStrength *= 0.94;
    }

    this.camera.position.copy(this.cameraPosition).add(shake);
    this.camera.lookAt(this.lookAtPosition);
  }

  private triggerShake(duration: number, strength: number): void {
    if (this.settings.reducedMotion) return;
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  private beginInstancing(): void {
    for (const mesh of this.instancedMeshes.values()) mesh.userData.next = 0;
    for (const mesh of this.wallMeshes.values()) mesh.userData.next = 0;
  }

  private endInstancing(): void {
    for (const mesh of this.instancedMeshes.values()) {
      mesh.count = mesh.userData.next as number;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of this.wallMeshes.values()) {
      mesh.count = mesh.userData.next as number;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addInstance(mesh: THREE.InstancedMesh, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3): void {
    const index = mesh.userData.next as number;
    const capacity = mesh.userData.capacity as number;
    if (index >= capacity) return;
    this.matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.userData.next = index + 1;
  }

  private tunnelHeight(x: number, y: number, isCave: boolean): number {
    if (y === 0) return 4.8;
    const base = isCave ? 5.1 : BASE_TUNNEL_HEIGHT;
    return base + (this.random(x, y, 3) - 0.5) * (isCave ? 1.4 : 0.56);
  }

  private tunnelWidth(x: number, y: number, isCave: boolean): number {
    const base = isCave ? 5.8 : BASE_TUNNEL_WIDTH;
    return base + (this.random(x, y, 5) - 0.5) * (isCave ? 1.6 : 0.58);
  }

  private isOpenSpace(tile: ResolvedTile): boolean {
    if (tile.y < 0) return false;
    return tile.mined || tile.traversable || tile.material === 'surface' || tile.material === 'air' || tile.material === 'abandoned' || tile.material === 'waterPocket';
  }

  private wallMaterialFor(material: TerrainMaterial): RockMaterial {
    if (isRockMaterial(material)) return material;
    return 'dirt';
  }

  private random(x: number, y: number, salt: number): number {
    return random01(this.randomSeed, this.randomGenerationVersion, x, y, salt);
  }

  private directionFromScanner(direction: string): THREE.Vector3 {
    const vector = new THREE.Vector3();
    if (direction.includes('east')) vector.x += 1;
    if (direction.includes('west')) vector.x -= 1;
    if (direction.includes('deeper')) vector.z += 1;
    if (direction.includes('surface')) vector.z -= 1;
    if (vector.lengthSq() === 0) vector.copy(DIR_VECTOR[this.simulation.snapshot().player.facing]);
    return vector.normalize();
  }

  private pixelRatioForQuality(quality: GameSettings['quality']): number {
    const deviceRatio = window.devicePixelRatio || 1;
    if (quality === 'LOW') return Math.min(0.85, deviceRatio);
    if (quality === 'MEDIUM') return Math.min(1.1, deviceRatio);
    if (quality === 'HIGH') return Math.min(1.45, deviceRatio);
    return Math.min(1.75, deviceRatio);
  }
}
