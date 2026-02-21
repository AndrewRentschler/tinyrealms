/**
 * Map Convex worldItem docs (with _id) to WorldItemInstance (with id).
 */
export function mapWorldItems(
  items: Array<{
    _id?: string;
    id?: string;
    itemDefName: string;
    x: number;
    y: number;
    quantity: number;
    respawn?: boolean;
    pickedUpAt?: number;
  }>,
) {
  return items
    .filter((i) => (i._id ?? i.id) != null)
    .map((i) => ({
      id: String(i._id ?? i.id),
      itemDefName: i.itemDefName,
      x: i.x,
      y: i.y,
      quantity: i.quantity,
      respawn: i.respawn,
      pickedUpAt: i.pickedUpAt,
    }));
}
