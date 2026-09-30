import type { Direction, ExcavatorStats, ExcavatorUpgrades, ResourceKind, TerrainMaterial } from './types';

export const CHUNK_SIZE = 16;
export const GENERATION_VERSION = 1;
export const SAVE_VERSION = 1;
export const START_SEED = 'ore-bound-alpha-demonstration-mine';

export const DIRECTIONS: Record<Direction, { x: number; y: number; label: string }> = {
  up: { x: 0, y: -1, label: 'Up' },
  down: { x: 0, y: 1, label: 'Down' },
  left: { x: -1, y: 0, label: 'Left' },
  right: { x: 1, y: 0, label: 'Right' },
};

export const TERRAIN_INFO: Record<TerrainMaterial, { label: string; hardness: number; solid: boolean; value: number }> = {
  surface: { label: 'Surface gantry', hardness: 0, solid: false, value: 0 },
  air: { label: 'Open tunnel', hardness: 0, solid: false, value: 0 },
  soil: { label: 'Loose soil', hardness: 1, solid: true, value: 1 },
  dirt: { label: 'Packed dirt', hardness: 1.35, solid: true, value: 1 },
  clay: { label: 'Red clay', hardness: 1.8, solid: true, value: 2 },
  limestone: { label: 'Limestone', hardness: 2.3, solid: true, value: 3 },
  granite: { label: 'Granite', hardness: 3.25, solid: true, value: 4 },
  hardRock: { label: 'Hard rock', hardness: 4.25, solid: true, value: 5 },
  deepRock: { label: 'Dense basalt', hardness: 5, solid: true, value: 6 },
  crystal: { label: 'Crystal pocket', hardness: 3.8, solid: true, value: 7 },
  abandoned: { label: 'Abandoned works', hardness: 0, solid: false, value: 0 },
  waterPocket: { label: 'Water pocket', hardness: 0, solid: false, value: 0 },
};

export const RESOURCE_INFO: Record<ResourceKind, { label: string; unitValue: number; weight: number; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; color: string }> = {
  scrap: { label: 'Useful scrap', unitValue: 9, weight: 1, rarity: 'common', color: '#9aa3ad' },
  quartz: { label: 'Quartz cluster', unitValue: 18, weight: 1, rarity: 'uncommon', color: '#cdefff' },
  goldSmall: { label: 'Small gold vein', unitValue: 45, weight: 2, rarity: 'uncommon', color: '#ffd766' },
  goldMedium: { label: 'Medium gold vein', unitValue: 105, weight: 4, rarity: 'rare', color: '#ffc431' },
  goldLarge: { label: 'Large gold deposit', unitValue: 260, weight: 7, rarity: 'epic', color: '#ffb000' },
  diamond: { label: 'Diamond', unitValue: 950, weight: 2, rarity: 'legendary', color: '#7df8ff' },
  rareMineral: { label: 'Rare mineral', unitValue: 340, weight: 3, rarity: 'epic', color: '#b374ff' },
  artifact: { label: 'Artifact', unitValue: 520, weight: 1, rarity: 'legendary', color: '#77ffbd' },
};

export const STARTER_UPGRADES: ExcavatorUpgrades = {
  drill: 0,
  engine: 0,
  storage: 0,
  scanner: 0,
  armor: 0,
  fuelTank: 0,
  cooling: 0,
  tracks: 0,
  explosionProtection: 0,
};

export const BASE_EXCAVATOR_STATS: ExcavatorStats = {
  className: 'Starter',
  drillPower: 1,
  miningSpeed: 1,
  durabilityMax: 100,
  fuelCapacity: 120,
  storageCapacity: 28,
  scannerRange: 9,
  scannerAccuracy: 0.72,
  armor: 1,
  energyEfficiency: 1,
  hazardResistance: 0.08,
};

export const UPGRADE_LABELS: Record<keyof ExcavatorUpgrades, string> = {
  drill: 'Drill head',
  engine: 'Engine',
  storage: 'Cargo bay',
  scanner: 'Scanner array',
  armor: 'Armor plating',
  fuelTank: 'Fuel tank',
  cooling: 'Cooling system',
  tracks: 'Tracks',
  explosionProtection: 'Blast baffles',
};

export const UPGRADE_DESCRIPTIONS: Record<keyof ExcavatorUpgrades, string> = {
  drill: 'Cuts harder terrain faster.',
  engine: 'Improves movement and mining responsiveness.',
  storage: 'Adds more ore capacity.',
  scanner: 'Extends signal range and category hints.',
  armor: 'Reduces ordinary wear and hazard damage.',
  fuelTank: 'Adds fuel capacity.',
  cooling: 'Reduces drill wear during long mining sessions.',
  tracks: 'Cuts movement fuel cost.',
  explosionProtection: 'Improves survival against explosive hazards.',
};

export const QUALITY_RENDER_RADIUS = {
  LOW: { x: 12, y: 9, chunks: 1, particles: 18 },
  MEDIUM: { x: 16, y: 11, chunks: 2, particles: 28 },
  HIGH: { x: 20, y: 13, chunks: 2, particles: 42 },
  ULTRA: { x: 24, y: 15, chunks: 3, particles: 60 },
} as const;

export const SHORTCUTS = [
  'WASD / arrows: move or dig adjacent terrain',
  'Space: drill the tile you are facing',
  'E: interact with surface garage stations, or drill underground',
  'Shift / C: scanner pulse',
  'B: boost forward through an open tunnel',
  'R: return to surface',
  'G / Tab: command tablet, garage and upgrades',
  'H: help',
  'Esc: close panels',
];
