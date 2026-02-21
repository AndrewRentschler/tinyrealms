import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { SpriteDefInfo } from "../ObjectLayer.ts";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";

/**
 * Reload placed objects when subscription fires.
 * Clears current static objects, then re-renders from data.
 */
export async function reloadPlacedObjects(
  game: IGame & { mapObjectsLoading: boolean; spriteDefCache: Map<string, unknown> },
  mapName: string,
  objs: Array<{
    _id: string;
    spriteDefName: string;
    x: number;
    y: number;
    layer?: number;
    isOn?: boolean;
    instanceName?: string;
  }>,
): Promise<void> {
  (game as { mapObjectsLoading: boolean }).mapObjectsLoading = true;
  try {
    const convex = getConvexClient();
    refreshMapObjectInstanceCache(game.mapObjectInstanceNameById, objs);

    const defs = await convex.query(api.spriteDefinitions.list, {});
    const defByName = new Map(defs.map((d) => [d.name, d]));

    (game as { spriteDefCache: Map<string, unknown> }).spriteDefCache = new Map(
      defs.map((d) => [d.name, d]),
    );

    game.objectLayer.clear();

    const staticObjs: Array<{ id: string; spriteDefName: string; x: number; y: number; layer: number; isOn?: boolean }> = [];
    const staticDefs: SpriteDefInfo[] = [];
    const defsSeen = new Set<string>();

    for (const o of objs) {
      const def = defByName.get(o.spriteDefName);
      if (!def) continue;

      if (def.category === "npc") continue;

      staticObjs.push({
        id: o._id,
        spriteDefName: o.spriteDefName,
        x: o.x,
        y: o.y,
        layer: o.layer ?? 0,
        isOn: (o as { isOn?: boolean }).isOn,
      });
      if (!defsSeen.has(def.name)) {
        defsSeen.add(def.name);
        staticDefs.push({
          name: def.name,
          spriteSheetUrl: def.spriteSheetUrl,
          defaultAnimation: def.defaultAnimation,
          animationSpeed: def.animationSpeed,
          scale: def.scale,
          frameWidth: def.frameWidth,
          frameHeight: def.frameHeight,
          ambientSoundUrl: def.ambientSoundUrl ?? undefined,
          ambientSoundRadius: def.ambientSoundRadius ?? undefined,
          ambientSoundVolume: def.ambientSoundVolume ?? undefined,
          interactSoundUrl: def.interactSoundUrl ?? undefined,
          toggleable: def.toggleable ?? undefined,
          onAnimation: def.onAnimation ?? undefined,
          offAnimation: def.offAnimation ?? undefined,
          onSoundUrl: def.onSoundUrl ?? undefined,
          isDoor: def.isDoor ?? undefined,
          doorClosedAnimation: def.doorClosedAnimation ?? undefined,
          doorOpeningAnimation: def.doorOpeningAnimation ?? undefined,
          doorOpenAnimation: def.doorOpenAnimation ?? undefined,
          doorClosingAnimation: def.doorClosingAnimation ?? undefined,
          doorOpenSoundUrl: def.doorOpenSoundUrl ?? undefined,
          doorCloseSoundUrl: def.doorCloseSoundUrl ?? undefined,
        });
      }
    }

    if (staticObjs.length > 0) {
      game.mapRenderer.clearAllCollisionOverrides();
      await game.objectLayer.loadAll(staticObjs, staticDefs);
    }
  } catch (err) {
    console.warn("Failed to reload placed objects:", err);
  }
  (game as { mapObjectsLoading: boolean }).mapObjectsLoading = false;
}
