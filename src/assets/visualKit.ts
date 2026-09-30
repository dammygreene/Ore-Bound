import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function roundedBoxGeometry(width: number, height: number, depth: number, radius = 0.12, segments = 4): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, width * 0.45, height * 0.45, depth * 0.45));
}

export function chunkyRockGeometry(radius = 0.55, detail = 0): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const wobble = 1 + Math.sin(vertex.x * 4.7 + vertex.y * 2.1 + vertex.z * 3.3) * 0.09;
    vertex.x *= wobble * 1.08;
    vertex.y *= (1 + Math.cos(vertex.z * 3.8) * 0.08) * 0.82;
    vertex.z *= 1 + Math.sin(vertex.y * 5.1) * 0.07;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

export function stylizedWallGeometry(): THREE.BufferGeometry {
  const geometry = roundedBoxGeometry(1, 1, 1, 0.16, 3);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const frontInfluence = Math.max(0, vertex.z + 0.35);
    const strata = Math.sin(vertex.y * 7.5 + vertex.x * 2.5) * 0.025;
    const bulge = Math.sin(vertex.x * 5.2 + vertex.y * 3.1) * 0.04 * frontInfluence;
    vertex.z += strata + bulge;
    vertex.x += Math.sin(vertex.y * 4.1) * 0.012;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

export function mineralShardGeometry(radius = 0.5): THREE.BufferGeometry {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    vertex.y *= 1.35;
    vertex.x *= 0.78;
    vertex.z *= 0.5;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function extrudedProfileGeometry(points: [number, number][], width: number, bevelSize: number, bevelSegments = 3): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments,
    steps: 1,
  });

  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

export function heroBodyGeometry(): THREE.BufferGeometry {
  return extrudedProfileGeometry(
    [
      [-1.32, -0.42],
      [0.95, -0.42],
      [1.24, -0.18],
      [1.16, 0.3],
      [0.72, 0.52],
      [-0.92, 0.5],
      [-1.36, 0.18],
    ],
    2.15,
    0.075,
    5,
  );
}

export function cabinShellGeometry(): THREE.BufferGeometry {
  return extrudedProfileGeometry(
    [
      [-0.62, -0.5],
      [0.44, -0.5],
      [0.58, 0.24],
      [0.28, 0.72],
      [-0.42, 0.72],
      [-0.72, 0.24],
    ],
    1.08,
    0.055,
    5,
  );
}

export function trackShellGeometry(): THREE.BufferGeometry {
  return extrudedProfileGeometry(
    [
      [-1.25, -0.21],
      [1.08, -0.21],
      [1.32, 0.02],
      [1.2, 0.34],
      [0.9, 0.48],
      [-1.02, 0.48],
      [-1.32, 0.25],
      [-1.38, -0.02],
    ],
    0.72,
    0.06,
    4,
  );
}

export function drillCorkscrewGeometry(): THREE.BufferGeometry {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.9, 14));
  core.rotation.x = Math.PI / 2;
  group.add(core);

  for (let i = 0; i < 8; i += 1) {
    const blade = new THREE.Mesh(roundedBoxGeometry(0.055, 0.36, 0.18, 0.025, 2));
    const angle = i * 0.78;
    blade.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, -0.34 + i * 0.1);
    blade.rotation.set(Math.PI / 2, 0, angle + Math.PI / 4);
    group.add(blade);
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.52, 18));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.63;
  group.add(tip);

  const geometries: THREE.BufferGeometry[] = [];
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.updateMatrixWorld();
    const clone = mesh.geometry.clone();
    clone.applyMatrix4(mesh.matrixWorld);
    geometries.push(clone);
  });

  // Manual merge to avoid adding a dependency on BufferGeometryUtils.
  const merged = geometries.length === 1 ? geometries[0] : mergeBufferGeometries(geometries);
  merged.computeVertexNormals();
  return merged;
}

function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const geometry of geometries) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = nonIndexed.getAttribute('position');
    const normal = nonIndexed.getAttribute('normal');
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      indices.push(vertexOffset + i);
    }
    vertexOffset += position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

export function makeCleanMaterial(options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.62, metalness: 0.08, ...options });
}

export function enableGameAssetShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}
