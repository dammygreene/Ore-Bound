export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Vec2 {
  x: number;
  y: number;
}

export type TerrainMaterial =
  | 'surface'
  | 'air'
  | 'soil'
  | 'dirt'
  | 'clay'
  | 'limestone'
  | 'granite'
  | 'hardRock'
  | 'deepRock'
  | 'crystal'
  | 'abandoned'
  | 'waterPocket';

export type ResourceKind =
  | 'scrap'
  | 'quartz'
  | 'goldSmall'
  | 'goldMedium'
  | 'goldLarge'
  | 'diamond'
  | 'rareMineral'
  | 'artifact';

export type HazardKind = 'gas' | 'unstableRock' | 'oldExplosive' | 'electrical' | 'collapse';

export type DiscoveryRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ScannerSignalLevel = 'none' | 'very weak' | 'weak' | 'medium' | 'strong' | 'very strong';

export interface TileBase {
  x: number;
  y: number;
  material: TerrainMaterial;
  hardness: number;
  traversable: boolean;
  cave: boolean;
  resource?: ResourceKind;
  hazard?: HazardKind;
  feature?: string;
}

export interface TileModification {
  mined?: boolean;
  discovered?: boolean;
  resourceCollected?: boolean;
  hazardTriggered?: boolean;
  lastMinedAt?: number;
}

export interface ResolvedTile extends TileBase {
  mined: boolean;
  discovered: boolean;
  resourceCollected: boolean;
  hazardTriggered: boolean;
}

export type ExcavatorClass = 'Starter' | 'Industrial' | 'Heavy' | 'Advanced' | 'Elite';

export interface ExcavatorStats {
  className: ExcavatorClass;
  drillPower: number;
  miningSpeed: number;
  durabilityMax: number;
  fuelCapacity: number;
  storageCapacity: number;
  scannerRange: number;
  scannerAccuracy: number;
  armor: number;
  energyEfficiency: number;
  hazardResistance: number;
}

export interface ExcavatorUpgrades {
  drill: number;
  engine: number;
  storage: number;
  scanner: number;
  armor: number;
  fuelTank: number;
  cooling: number;
  tracks: number;
  explosionProtection: number;
}

export interface InventoryItem {
  kind: ResourceKind;
  quantity: number;
}

export interface PlayerStats {
  blocksMined: number;
  tilesTravelled: number;
  deepestPoint: number;
  resourcesDiscovered: number;
  diamondsDiscovered: number;
  hazardsSurvived: number;
  goldEarned: number;
  scansUsed: number;
  surfaceReturns: number;
  upgradesPurchased: number;
  largestDepositValue: number;
}

export interface PlayerState {
  position: Vec2;
  facing: Direction;
  money: number;
  fuel: number;
  durability: number;
  cargoUsed: number;
  inventory: InventoryItem[];
  excavatorClass: ExcavatorClass;
  upgrades: ExcavatorUpgrades;
  stats: PlayerStats;
}

export interface MineSaveState {
  version: number;
  generationVersion: number;
  seed: string;
  player: PlayerState;
  modifiedTiles: Record<string, TileModification>;
  discoveredLog: DiscoveryRecord[];
  settings: GameSettings;
  lastSavedAt: number;
}

export interface DiscoveryRecord {
  id: string;
  kind: ResourceKind | HazardKind | 'cave' | 'structure';
  x: number;
  y: number;
  rarity: DiscoveryRarity;
  message: string;
  time: number;
}

export interface GameSettings {
  quality: QualityTier;
  reducedMotion: boolean;
  highContrast: boolean;
  soundEnabled: boolean;
  captionsEnabled: boolean;
  uiScale: number;
}

export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface MiningJob {
  target: Vec2;
  startedAt: number;
  duration: number;
  elapsed: number;
  terrain: TerrainMaterial;
}

export interface ScannerResult {
  level: ScannerSignalLevel;
  direction: string;
  category?: 'resource' | 'hazard' | 'artifact' | 'diamond' | 'cave';
  hint: string;
  estimatedDistance: string;
  pulseMs: number;
}

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger' | 'rare';

export interface GameNotification {
  id: string;
  message: string;
  tone: NotificationTone;
  createdAt: number;
  ttl: number;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface FrameSnapshot {
  player: PlayerState;
  miningJob?: MiningJob;
  scannerResult?: ScannerResult;
  notifications: GameNotification[];
  activeChunkCount: number;
}
