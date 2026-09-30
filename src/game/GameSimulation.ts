import { Analytics } from '../analytics/Analytics';
import { EconomyService } from '../economy/EconomyService';
import { computeExcavatorStats, maxUpgradeLevel, upgradeCost } from '../excavators/stats';
import { DIRECTIONS, RESOURCE_INFO, TERRAIN_INFO, UPGRADE_LABELS } from './constants';
import type {
  CommandResult,
  Direction,
  DiscoveryRarity,
  FrameSnapshot,
  GameNotification,
  GameSettings,
  HazardKind,
  MineSaveState,
  MiningJob,
  ResourceKind,
  ResolvedTile,
  ScannerResult,
  TileModification,
  Vec2,
} from './types';
import { inventoryValue, inventoryWeight, addInventoryItem, removeAllInventory } from '../inventory/inventory';
import { ScannerService } from '../scanner/ScannerService';
import { LocalMineRepository } from '../server/LocalMineRepository';
import { tileKey } from '../world/prng';
import { WorldGenerator } from '../world/WorldGenerator';

function cloneSave(save: MineSaveState): MineSaveState {
  return JSON.parse(JSON.stringify(save)) as MineSaveState;
}

function resourceTone(kind: ResourceKind): GameNotification['tone'] {
  const rarity = RESOURCE_INFO[kind].rarity;
  if (rarity === 'legendary') return 'rare';
  if (rarity === 'epic') return 'success';
  return 'info';
}

function discoveryRarity(kind: ResourceKind): DiscoveryRarity {
  return RESOURCE_INFO[kind].rarity;
}

function hazardLabel(kind: HazardKind): string {
  const labels: Record<HazardKind, string> = {
    gas: 'Gas pocket',
    unstableRock: 'Unstable rock',
    oldExplosive: 'Old explosive charge',
    electrical: 'Live electrical equipment',
    collapse: 'Cave-in risk',
  };
  return labels[kind];
}

export class GameSimulation {
  private readonly repository: LocalMineRepository;
  private readonly economy = new EconomyService();
  private readonly analytics = new Analytics();
  private readonly listeners = new Set<() => void>();
  private save: MineSaveState;
  private generator: WorldGenerator;
  private scanner: ScannerService;
  private miningJob: MiningJob | undefined;
  private scannerResult: ScannerResult | undefined;
  private notifications: GameNotification[] = [];
  private activeChunkCount = 0;
  private saveAccumulator = 0;

  constructor(repository = new LocalMineRepository()) {
    this.repository = repository;
    this.save = this.repository.load();
    this.generator = new WorldGenerator(this.save.seed, this.save.generationVersion);
    this.scanner = new ScannerService(this.generator);
    this.discoverAroundPlayer();
    this.analytics.track('session_start', { seed: this.save.seed });
    this.notify('Welcome to Ore Bound. Scan, branch, dig, and bring the cargo home.', 'info', 7000);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  snapshot(): FrameSnapshot {
    this.pruneNotifications();
    return {
      player: cloneSave(this.save).player,
      miningJob: this.miningJob ? { ...this.miningJob, target: { ...this.miningJob.target } } : undefined,
      scannerResult: this.scannerResult ? { ...this.scannerResult } : undefined,
      notifications: [...this.notifications],
      activeChunkCount: this.activeChunkCount,
    };
  }

  getSave(): MineSaveState {
    return cloneSave(this.save);
  }

  getGenerator(): WorldGenerator {
    return this.generator;
  }

  setActiveChunkCount(count: number): void {
    this.activeChunkCount = count;
  }

  getSettings(): GameSettings {
    return { ...this.save.settings };
  }

  updateSettings(settings: Partial<GameSettings>): void {
    this.save.settings = { ...this.save.settings, ...settings };
    this.persistNow();
    this.analytics.track('quality_changed', { quality: this.save.settings.quality });
    this.emit();
  }

  resetMine(): void {
    this.save = this.repository.reset();
    this.generator = new WorldGenerator(this.save.seed, this.save.generationVersion);
    this.scanner = new ScannerService(this.generator);
    this.miningJob = undefined;
    this.scannerResult = undefined;
    this.notifications = [];
    this.discoverAroundPlayer();
    this.notify('Fresh deterministic mine loaded. The starter lodes are hidden again.', 'success', 6000);
    this.persistNow();
    this.emit();
  }

  update(deltaSeconds: number): void {
    if (this.miningJob) {
      this.miningJob.elapsed += deltaSeconds;
      if (this.miningJob.elapsed >= this.miningJob.duration) {
        this.completeMining();
      }
    }

    this.saveAccumulator += deltaSeconds;
    if (this.saveAccumulator > 2) {
      this.persistNow();
      this.saveAccumulator = 0;
    }

    this.pruneNotifications();
  }

  getResolvedTile(x: number, y: number): ResolvedTile {
    const base = this.generator.getTile(x, y);
    const modification = this.getModification(x, y);
    return {
      ...base,
      mined: Boolean(modification.mined || base.traversable),
      discovered: Boolean(modification.discovered || y <= 0),
      resourceCollected: Boolean(modification.resourceCollected),
      hazardTriggered: Boolean(modification.hazardTriggered),
    };
  }

  moveOrMine(direction: Direction): CommandResult {
    this.save.player.facing = direction;
    const target = this.adjacentPosition(direction);
    const tile = this.getResolvedTile(target.x, target.y);
    if (this.canTraverse(tile)) return this.move(direction);
    return this.beginMining(direction);
  }

  move(direction: Direction): CommandResult {
    if (this.miningJob) return this.reject('Finish drilling before moving.');

    this.save.player.facing = direction;
    const target = this.adjacentPosition(direction);
    if (target.y < 0) return this.reject('Stay on the surface rails or dig downward into the mine.');
    const tile = this.getResolvedTile(target.x, target.y);
    if (!this.canTraverse(tile)) return this.reject('That tile needs drilling first.');

    const stats = computeExcavatorStats(this.save.player.upgrades);
    const overloaded = Math.max(0, this.save.player.cargoUsed - stats.storageCapacity);
    const movementCost = (0.7 + overloaded * 0.03) / stats.energyEfficiency;
    if (this.save.player.fuel < movementCost) return this.reject('Fuel is too low. Return to surface or refuel.');
    if (this.save.player.durability <= 0) return this.reject('Durability is critical. Repair at the garage.');

    this.save.player.position = target;
    this.save.player.fuel = Math.max(0, this.save.player.fuel - movementCost);
    this.save.player.stats.tilesTravelled += 1;
    this.save.player.stats.deepestPoint = Math.max(this.save.player.stats.deepestPoint, target.y);
    this.discoverAroundPlayer();
    this.triggerHazardIfNeeded(tile, 'movement');
    this.persistSoon();
    this.emit();
    return { ok: true };
  }

  beginMining(direction = this.save.player.facing): CommandResult {
    if (this.miningJob) return this.reject('Drill is already engaged.');

    this.save.player.facing = direction;
    const target = this.adjacentPosition(direction);
    if (target.y < 1) return this.reject('The surface platform cannot be mined.');

    const tile = this.getResolvedTile(target.x, target.y);
    if (this.canTraverse(tile)) return this.reject('That space is already open.');

    const stats = computeExcavatorStats(this.save.player.upgrades);
    if (this.save.player.fuel <= 0) return this.reject('Out of fuel. Use return to surface for a tow.');
    if (this.save.player.durability <= 0) return this.reject('Excavator is too damaged to drill.');

    const terrain = TERRAIN_INFO[tile.material];
    const duration = Math.max(0.45, (terrain.hardness * 0.9) / (stats.drillPower * stats.miningSpeed));
    this.miningJob = {
      target,
      startedAt: performance.now(),
      duration,
      elapsed: 0,
      terrain: tile.material,
    };
    this.emit();
    return { ok: true };
  }

  cancelMining(): void {
    if (!this.miningJob) return;
    this.miningJob = undefined;
    this.notify('Drilling cancelled.', 'info', 1800);
    this.emit();
  }

  scan(): ScannerResult {
    const stats = computeExcavatorStats(this.save.player.upgrades);
    const fuelCost = 2.5 / stats.energyEfficiency;
    if (this.save.player.fuel >= fuelCost) {
      this.save.player.fuel -= fuelCost;
    }
    this.save.player.stats.scansUsed += 1;
    this.scannerResult = this.scanner.scan(this.save, stats);
    this.analytics.track('scanner_used', { level: this.scannerResult.level });
    this.notify(this.scannerResult.hint, this.scannerResult.category === 'hazard' ? 'warning' : 'info', 5600);
    this.persistSoon();
    this.emit();
    return this.scannerResult;
  }

  returnToSurface(): CommandResult {
    const { position } = this.save.player;
    const stats = computeExcavatorStats(this.save.player.upgrades);
    if (position.y === 0 && position.x === 0) {
      this.notify('Already parked at the garage. Sell cargo, repair, or upgrade.', 'info', 3400);
      return { ok: true };
    }

    const distance = Math.hypot(position.x, position.y);
    const towCost = Math.round(Math.max(0, distance - 3) * 0.8);
    this.save.player.position = { x: 0, y: 0 };
    this.save.player.facing = 'down';
    this.save.player.fuel = Math.max(0, this.save.player.fuel - Math.min(this.save.player.fuel, distance * 0.35));
    this.save.player.durability = Math.max(1, this.save.player.durability - Math.max(0, distance - stats.armor) * 0.08);
    this.save.player.money = Math.max(0, this.save.player.money - towCost);
    this.save.player.stats.surfaceReturns += 1;
    this.discoverAroundPlayer();
    this.analytics.track('surface_return', { distance: Math.round(distance), towCost });
    this.notify(towCost > 0 ? `Returned to surface. Tow and lift fees: ${towCost} credits.` : 'Returned to surface safely.', 'success', 4800);
    this.persistNow();
    this.emit();
    return { ok: true };
  }

  interactAtCurrentStation(): CommandResult {
    const { position } = this.save.player;
    if (position.y !== 0) return this.beginMining();
    if (position.x <= -2) return this.repairAndRefuel();
    if (position.x >= 2) return this.repairAndRefuel();
    return this.sellCargo();
  }

  sellCargo(): CommandResult {
    if (!this.isAtSurfaceGarage()) return this.reject('Return to the surface garage before selling cargo.');
    if (this.save.player.inventory.length === 0) return this.reject('Cargo bay is empty.');

    const sale = this.economy.sellCargo(this.save.player.inventory);
    this.save.player.money += sale.total;
    this.save.player.stats.goldEarned += sale.total;
    this.save.player.inventory = removeAllInventory();
    this.save.player.cargoUsed = 0;
    this.analytics.track('resource_sold', { value: sale.total });
    this.notify(`Refinery paid ${sale.total} credits (${sale.refineryBonus} bonus).`, 'success', 5200);
    this.persistNow();
    this.emit();
    return { ok: true };
  }

  repairAndRefuel(): CommandResult {
    if (!this.isAtSurfaceGarage()) return this.reject('Repair crews are only available at the garage.');
    const stats = computeExcavatorStats(this.save.player.upgrades);
    const missingDurability = stats.durabilityMax - this.save.player.durability;
    const missingFuel = stats.fuelCapacity - this.save.player.fuel;
    const cost = this.economy.repairCost(missingDurability) + this.economy.fuelCost(missingFuel);
    if (cost <= 0) return this.reject('Excavator is already topped up.');
    if (this.save.player.money < cost) return this.reject(`Need ${cost} credits to fully repair and refuel.`);

    this.save.player.money -= cost;
    this.save.player.durability = stats.durabilityMax;
    this.save.player.fuel = stats.fuelCapacity;
    this.notify(`Crew repaired and refueled the Starter rig for ${cost} credits.`, 'success', 4200);
    this.persistNow();
    this.emit();
    return { ok: true };
  }

  buyUpgrade(key: keyof MineSaveState['player']['upgrades']): CommandResult {
    if (!this.isAtSurfaceGarage()) return this.reject('Install upgrades at the surface garage.');
    if (this.save.player.upgrades[key] >= maxUpgradeLevel(key)) return this.reject(`${UPGRADE_LABELS[key]} is already maxed.`);

    const cost = upgradeCost(this.save.player.upgrades, key);
    if (this.save.player.money < cost) return this.reject(`Need ${cost} credits for ${UPGRADE_LABELS[key]}.`);

    this.save.player.money -= cost;
    this.save.player.upgrades[key] += 1;
    const stats = computeExcavatorStats(this.save.player.upgrades);
    this.save.player.fuel = Math.min(stats.fuelCapacity, this.save.player.fuel + 12);
    this.save.player.durability = Math.min(stats.durabilityMax, this.save.player.durability + 10);
    this.save.player.stats.upgradesPurchased += 1;
    this.analytics.track('upgrade_purchased', { key, level: this.save.player.upgrades[key] });
    this.notify(`${UPGRADE_LABELS[key]} upgraded to level ${this.save.player.upgrades[key]}.`, 'success', 5200);
    this.persistNow();
    this.emit();
    return { ok: true };
  }

  isAtSurfaceGarage(): boolean {
    return this.save.player.position.y === 0 && Math.abs(this.save.player.position.x) <= 3;
  }

  private completeMining(): void {
    if (!this.miningJob) return;
    const job = this.miningJob;
    this.miningJob = undefined;
    const tile = this.getResolvedTile(job.target.x, job.target.y);
    const stats = computeExcavatorStats(this.save.player.upgrades);
    const modification = this.getModification(job.target.x, job.target.y);
    modification.mined = true;
    modification.discovered = true;
    modification.lastMinedAt = Date.now();

    const hardness = Math.max(1, TERRAIN_INFO[tile.material].hardness);
    const fuelCost = (1.6 + hardness * 0.75) / stats.energyEfficiency;
    const wear = Math.max(0.4, (hardness * 1.2) / (stats.armor + this.save.player.upgrades.cooling * 0.12));
    this.save.player.fuel = Math.max(0, this.save.player.fuel - fuelCost);
    this.save.player.durability = Math.max(0, this.save.player.durability - wear);
    this.save.player.stats.blocksMined += 1;
    this.save.player.stats.deepestPoint = Math.max(this.save.player.stats.deepestPoint, job.target.y);

    this.discoverAround(job.target.x, job.target.y, 1);
    this.triggerHazardIfNeeded(tile, 'mining');
    if (tile.resource && !tile.resourceCollected) this.collectResource(tile.resource, job.target);
    if (tile.cave) this.recordDiscovery('cave', job.target.x, job.target.y, 'uncommon', 'Natural cave opened into the tunnel network.');

    this.analytics.track('tile_mined', { material: tile.material, y: job.target.y });
    this.persistNow();
    this.emit();
  }

  private collectResource(kind: ResourceKind, position: Vec2): void {
    const resource = RESOURCE_INFO[kind];
    const stats = computeExcavatorStats(this.save.player.upgrades);
    const modification = this.getModification(position.x, position.y);
    const newWeight = this.save.player.cargoUsed + resource.weight;

    modification.resourceCollected = true;
    this.save.player.stats.resourcesDiscovered += 1;
    this.save.player.stats.largestDepositValue = Math.max(this.save.player.stats.largestDepositValue, resource.unitValue);
    this.recordDiscovery(kind, position.x, position.y, discoveryRarity(kind), `${resource.label} discovered at depth ${position.y}.`);

    if (newWeight <= stats.storageCapacity * 1.15) {
      this.save.player.inventory = addInventoryItem(this.save.player.inventory, kind, 1);
      this.save.player.cargoUsed = inventoryWeight(this.save.player.inventory);
      const overload = this.save.player.cargoUsed > stats.storageCapacity ? ' Cargo is overloaded; return soon.' : '';
      this.notify(`${resource.label} loaded into cargo.${overload}`, resourceTone(kind), kind === 'diamond' ? 9000 : 5200);
    } else {
      this.notify(`Cargo bay could not safely recover ${resource.label}. Discovery logged, ore left in rubble.`, 'warning', 7000);
    }

    if (kind === 'diamond') {
      this.save.player.stats.diamondsDiscovered += 1;
      this.analytics.track('diamond_discovered', { depth: position.y });
    }
    this.analytics.track('resource_discovered', { kind, value: resource.unitValue });
  }

  private triggerHazardIfNeeded(tile: ResolvedTile, source: 'mining' | 'movement'): void {
    if (!tile.hazard || tile.hazardTriggered) return;
    const modification = this.getModification(tile.x, tile.y);
    modification.hazardTriggered = true;
    const stats = computeExcavatorStats(this.save.player.upgrades);
    const baseDamage: Record<HazardKind, number> = {
      gas: 8,
      unstableRock: 13,
      oldExplosive: 24,
      electrical: 12,
      collapse: 17,
    };
    const baseFuelLoss: Record<HazardKind, number> = {
      gas: 5,
      unstableRock: 1,
      oldExplosive: 6,
      electrical: 10,
      collapse: 2,
    };
    const blastBonus = tile.hazard === 'oldExplosive' ? this.save.player.upgrades.explosionProtection * 0.08 : 0;
    const resistance = Math.min(0.8, stats.hazardResistance + blastBonus);
    const damage = Math.max(1, baseDamage[tile.hazard] * (1 - resistance));
    const fuelLoss = Math.max(0, baseFuelLoss[tile.hazard] * (1 - resistance * 0.5));
    this.save.player.durability = Math.max(0, this.save.player.durability - damage);
    this.save.player.fuel = Math.max(0, this.save.player.fuel - fuelLoss);
    this.save.player.stats.hazardsSurvived += 1;
    this.recordDiscovery(tile.hazard, tile.x, tile.y, 'rare', `${hazardLabel(tile.hazard)} survived while ${source}.`);
    this.analytics.track('hazard_triggered', { hazard: tile.hazard, source });
    this.notify(`${hazardLabel(tile.hazard)}! Damage ${Math.round(damage)}, fuel lost ${Math.round(fuelLoss)}.`, 'danger', 7000);

    if (this.save.player.durability <= 0) {
      this.notify('Emergency safety frame engaged. Return to the garage before drilling again.', 'danger', 8000);
    }
  }

  private canTraverse(tile: ResolvedTile): boolean {
    return tile.traversable || tile.mined || tile.material === 'surface' || tile.material === 'air';
  }

  private adjacentPosition(direction: Direction): Vec2 {
    const offset = DIRECTIONS[direction];
    return {
      x: this.save.player.position.x + offset.x,
      y: this.save.player.position.y + offset.y,
    };
  }

  private getModification(x: number, y: number): TileModification {
    const key = tileKey(x, y);
    const modification = this.save.modifiedTiles[key] ?? {};
    this.save.modifiedTiles[key] = modification;
    return modification;
  }

  private discoverAroundPlayer(): void {
    const { x, y } = this.save.player.position;
    this.discoverAround(x, y, 2);
  }

  private discoverAround(x: number, y: number, radius: number): void {
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      for (let xx = x - radius; xx <= x + radius; xx += 1) {
        if (Math.hypot(xx - x, yy - y) <= radius + 0.25) this.getModification(xx, yy).discovered = true;
      }
    }
  }

  private recordDiscovery(
    kind: ResourceKind | HazardKind | 'cave' | 'structure',
    x: number,
    y: number,
    rarity: DiscoveryRarity,
    message: string,
  ): void {
    const id = `${kind}:${x},${y}`;
    if (this.save.discoveredLog.some((entry) => entry.id === id)) return;
    this.save.discoveredLog.unshift({ id, kind, x, y, rarity, message, time: Date.now() });
    if (this.save.discoveredLog.length > 80) this.save.discoveredLog.pop();
  }

  private reject(reason: string): CommandResult {
    this.notify(reason, 'warning', 3000);
    this.emit();
    return { ok: false, reason };
  }

  private notify(message: string, tone: GameNotification['tone'], ttl = 4200): void {
    this.notifications.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, message, tone, createdAt: Date.now(), ttl });
    if (this.notifications.length > 6) this.notifications.pop();
  }

  private pruneNotifications(): void {
    const now = Date.now();
    this.notifications = this.notifications.filter((notification) => now - notification.createdAt < notification.ttl);
  }

  private persistSoon(): void {
    this.saveAccumulator = Math.max(this.saveAccumulator, 1.8);
  }

  private persistNow(): void {
    this.save.player.cargoUsed = inventoryWeight(this.save.player.inventory);
    if (inventoryValue(this.save.player.inventory) > 0) {
      this.save.player.stats.largestDepositValue = Math.max(this.save.player.stats.largestDepositValue, inventoryValue(this.save.player.inventory));
    }
    this.repository.save(this.save);
  }
}
