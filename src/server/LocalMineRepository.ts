import { GENERATION_VERSION, SAVE_VERSION, START_SEED } from '../game/constants';
import type { GameSettings, MineSaveState, PlayerState, TileModification } from '../game/types';
import { cloneStarterUpgrades, computeExcavatorStats } from '../excavators/stats';

const STORAGE_KEY = 'ore-bound.save.v1';

function defaultSettings(): GameSettings {
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const highContrast = typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches;
  return {
    quality: 'MEDIUM',
    reducedMotion: Boolean(reducedMotion),
    highContrast: Boolean(highContrast),
    soundEnabled: true,
    captionsEnabled: true,
    uiScale: 1,
  };
}

function defaultPlayer(): PlayerState {
  const upgrades = cloneStarterUpgrades();
  const stats = computeExcavatorStats(upgrades);
  return {
    position: { x: 0, y: 0 },
    facing: 'down',
    money: 75,
    fuel: stats.fuelCapacity,
    durability: stats.durabilityMax,
    cargoUsed: 0,
    inventory: [],
    excavatorClass: 'Starter',
    upgrades,
    stats: {
      blocksMined: 0,
      tilesTravelled: 0,
      deepestPoint: 0,
      resourcesDiscovered: 0,
      diamondsDiscovered: 0,
      hazardsSurvived: 0,
      goldEarned: 0,
      scansUsed: 0,
      surfaceReturns: 0,
      upgradesPurchased: 0,
      largestDepositValue: 0,
    },
  };
}

export function createDefaultSave(seed = START_SEED): MineSaveState {
  const modifiedTiles: Record<string, TileModification> = {
    '0,0': { mined: true, discovered: true },
    '-1,0': { mined: true, discovered: true },
    '1,0': { mined: true, discovered: true },
  };

  return {
    version: SAVE_VERSION,
    generationVersion: GENERATION_VERSION,
    seed,
    player: defaultPlayer(),
    modifiedTiles,
    discoveredLog: [],
    settings: defaultSettings(),
    lastSavedAt: Date.now(),
  };
}

export class LocalMineRepository {
  load(): MineSaveState {
    if (typeof localStorage === 'undefined') return createDefaultSave();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();

    try {
      const parsed = JSON.parse(raw) as MineSaveState;
      if (!parsed || parsed.version !== SAVE_VERSION || !parsed.player || !parsed.modifiedTiles) {
        return createDefaultSave();
      }
      return {
        ...parsed,
        settings: { ...defaultSettings(), ...parsed.settings },
        player: {
          ...defaultPlayer(),
          ...parsed.player,
          upgrades: { ...cloneStarterUpgrades(), ...parsed.player.upgrades },
          stats: { ...defaultPlayer().stats, ...parsed.player.stats },
        },
      };
    } catch (error) {
      console.warn('Could not parse Ore Bound save. Starting a fresh mine.', error);
      return createDefaultSave();
    }
  }

  save(state: MineSaveState): void {
    state.lastSavedAt = Date.now();
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  reset(): MineSaveState {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    return createDefaultSave();
  }
}
