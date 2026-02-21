import { COL_HALF_W, COL_TOP, COL_BOT } from "./constants.ts";
import type { IEntityLayer } from "./types.ts";

export function isBlocked(layer: IEntityLayer, px: number, py: number): boolean {
  const mr = layer.game.mapRenderer;
  const left = px - COL_HALF_W;
  const right = px + COL_HALF_W;
  const top = py + COL_TOP;
  const bot = py + COL_BOT;

  const tl = mr.worldToTile(left, top);
  const tr = mr.worldToTile(right, top);
  const bl = mr.worldToTile(left, bot);
  const br = mr.worldToTile(right, bot);

  return (
    mr.isCollision(tl.tileX, tl.tileY) ||
    mr.isCollision(tr.tileX, tr.tileY) ||
    mr.isCollision(bl.tileX, bl.tileY) ||
    mr.isCollision(br.tileX, br.tileY)
  );
}
