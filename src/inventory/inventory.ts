import { RESOURCE_INFO } from '../game/constants';
import type { InventoryItem, ResourceKind } from '../game/types';

export function inventoryWeight(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + RESOURCE_INFO[item.kind].weight * item.quantity, 0);
}

export function inventoryValue(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + RESOURCE_INFO[item.kind].unitValue * item.quantity, 0);
}

export function addInventoryItem(items: InventoryItem[], kind: ResourceKind, quantity = 1): InventoryItem[] {
  const existing = items.find((item) => item.kind === kind);
  if (existing) {
    return items.map((item) => (item.kind === kind ? { ...item, quantity: item.quantity + quantity } : item));
  }
  return [...items, { kind, quantity }];
}

export function removeAllInventory(): InventoryItem[] {
  return [];
}

export function resourceLabel(kind: ResourceKind): string {
  return RESOURCE_INFO[kind].label;
}
