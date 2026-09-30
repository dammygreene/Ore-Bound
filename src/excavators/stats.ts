import { BASE_EXCAVATOR_STATS, STARTER_UPGRADES } from '../game/constants';
import type { ExcavatorStats, ExcavatorUpgrades } from '../game/types';

export function cloneStarterUpgrades(): ExcavatorUpgrades {
  return { ...STARTER_UPGRADES };
}

export function computeExcavatorStats(upgrades: ExcavatorUpgrades): ExcavatorStats {
  return {
    ...BASE_EXCAVATOR_STATS,
    drillPower: BASE_EXCAVATOR_STATS.drillPower + upgrades.drill * 0.34 + upgrades.cooling * 0.08,
    miningSpeed: BASE_EXCAVATOR_STATS.miningSpeed + upgrades.engine * 0.11 + upgrades.drill * 0.07,
    durabilityMax: BASE_EXCAVATOR_STATS.durabilityMax + upgrades.armor * 18 + upgrades.cooling * 5,
    fuelCapacity: BASE_EXCAVATOR_STATS.fuelCapacity + upgrades.fuelTank * 32,
    storageCapacity: BASE_EXCAVATOR_STATS.storageCapacity + upgrades.storage * 12,
    scannerRange: BASE_EXCAVATOR_STATS.scannerRange + upgrades.scanner * 4,
    scannerAccuracy: Math.min(0.98, BASE_EXCAVATOR_STATS.scannerAccuracy + upgrades.scanner * 0.055),
    armor: BASE_EXCAVATOR_STATS.armor + upgrades.armor * 0.28,
    energyEfficiency: BASE_EXCAVATOR_STATS.energyEfficiency + upgrades.engine * 0.05 + upgrades.tracks * 0.07,
    hazardResistance: Math.min(
      0.72,
      BASE_EXCAVATOR_STATS.hazardResistance + upgrades.armor * 0.045 + upgrades.explosionProtection * 0.09,
    ),
  };
}

export function upgradeCost(upgrades: ExcavatorUpgrades, key: keyof ExcavatorUpgrades): number {
  const level = upgrades[key];
  const baseCosts: Record<keyof ExcavatorUpgrades, number> = {
    drill: 90,
    engine: 120,
    storage: 105,
    scanner: 140,
    armor: 115,
    fuelTank: 95,
    cooling: 135,
    tracks: 110,
    explosionProtection: 160,
  };
  return Math.round(baseCosts[key] * (level + 1) ** 1.55);
}

export function maxUpgradeLevel(key: keyof ExcavatorUpgrades): number {
  if (key === 'explosionProtection') return 4;
  if (key === 'scanner') return 6;
  return 5;
}
