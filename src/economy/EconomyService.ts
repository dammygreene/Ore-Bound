import { RESOURCE_INFO } from '../game/constants';
import type { InventoryItem } from '../game/types';
import { inventoryValue } from '../inventory/inventory';

export interface SaleResult {
  gross: number;
  refineryBonus: number;
  total: number;
}

export class EconomyService {
  sellCargo(items: InventoryItem[]): SaleResult {
    const gross = inventoryValue(items);
    const rareCount = items.reduce((sum, item) => {
      const rarity = RESOURCE_INFO[item.kind].rarity;
      return sum + (rarity === 'epic' || rarity === 'legendary' ? item.quantity : 0);
    }, 0);
    const refineryBonus = Math.round(gross * Math.min(0.12, rareCount * 0.025));
    return { gross, refineryBonus, total: gross + refineryBonus };
  }

  repairCost(missingDurability: number): number {
    return Math.max(0, Math.ceil(missingDurability * 1.4));
  }

  fuelCost(missingFuel: number): number {
    return Math.max(0, Math.ceil(missingFuel * 0.5));
  }
}
