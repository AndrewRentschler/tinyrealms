/**
 * Client-side loot preview. Server is authoritative for actual drops.
 * This is for UI display only (e.g., showing possible drops before a fight).
 */

export interface LootTableEntry {
  itemName: string;
  weight: number;
  minQuantity: number;
  maxQuantity: number;
}

/** Preview what loot might drop (client-side, not authoritative) */
export function previewLoot(table: LootTableEntry[]): {
  item: string;
  chance: string;
  quantity: string;
}[] {
  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0);

  return table.map((entry) => ({
    item: entry.itemName,
    chance: `${Math.round((entry.weight / totalWeight) * 100)}%`,
    quantity:
      entry.minQuantity === entry.maxQuantity
        ? `${entry.minQuantity}`
        : `${entry.minQuantity}-${entry.maxQuantity}`,
  }));
}
