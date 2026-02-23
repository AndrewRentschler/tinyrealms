/**
 * Admin: apply structured map edit plans (NPCs, objects, tiles, collision, items).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { requireAdminKey } from "../lib/requireAdminKey";

const moveObjectValidator = v.object({
  id: v.optional(v.id("mapObjects")),
  instanceName: v.optional(v.string()),
  x: v.number(),
  y: v.number(),
  layer: v.optional(v.number()),
});

const npcProfileUpsertValidator = v.object({
  name: v.string(),
  displayName: v.string(),
  spriteDefName: v.string(),
  mapName: v.optional(v.string()),
  title: v.optional(v.string()),
  backstory: v.optional(v.string()),
  personality: v.optional(v.string()),
  dialogueStyle: v.optional(v.string()),
  moveSpeed: v.optional(v.number()),
  wanderRadius: v.optional(v.number()),
  greeting: v.optional(v.string()),
});

const mapObjectUpsertValidator = v.object({
  instanceName: v.string(),
  spriteDefName: v.string(),
  layer: v.number(),
  x: v.number(),
  y: v.number(),
  scaleOverride: v.optional(v.number()),
  flipX: v.optional(v.boolean()),
});

const setTileValidator = v.object({
  layerName: v.string(),
  x: v.number(),
  y: v.number(),
  tile: v.number(),
});

const fillTilesRectValidator = v.object({
  layerName: v.string(),
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  tile: v.number(),
});

const setCollisionValidator = v.object({
  x: v.number(),
  y: v.number(),
  blocked: v.boolean(),
});

const addWorldItemValidator = v.object({
  itemDefName: v.string(),
  x: v.number(),
  y: v.number(),
  quantity: v.optional(v.number()),
  respawn: v.optional(v.boolean()),
  respawnMs: v.optional(v.number()),
});

const mapPlanValidator = v.object({
  mapName: v.string(),
  moveObjects: v.optional(v.array(moveObjectValidator)),
  upsertNpcProfiles: v.optional(v.array(npcProfileUpsertValidator)),
  upsertMapObjects: v.optional(v.array(mapObjectUpsertValidator)),
  setTiles: v.optional(v.array(setTileValidator)),
  fillTilesRects: v.optional(v.array(fillTilesRectValidator)),
  setCollision: v.optional(v.array(setCollisionValidator)),
  addWorldItems: v.optional(v.array(addWorldItemValidator)),
});

function indexFor(x: number, y: number, width: number): number {
  return y * width + x;
}

function inBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function toTilesArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => (typeof n === "number" ? n : -1));
  }
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((n) => (typeof n === "number" ? n : -1));
    }
  }
  return [];
}

function toBoolArray(raw: unknown): boolean[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => !!v);
  }
  if (typeof raw === "string") {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => !!v);
    }
  }
  return [];
}

export const applyMapPlan = mutation({
  args: {
    adminKey: v.string(),
    plan: mapPlanValidator,
  },
  returns: v.object({
    mapName: v.string(),
    movedObjects: v.number(),
    upsertedNpcProfiles: v.number(),
    upsertedMapObjects: v.number(),
    addedWorldItems: v.number(),
    setTiles: v.number(),
    setCollision: v.number(),
    mapPatched: v.boolean(),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, { adminKey, plan }) => {
    requireAdminKey(adminKey);

    const warnings: string[] = [];

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", plan.mapName))
      .first();
    if (!map) throw new Error(`Map "${plan.mapName}" not found`);

    const width = map.width;
    const height = map.height;
    const expectedSize = width * height;

    // Prepare mutable layer copies.
    const layers = map.layers.map((layer) => ({
      ...layer,
      tilesArray: toTilesArray(layer.tiles),
    }));
    for (const layer of layers) {
      if (layer.tilesArray.length !== expectedSize) {
        warnings.push(
          `Layer "${layer.name}" length ${layer.tilesArray.length} does not match ${expectedSize}; resizing with -1 fill.`,
        );
        layer.tilesArray.length = expectedSize;
        for (let i = 0; i < expectedSize; i++) {
          if (typeof layer.tilesArray[i] !== "number") layer.tilesArray[i] = -1;
        }
      }
    }

    const collisionMask = toBoolArray(map.collisionMask);
    if (collisionMask.length !== expectedSize) {
      warnings.push(
        `collisionMask length ${collisionMask.length} does not match ${expectedSize}; resizing with false fill.`,
      );
      collisionMask.length = expectedSize;
      for (let i = 0; i < expectedSize; i++) {
        if (typeof collisionMask[i] !== "boolean") collisionMask[i] = false;
      }
    }

    const layerIndexByName = new Map<string, number>();
    layers.forEach((layer, i) => layerIndexByName.set(layer.name, i));

    let movedObjects = 0;
    let upsertedNpcProfiles = 0;
    let upsertedMapObjects = 0;
    let addedWorldItems = 0;
    let setTiles = 0;
    let setCollision = 0;
    let mapPatched = false;

    // Move existing objects.
    for (const move of plan.moveObjects ?? []) {
      let obj = move.id !== undefined ? await ctx.db.get(move.id) : null;
      if (!obj && move.instanceName) {
        obj = await ctx.db
          .query("mapObjects")
          .withIndex("by_instanceName", (q) =>
            q.eq("instanceName", move.instanceName),
          )
          .first();
      }
      if (!obj) {
        warnings.push(
          `moveObjects: object not found (id=${String(move.id ?? "")}, instanceName=${move.instanceName ?? ""})`,
        );
        continue;
      }
      if (obj.mapName !== plan.mapName) {
        warnings.push(
          `moveObjects: object "${obj._id}" belongs to map "${obj.mapName}", not "${plan.mapName}". Skipped.`,
        );
        continue;
      }

      await ctx.db.patch(obj._id, {
        x: move.x,
        y: move.y,
        layer: move.layer ?? obj.layer,
        updatedAt: Date.now(),
      });
      movedObjects++;
    }

    // Upsert NPC profiles.
    for (const npc of plan.upsertNpcProfiles ?? []) {
      const existing = await ctx.db
        .query("npcProfiles")
        .withIndex("by_name", (q) => q.eq("name", npc.name))
        .first();

      const payload = {
        name: npc.name,
        displayName: npc.displayName,
        spriteDefName: npc.spriteDefName,
        mapName: npc.mapName ?? plan.mapName,
        title: npc.title,
        backstory: npc.backstory,
        personality: npc.personality,
        dialogueStyle: npc.dialogueStyle,
        moveSpeed: npc.moveSpeed,
        wanderRadius: npc.wanderRadius,
        greeting: npc.greeting,
        updatedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("npcProfiles", payload);
      }
      upsertedNpcProfiles++;
    }

    // Upsert map objects by instance name (within map).
    for (const obj of plan.upsertMapObjects ?? []) {
      const existing = await ctx.db
        .query("mapObjects")
        .withIndex("by_instanceName", (q) =>
          q.eq("instanceName", obj.instanceName),
        )
        .first();

      if (existing && existing.mapName === plan.mapName) {
        await ctx.db.patch(existing._id, {
          spriteDefName: obj.spriteDefName,
          layer: obj.layer,
          x: obj.x,
          y: obj.y,
          scaleOverride: obj.scaleOverride,
          flipX: obj.flipX,
          updatedAt: Date.now(),
        });
      } else if (existing && existing.mapName !== plan.mapName) {
        warnings.push(
          `upsertMapObjects: instanceName "${obj.instanceName}" exists on map "${existing.mapName}". Inserted new object for "${plan.mapName}".`,
        );
        await ctx.db.insert("mapObjects", {
          mapName: plan.mapName,
          instanceName: obj.instanceName,
          spriteDefName: obj.spriteDefName,
          layer: obj.layer,
          x: obj.x,
          y: obj.y,
          scaleOverride: obj.scaleOverride,
          flipX: obj.flipX,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("mapObjects", {
          mapName: plan.mapName,
          instanceName: obj.instanceName,
          spriteDefName: obj.spriteDefName,
          layer: obj.layer,
          x: obj.x,
          y: obj.y,
          scaleOverride: obj.scaleOverride,
          flipX: obj.flipX,
          updatedAt: Date.now(),
        });
      }
      upsertedMapObjects++;
    }

    // Tile edits: point set.
    for (const edit of plan.setTiles ?? []) {
      const layerIdx = layerIndexByName.get(edit.layerName);
      if (layerIdx === undefined) {
        warnings.push(`setTiles: layer "${edit.layerName}" not found`);
        continue;
      }
      if (!inBounds(edit.x, edit.y, width, height)) {
        warnings.push(
          `setTiles: out of bounds (${edit.x},${edit.y}) for layer "${edit.layerName}"`,
        );
        continue;
      }
      layers[layerIdx].tilesArray[indexFor(edit.x, edit.y, width)] = edit.tile;
      setTiles++;
      mapPatched = true;
    }

    // Tile edits: rectangle fill.
    for (const fill of plan.fillTilesRects ?? []) {
      const layerIdx = layerIndexByName.get(fill.layerName);
      if (layerIdx === undefined) {
        warnings.push(`fillTilesRects: layer "${fill.layerName}" not found`);
        continue;
      }
      const minX = Math.min(fill.x1, fill.x2);
      const maxX = Math.max(fill.x1, fill.x2);
      const minY = Math.min(fill.y1, fill.y2);
      const maxY = Math.max(fill.y1, fill.y2);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!inBounds(x, y, width, height)) {
            warnings.push(
              `fillTilesRects: out of bounds (${x},${y}) for layer "${fill.layerName}"`,
            );
            continue;
          }
          layers[layerIdx].tilesArray[indexFor(x, y, width)] = fill.tile;
          setTiles++;
        }
      }
      mapPatched = true;
    }

    // Collision edits.
    for (const edit of plan.setCollision ?? []) {
      if (!inBounds(edit.x, edit.y, width, height)) {
        warnings.push(`setCollision: out of bounds (${edit.x},${edit.y})`);
        continue;
      }
      collisionMask[indexFor(edit.x, edit.y, width)] = edit.blocked;
      setCollision++;
      mapPatched = true;
    }

    if (mapPatched) {
      await ctx.db.patch(map._id, {
        layers: layers.map(({ tilesArray, ...layer }) => ({
          ...layer,
          tiles: JSON.stringify(tilesArray),
        })),
        collisionMask: JSON.stringify(collisionMask),
        updatedAt: Date.now(),
      });
    }

    // Add world items.
    for (const item of plan.addWorldItems ?? []) {
      const def = await ctx.db
        .query("itemDefs")
        .withIndex("by_name", (q) => q.eq("name", item.itemDefName))
        .first();
      if (!def) {
        warnings.push(
          `addWorldItems: itemDef "${item.itemDefName}" not found; skipped.`,
        );
        continue;
      }
      await ctx.db.insert("worldItems", {
        mapName: plan.mapName,
        itemDefName: item.itemDefName,
        x: item.x,
        y: item.y,
        quantity: item.quantity ?? 1,
        respawn: item.respawn,
        respawnMs: item.respawnMs,
        updatedAt: Date.now(),
      });
      addedWorldItems++;
    }

    // Keep NPC runtime state synced after object/profile changes.
    if (movedObjects > 0 || upsertedMapObjects > 0 || upsertedNpcProfiles > 0) {
      await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, {
        mapName: plan.mapName,
      });
    }

    return {
      mapName: plan.mapName,
      movedObjects,
      upsertedNpcProfiles,
      upsertedMapObjects,
      addedWorldItems,
      setTiles,
      setCollision,
      mapPatched,
      warnings,
    };
  },
});
