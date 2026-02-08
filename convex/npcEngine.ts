/**
 * Server-authoritative NPC movement engine.
 *
 * NPCs wander server-side via a self-scheduling tick loop so that all clients
 * see the same NPC positions, and NPCs keep moving even when no players are
 * connected.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TICK_MS = 500; // server tick interval (ms)
const IDLE_MIN_MS = 1500; // minimum idle pause before next wander
const IDLE_MAX_MS = 5000; // maximum idle pause
const STALE_THRESHOLD_MS = TICK_MS * 4; // if no tick in this long, loop is dead

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all NPC states on a given map (clients subscribe to this) */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Tick loop (internal — not callable from client)
// ---------------------------------------------------------------------------

/** The main NPC tick. Moves all NPCs one step, then reschedules itself. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allNpcs = await ctx.db.query("npcState").collect();
    if (allNpcs.length === 0) return; // nothing to do, loop stops naturally

    const now = Date.now();
    const dt = TICK_MS / 1000; // seconds per tick

    for (const npc of allNpcs) {
      // --- Idle check ---
      if (npc.idleUntil && now < npc.idleUntil) {
        // Still pausing — ensure velocity is zero
        if (npc.vx !== 0 || npc.vy !== 0) {
          await ctx.db.patch(npc._id, { vx: 0, vy: 0, lastTick: now });
        } else {
          await ctx.db.patch(npc._id, { lastTick: now });
        }
        continue;
      }

      // --- Pick a new target if we don't have one ---
      let targetX = npc.targetX;
      let targetY = npc.targetY;

      if (targetX == null || targetY == null) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * npc.wanderRadius;
        targetX = npc.spawnX + Math.cos(angle) * dist;
        targetY = npc.spawnY + Math.sin(angle) * dist;
      }

      // --- Move toward target ---
      const dx = targetX - npc.x;
      const dy = targetY - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = npc.speed * dt;

      if (dist <= step + 1) {
        // Reached target — go idle
        const idleDuration =
          IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
        await ctx.db.patch(npc._id, {
          x: targetX,
          y: targetY,
          vx: 0,
          vy: 0,
          targetX: undefined,
          targetY: undefined,
          idleUntil: now + idleDuration,
          direction: npc.direction, // keep last direction
          lastTick: now,
        });
      } else {
        // Step toward target
        const ratio = step / dist;
        const newX = npc.x + dx * ratio;
        const newY = npc.y + dy * ratio;

        // Velocity for client extrapolation
        const vx = (dx / dist) * npc.speed;
        const vy = (dy / dist) * npc.speed;

        // Determine facing direction
        const direction =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";

        await ctx.db.patch(npc._id, {
          x: newX,
          y: newY,
          vx,
          vy,
          targetX,
          targetY,
          direction,
          idleUntil: undefined,
          lastTick: now,
        });
      }
    }

    // Reschedule the next tick
    await ctx.scheduler.runAfter(TICK_MS, internal.npcEngine.tick, {});
  },
});

// ---------------------------------------------------------------------------
// Sync npcState from mapObjects (called after editor saves)
// ---------------------------------------------------------------------------

/**
 * Synchronise the npcState table with mapObjects for a given map.
 * - Creates npcState rows for new NPC objects
 * - Removes npcState rows for deleted NPC objects
 * - Leaves existing NPC positions untouched (they keep wandering)
 */
export const syncMap = internalMutation({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    // All objects on this map
    const objects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    // All sprite definitions — we need to know which are NPCs
    const defs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      defs.filter((d) => d.category === "npc").map((d) => d.name),
    );

    // Current npcState rows for this map
    const currentStates = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const stateByObjectId = new Map(
      currentStates.map((s) => [s.mapObjectId as string, s]),
    );

    // NPC objects from mapObjects
    const npcObjects = objects.filter((o) => npcDefNames.has(o.spriteDefName));
    const npcObjectIds = new Set(npcObjects.map((o) => o._id as string));

    const now = Date.now();

    // Create missing npcState rows  (+ update instanceName on existing ones)
    for (const obj of npcObjects) {
      const existing = stateByObjectId.get(obj._id as string);
      if (existing) {
        // Keep instanceName in sync with mapObject
        if (existing.instanceName !== obj.instanceName) {
          await ctx.db.patch(existing._id, { instanceName: obj.instanceName });
        }
      } else {
        const def = defs.find((d) => d.name === obj.spriteDefName);
        await ctx.db.insert("npcState", {
          mapName,
          mapObjectId: obj._id,
          spriteDefName: obj.spriteDefName,
          instanceName: obj.instanceName,
          x: obj.x,
          y: obj.y,
          spawnX: obj.x,
          spawnY: obj.y,
          direction: "down",
          vx: 0,
          vy: 0,
          speed: def?.npcSpeed ?? 30,
          wanderRadius: def?.npcWanderRadius ?? 60,
          lastTick: now,
        });
      }
    }

    // Remove npcState rows for deleted NPC objects
    for (const state of currentStates) {
      if (!npcObjectIds.has(state.mapObjectId as string)) {
        await ctx.db.delete(state._id);
      }
    }

    // Always (re)start the tick loop after a sync if there are NPCs.
    // This is safe — if a tick is already scheduled, the worst that happens
    // is one overlapping tick, which is harmless for wander logic.
    const anyNpc = await ctx.db.query("npcState").first();
    if (anyNpc) {
      await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
    }
  },
});

// ---------------------------------------------------------------------------
// Ensure the tick loop is running (called by clients on connect)
// ---------------------------------------------------------------------------

export const ensureLoop = mutation({
  args: {},
  handler: async (ctx) => {
    const anyNpc = await ctx.db.query("npcState").first();
    if (!anyNpc) return;

    // Check if there's been a recent tick by looking for any NPC whose
    // lastTick changed recently AND has non-zero velocity or a target
    // (indicating active movement from the tick loop, not just creation).
    const now = Date.now();
    const allStates = await ctx.db.query("npcState").collect();
    const hasActiveTick = allStates.some(
      (s) =>
        s.lastTick > now - STALE_THRESHOLD_MS &&
        (s.vx !== 0 || s.vy !== 0 || s.targetX != null || s.idleUntil != null),
    );

    if (!hasActiveTick) {
      console.log("[NPC Engine] Loop appears dead, restarting tick...");
      await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
    }
  },
});

// ---------------------------------------------------------------------------
// Admin: clear all NPC state (useful for debugging)
// ---------------------------------------------------------------------------
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("npcState").collect();
    for (const s of all) {
      await ctx.db.delete(s._id);
    }
    return { deleted: all.length };
  },
});
