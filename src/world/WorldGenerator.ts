import { CHUNK_SIZE, GENERATION_VERSION, TERRAIN_INFO } from '../game/constants';
import type { HazardKind, ResourceKind, TerrainMaterial, TileBase } from '../game/types';
import { fractalNoise2D, random01 } from './prng';

export interface ChunkData {
  chunkX: number;
  chunkY: number;
  tiles: TileBase[];
}

function isStarterGold(x: number, y: number): ResourceKind | undefined {
  if (x === 2 && y === 2) return 'goldSmall';
  if (x === -3 && y === 4) return 'quartz';
  if (x === 4 && y === 5) return 'goldMedium';
  if (x === -7 && y === 9) return 'goldLarge';
  if (x === 8 && y === 11) return 'rareMineral';
  if (x === -10 && y === 13) return 'diamond';
  if (x === 11 && y === 7) return 'artifact';
  return undefined;
}

function starterHazard(x: number, y: number): HazardKind | undefined {
  if (x === 6 && y === 4) return 'gas';
  if (x === -5 && y === 8) return 'unstableRock';
  return undefined;
}

export class WorldGenerator {
  readonly seed: string;
  readonly generationVersion: number;

  constructor(seed: string, generationVersion = GENERATION_VERSION) {
    this.seed = seed;
    this.generationVersion = generationVersion;
  }

  generateChunk(chunkX: number, chunkY: number): ChunkData {
    const tiles: TileBase[] = [];
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;

    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        tiles.push(this.getTile(x, y));
      }
    }

    return { chunkX, chunkY, tiles };
  }

  getTile(x: number, y: number): TileBase {
    if (y < 0) {
      return {
        x,
        y,
        material: 'air',
        hardness: 0,
        traversable: true,
        cave: false,
        feature: 'sky',
      };
    }

    if (y === 0) {
      return {
        x,
        y,
        material: 'surface',
        hardness: 0,
        traversable: true,
        cave: false,
        feature: Math.abs(x) < 4 ? 'garage apron' : 'surface rail',
      };
    }

    const structure = this.structureAt(x, y);
    if (structure) {
      return {
        x,
        y,
        material: structure === 'water pocket' ? 'waterPocket' : 'abandoned',
        hardness: 0,
        traversable: true,
        cave: true,
        hazard: structure === 'water pocket' ? 'electrical' : undefined,
        feature: structure,
      };
    }

    const cave = this.isCave(x, y);
    if (cave) {
      const hazard = this.caveHazardAt(x, y);
      return {
        x,
        y,
        material: 'air',
        hardness: 0,
        traversable: true,
        cave: true,
        hazard,
        feature: hazard ? 'hazardous open pocket' : 'natural cave',
      };
    }

    const material = this.materialAt(x, y);
    const resource = this.resourceAt(x, y, material);
    const hazard = this.hazardAt(x, y, material);

    return {
      x,
      y,
      material,
      hardness: TERRAIN_INFO[material].hardness,
      traversable: false,
      cave: false,
      resource,
      hazard,
      feature: this.featureAt(x, y, material),
    };
  }

  private materialAt(x: number, y: number): TerrainMaterial {
    const geology = fractalNoise2D(this.seed, this.generationVersion, x, y, 24, 4, 11);
    const pocket = fractalNoise2D(this.seed, this.generationVersion, x + 53, y - 19, 10, 3, 17);
    const band = (Math.sin((y + 7) * 0.23) + Math.sin((x - y) * 0.07)) * 0.18;
    const mix = geology + pocket * 0.45 + band;

    if (pocket > 0.61 && y > 5) return 'crystal';
    if (y <= 2) return mix > 0.3 ? 'clay' : 'soil';
    if (y <= 6) {
      if (mix > 0.45) return 'limestone';
      if (mix < -0.45) return 'clay';
      return 'dirt';
    }
    if (y <= 13) {
      if (mix > 0.52) return 'granite';
      if (mix < -0.48) return 'limestone';
      return 'dirt';
    }
    if (mix > 0.42) return 'hardRock';
    if (mix < -0.5) return 'limestone';
    return y % 11 === 0 && Math.abs(geology) > 0.2 ? 'crystal' : 'deepRock';
  }

  private isCave(x: number, y: number): boolean {
    if (y < 4) return false;
    const broad = fractalNoise2D(this.seed, this.generationVersion, x, y, 18, 3, 29);
    const tunnel = Math.abs(fractalNoise2D(this.seed, this.generationVersion, x + 100, y - 80, 32, 2, 31));
    const local = random01(this.seed, this.generationVersion, x, y, 33);
    return (broad > 0.55 && local > 0.08) || (tunnel < 0.035 && y > 8);
  }

  private structureAt(x: number, y: number): string | undefined {
    if (y < 5) return undefined;

    const shaftLine = Math.abs(fractalNoise2D(this.seed, this.generationVersion, x, y, 40, 2, 41) - 0.16);
    const tunnelLine = Math.abs(fractalNoise2D(this.seed, this.generationVersion, x + 12, y, 28, 2, 43) + 0.21);
    const rare = random01(this.seed, this.generationVersion, x, y, 47);

    if (shaftLine < 0.012 && rare > 0.68) return 'abandoned shaft';
    if (tunnelLine < 0.018 && rare > 0.74) return 'forgotten haulage tunnel';
    if (y > 7 && fractalNoise2D(this.seed, this.generationVersion, x, y, 14, 2, 53) > 0.68 && rare > 0.5) return 'water pocket';
    return undefined;
  }

  private resourceAt(x: number, y: number, material: TerrainMaterial): ResourceKind | undefined {
    const starter = isStarterGold(x, y);
    if (starter) return starter;

    if (y < 1 || TERRAIN_INFO[material].solid === false) return undefined;

    const local = random01(this.seed, this.generationVersion, x, y, 59);
    const lode = fractalNoise2D(this.seed, this.generationVersion, x, y, 12, 3, 61);
    const crystal = fractalNoise2D(this.seed, this.generationVersion, x - 91, y + 31, 8, 2, 67);
    const artifactNoise = Math.abs(fractalNoise2D(this.seed, this.generationVersion, x + 200, y, 36, 2, 71));

    if ((material === 'crystal' || crystal > 0.66) && local > 0.9965) return 'diamond';
    if ((material === 'crystal' || material === 'granite') && crystal > 0.54 && local > 0.984) return 'rareMineral';
    if (artifactNoise < 0.025 && local > 0.99 && y > 4) return 'artifact';

    if (lode > 0.56 && local > 0.78) {
      if (lode > 0.72 && local > 0.94) return 'goldLarge';
      if (lode > 0.64 && local > 0.88) return 'goldMedium';
      return 'goldSmall';
    }

    if ((material === 'limestone' || material === 'crystal') && crystal > 0.32 && local > 0.91) return 'quartz';
    if (material === 'abandoned' && local > 0.75) return 'scrap';
    if (local > 0.975 && y > 2) return 'scrap';

    return undefined;
  }

  private hazardAt(x: number, y: number, material: TerrainMaterial): HazardKind | undefined {
    const starter = starterHazard(x, y);
    if (starter) return starter;
    if (y < 3 || !TERRAIN_INFO[material].solid) return undefined;

    const local = random01(this.seed, this.generationVersion, x, y, 79);
    const fault = Math.abs(fractalNoise2D(this.seed, this.generationVersion, x, y, 20, 3, 83));

    if (fault < 0.035 && local > 0.66) return 'unstableRock';
    if (material === 'crystal' && local > 0.968) return 'gas';
    if (y > 8 && local > 0.982) return 'oldExplosive';
    if (y > 5 && local > 0.988) return 'collapse';
    return undefined;
  }

  private caveHazardAt(x: number, y: number): HazardKind | undefined {
    const local = random01(this.seed, this.generationVersion, x, y, 89);
    if (y > 6 && local > 0.955) return 'gas';
    if (y > 12 && local > 0.972) return 'collapse';
    return undefined;
  }

  private featureAt(x: number, y: number, material: TerrainMaterial): string | undefined {
    const featureNoise = random01(this.seed, this.generationVersion, x, y, 97);
    if (material === 'crystal') return 'crystal formation';
    if (featureNoise > 0.992) return 'fossil layer';
    if (featureNoise < 0.006 && y > 4) return 'old timber braces';
    return undefined;
  }
}
