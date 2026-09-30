import { describe, expect, it } from 'vitest';
import { GENERATION_VERSION, START_SEED } from '../game/constants';
import { ScannerService } from '../scanner/ScannerService';
import { createDefaultSave } from '../server/LocalMineRepository';
import { computeExcavatorStats } from '../excavators/stats';
import { WorldGenerator } from './WorldGenerator';

function resourceCount(generator: WorldGenerator, minY: number, maxY: number): number {
  let count = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = -20; x <= 20; x += 1) {
      if (generator.getTile(x, y).resource) count += 1;
    }
  }
  return count;
}

describe('WorldGenerator', () => {
  it('is deterministic for the same seed, chunk and generation version', () => {
    const a = new WorldGenerator(START_SEED, GENERATION_VERSION).generateChunk(0, 0);
    const b = new WorldGenerator(START_SEED, GENERATION_VERSION).generateChunk(0, 0);
    expect(a).toEqual(b);
  });

  it('changes output when seed changes', () => {
    const a = new WorldGenerator('seed-a', GENERATION_VERSION).generateChunk(1, 2);
    const b = new WorldGenerator('seed-b', GENERATION_VERSION).generateChunk(1, 2);
    expect(a).not.toEqual(b);
  });

  it('pre-places starter discoveries before mining', () => {
    const generator = new WorldGenerator(START_SEED, GENERATION_VERSION);
    expect(generator.getTile(2, 2).resource).toBe('goldSmall');
    expect(generator.getTile(-10, 13).resource).toBe('diamond');
    expect(generator.getTile(6, 4).hazard).toBe('gas');
  });

  it('does not make deeper rows automatically richer', () => {
    const generator = new WorldGenerator(START_SEED, GENERATION_VERSION);
    const shallow = resourceCount(generator, 1, 8);
    const deep = resourceCount(generator, 24, 31);
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(0);
    expect(Math.abs(shallow - deep)).toBeLessThan(40);
  });
});

describe('ScannerService', () => {
  it('returns directional hints instead of exact coordinates', () => {
    const save = createDefaultSave(START_SEED);
    const generator = new WorldGenerator(save.seed, save.generationVersion);
    const scanner = new ScannerService(generator);
    const result = scanner.scan(save, computeExcavatorStats(save.player.upgrades));
    expect(result.level).not.toBe('none');
    expect(result.hint).not.toContain('2, 2');
    expect(result.direction.length).toBeGreaterThan(2);
  });
});
