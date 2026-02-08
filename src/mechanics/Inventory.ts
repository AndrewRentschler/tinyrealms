import type { InventorySlot } from "./ItemTypes.ts";

/**
 * Client-side inventory helpers (sorting, filtering, slot management).
 * Server is authoritative; these are for UI convenience only.
 */

export function sortByName(slots: InventorySlot[]): InventorySlot[] {
  return [...slots].sort((a, b) =>
    (a.itemName ?? "").localeCompare(b.itemName ?? "")
  );
}

export function sortByQuantity(slots: InventorySlot[]): InventorySlot[] {
  return [...slots].sort((a, b) => b.quantity - a.quantity);
}

export function filterByType(
  slots: InventorySlot[],
  type: string,
  itemDefs: Map<string, { type: string }>
): InventorySlot[] {
  return slots.filter((s) => {
    const def = itemDefs.get(s.itemDefId);
    return def?.type === type;
  });
}

export function getTotalItems(slots: InventorySlot[]): number {
  return slots.reduce((sum, s) => sum + s.quantity, 0);
}

export function findSlot(
  slots: InventorySlot[],
  itemDefId: string
): InventorySlot | undefined {
  return slots.find((s) => s.itemDefId === itemDefId);
}
