import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { SpriteDefInfo } from "../ObjectLayer.ts";
import type { IGame } from "./types.ts";
import { refreshMapObjectInstanceCache } from "./refreshMapObjectInstanceCache.ts";

/**
 * Load placed static objects for a map from Convex.
 * NPCs are handled by the npcState subscription.
 */
export async function loadPlacedObjects(game: IGame, mapName: string): Promise<void> {
  try {
    const convex = getConvexClient();

    const defs = await convex.query(api.spriteDefinitions.list, {});
    const objs = await convex.query(api.mapObjects.listByMap, { mapName });
    refreshMapObjectInstanceCache(game.mapObjectInstanceNameById, objs as Array<{ _id: string; instanceName?: string | null }>);

    if (objs.length === 0 || defs.length === 0) return;

    console.log(`Loading ${objs.length} placed objects for map "${mapName}"`);

    const defByName = new Map(defs.map((d) => [d.name, d]));

    const staticObjs: Array<{
      id: string;
      spriteDefName: string;
      x: number;
      y: number;
      layer: number;
      isOn?: boolean;
    }> = [];
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
      await game.objectLayer.loadAll(staticObjs, staticDefs);
    }
  } catch (err) {
    console.warn("Failed to load placed objects:", err);
  }
}
