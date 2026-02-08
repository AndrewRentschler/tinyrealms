/**
 * Shared TypeScript types for items, weapons, armor, consumables.
 */

export type ItemType = "weapon" | "armor" | "consumable" | "key" | "currency";

export interface ItemDef {
  name: string;
  description: string;
  type: ItemType;
  stats?: ItemStats;
  stackable: boolean;
  value: number;
}

export interface ItemStats {
  atk?: number;
  def?: number;
  spd?: number;
  hp?: number;
  healAmount?: number;
}

export interface InventorySlot {
  itemDefId: string;
  itemName?: string;
  quantity: number;
  metadata?: Record<string, any>;
}
