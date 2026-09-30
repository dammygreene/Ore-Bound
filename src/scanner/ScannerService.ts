import type { ExcavatorStats, MineSaveState, ScannerResult, TileBase } from '../game/types';
import { tileKey } from '../world/prng';
import { WorldGenerator } from '../world/WorldGenerator';

function signalLevel(distance: number, range: number): ScannerResult['level'] {
  if (!Number.isFinite(distance)) return 'none';
  const closeness = 1 - distance / Math.max(1, range);
  if (closeness > 0.82) return 'very strong';
  if (closeness > 0.64) return 'strong';
  if (closeness > 0.43) return 'medium';
  if (closeness > 0.22) return 'weak';
  return 'very weak';
}

function directionHint(dx: number, dy: number): string {
  const horizontal = Math.abs(dx) < 1 ? '' : dx > 0 ? 'east' : 'west';
  const vertical = Math.abs(dy) < 1 ? '' : dy > 0 ? 'deeper' : 'toward surface';
  if (horizontal && vertical) return `${vertical}-${horizontal}`;
  return horizontal || vertical || 'under the tracks';
}

function distanceBand(distance: number): string {
  if (distance < 2.5) return 'almost touching distance';
  if (distance < 5) return 'nearby';
  if (distance < 9) return 'a short tunnel away';
  if (distance < 15) return 'on the edge of scanner range';
  return 'barely inside the scan envelope';
}

function categoryFor(tile: TileBase, scannerLevel: number): ScannerResult['category'] | undefined {
  if (tile.resource === 'diamond') return 'diamond';
  if (tile.resource === 'artifact') return 'artifact';
  if (tile.hazard && scannerLevel >= 2) return 'hazard';
  if (tile.resource) return 'resource';
  if (tile.cave) return 'cave';
  return undefined;
}

export class ScannerService {
  private readonly generator: WorldGenerator;

  constructor(generator: WorldGenerator) {
    this.generator = generator;
  }

  scan(save: MineSaveState, stats: ExcavatorStats): ScannerResult {
    const { x: px, y: py } = save.player.position;
    const scannerLevel = save.player.upgrades.scanner;
    const range = Math.floor(stats.scannerRange);
    let bestTile: TileBase | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let y = py - range; y <= py + range; y += 1) {
      if (y < 1) continue;
      for (let x = px - range; x <= px + range; x += 1) {
        const distance = Math.hypot(x - px, y - py);
        if (distance <= 0 || distance > range) continue;
        const modification = save.modifiedTiles[tileKey(x, y)];
        if (modification?.mined || modification?.resourceCollected || modification?.hazardTriggered) continue;

        const tile = this.generator.getTile(x, y);
        const isInterestingResource = tile.resource !== undefined;
        const isInterestingHazard = scannerLevel >= 2 && tile.hazard !== undefined;
        const isInterestingCave = scannerLevel >= 3 && tile.cave;
        if (!isInterestingResource && !isInterestingHazard && !isInterestingCave) continue;

        const categoryBias = tile.resource === 'diamond' ? -5 : tile.resource === 'artifact' ? -3 : tile.hazard ? -1 : 0;
        const score = distance + categoryBias;
        if (score < bestScore) {
          bestScore = score;
          bestDistance = distance;
          bestTile = tile;
        }
      }
    }

    if (!bestTile) {
      return {
        level: 'none',
        direction: 'no signal',
        hint: 'No valuable signal in range. Try branching sideways or moving deeper into unexplored ground.',
        estimatedDistance: 'out of range',
        pulseMs: 1600,
      };
    }

    const dx = bestTile.x - px;
    const dy = bestTile.y - py;
    const level = signalLevel(bestDistance, range * stats.scannerAccuracy);
    const category = categoryFor(bestTile, scannerLevel);
    const categoryText = category
      ? category === 'hazard'
        ? 'hazard warning'
        : category === 'diamond'
          ? 'diamond-class crystal echo'
          : category === 'artifact'
            ? 'artifact-shaped anomaly'
            : category === 'cave'
              ? 'open-space echo'
              : 'ore resonance'
      : 'unclassified resonance';

    return {
      level,
      direction: directionHint(dx, dy),
      category,
      hint: `${level.toUpperCase()} ${categoryText} ${directionHint(dx, dy)}.`,
      estimatedDistance: distanceBand(bestDistance),
      pulseMs: Math.max(240, Math.round(1150 - (range - bestDistance) * 58)),
    };
  }
}
