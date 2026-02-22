import type { SpriteDefInfo } from "../ObjectLayer/index.ts";

/** Map object from Convex (mapObjects table). */
export interface MapObjectRow {
  _id: string;
  spriteDefName: string;
  x: number;
  y: number;
  layer?: number;
  isOn?: boolean;
  storageId?: import("../../../convex/_generated/dataModel").Id<"storages">;
}

/** Sprite definition from Convex (spriteDefinitions table). */
export interface SpriteDefRow {
  name: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
  category?: string;
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
  isDoor?: boolean;
  doorClosedAnimation?: string;
  doorOpeningAnimation?: string;
  doorOpenAnimation?: string;
  doorClosingAnimation?: string;
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
  hasStorage?: boolean;
  storageCapacity?: number;
  storageOwnerType?: "public" | "player";
}

export interface StaticObjectInput {
  id: string;
  spriteDefName: string;
  x: number;
  y: number;
  layer: number;
  isOn?: boolean;
  storageId?: import("../../../convex/_generated/dataModel").Id<"storages">;
}

/**
 * Build static objects and sprite defs from Convex data.
 * Filters out NPCs (handled by npcState subscription).
 */
export function buildStaticObjects(
  objs: MapObjectRow[],
  defs: SpriteDefRow[],
): { staticObjs: StaticObjectInput[]; staticDefs: SpriteDefInfo[] } {
  const defByName = new Map(defs.map((d) => [d.name, d]));
  const staticObjs: StaticObjectInput[] = [];
  const staticDefs: SpriteDefInfo[] = [];
  const defsSeen = new Set<string>();

  for (const o of objs) {
    const def = defByName.get(o.spriteDefName);
    if (!def || def.category === "npc") continue;

    staticObjs.push({
      id: o._id,
      spriteDefName: o.spriteDefName,
      x: o.x,
      y: o.y,
      layer: o.layer ?? 0,
      isOn: o.isOn,
      storageId: o.storageId,
    });

    if (!defsSeen.has(def.name)) {
      defsSeen.add(def.name);
      staticDefs.push(defToSpriteDefInfo(def));
    }
  }

  return { staticObjs, staticDefs };
}

function defToSpriteDefInfo(def: SpriteDefRow): SpriteDefInfo {
  return {
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
  };
}
