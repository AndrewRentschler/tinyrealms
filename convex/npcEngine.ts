/**
 * Server-authoritative NPC movement engine.
 *
 * NPCs wander server-side via a self-scheduling tick loop so that all clients
 * see the same NPC positions, and NPCs keep moving even when no players are
 * connected.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TICK_MS = 1500; // server tick interval (ms) — was 500ms, increased to reduce DB growth
const IDLE_MIN_MS = 3000; // minimum idle pause before next wander
const IDLE_MAX_MS = 8000; // maximum idle pause
const STALE_THRESHOLD_MS = TICK_MS * 4; // if no tick in this long, loop is dead
const AGGRO_FOLLOW_STOP_DISTANCE_PX = 42; // don't overlap target while chasing

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all NPC states on a given map (clients subscribe to this) */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    const now = Date.now();
    const all = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    return all.filter((s) => s.respawnAt == null || s.respawnAt <= now);
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
    const allPresence = await ctx.db.query("presence").collect();
    const presenceByProfileId = new Map(
      allPresence.map((p) => [String(p.profileId), p]),
    );
    const allProfiles = await ctx.db.query("profiles").collect();
    const profileById = new Map(allProfiles.map((p) => [String(p._id), p]));

    for (const npc of allNpcs) {
      if (npc.respawnAt != null) {
        if (now >= npc.respawnAt) {
          const restoredHp = Math.max(1, npc.maxHp ?? npc.currentHp ?? 20);
          await ctx.db.patch(npc._id, {
            x: npc.spawnX,
            y: npc.spawnY,
            vx: 0,
            vy: 0,
            targetX: undefined,
            targetY: undefined,
            idleUntil: now + IDLE_MIN_MS,
            currentHp: restoredHp,
            maxHp: restoredHp,
            defeatedAt: undefined,
            respawnAt: undefined,
            lastHitAt: undefined,
            aggroTargetProfileId: undefined,
            aggroUntil: undefined,
            lastTick: now,
          });
        }
        continue;
      }

      // --- Aggro follow logic ---
      let chaseTargetX: number | undefined;
      let chaseTargetY: number | undefined;
      if (npc.aggroTargetProfileId != null) {
        if (npc.aggroUntil == null || npc.aggroUntil <= now) {
          await ctx.db.patch(npc._id, {
            aggroTargetProfileId: undefined,
            aggroUntil: undefined,
          });
        } else {
          const targetId = String(npc.aggroTargetProfileId);
          const live = presenceByProfileId.get(targetId);
          const liveOnSameMap =
            live != null && (live.mapName ?? "") === npc.mapName;
          if (liveOnSameMap) {
            chaseTargetX = live!.x;
            chaseTargetY = live!.y;
          } else {
            const profile = profileById.get(targetId);
            const profileOnSameMap =
              profile != null &&
              (profile.mapName ?? "") === npc.mapName &&
              typeof profile.x === "number" &&
              typeof profile.y === "number";
            if (profileOnSameMap) {
              chaseTargetX = Number(profile!.x);
              chaseTargetY = Number(profile!.y);
            }
          }
        }
      }

      if (chaseTargetX != null && chaseTargetY != null) {
        const dx = chaseTargetX - npc.x;
        const dy = chaseTargetY - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= AGGRO_FOLLOW_STOP_DISTANCE_PX) {
          // Close enough: stop and face target, don't wander while aggroed.
          const direction =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? "right"
                : "left"
              : dy > 0
                ? "down"
                : "up";
          if (
            npc.vx !== 0 ||
            npc.vy !== 0 ||
            npc.targetX != null ||
            npc.targetY != null ||
            npc.direction !== direction
          ) {
            await ctx.db.patch(npc._id, {
              vx: 0,
              vy: 0,
              targetX: undefined,
              targetY: undefined,
              idleUntil: undefined,
              direction,
              lastTick: now,
            });
          }
          continue;
        }
      }

      // --- Idle check ---
      if (npc.idleUntil && now < npc.idleUntil) {
        // Still pausing — only patch if velocity needs zeroing (skip no-op writes)
        if (npc.vx !== 0 || npc.vy !== 0) {
          await ctx.db.patch(npc._id, { vx: 0, vy: 0, lastTick: now });
        }
        // Otherwise skip entirely — no DB write needed for idle NPCs
        continue;
      }

      // --- Pick a new target if we don't have one ---
      let targetX = npc.targetX;
      let targetY = npc.targetY;

      // Aggro takes priority over wander.
      if (chaseTargetX != null && chaseTargetY != null) {
        targetX = chaseTargetX;
        targetY = chaseTargetY;
      }

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
    const profiles = await ctx.db.query("npcProfiles").collect();
    const profileByName = new Map(profiles.map((p) => [p.name, p]));

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
      const def = defs.find((d) => d.name === obj.spriteDefName);
      const profile =
        typeof obj.instanceName === "string"
          ? profileByName.get(obj.instanceName)
          : undefined;
      const resolvedSpeed =
        typeof profile?.moveSpeed === "number"
          ? profile.moveSpeed
          : (def?.npcSpeed ?? 30);
      const resolvedWanderRadius =
        typeof profile?.wanderRadius === "number"
          ? profile.wanderRadius
          : (def?.npcWanderRadius ?? 60);
      if (existing) {
        // Keep instance identity and behavior tuning in sync.
        const patch: Partial<
          Pick<Doc<"npcState">, "instanceName" | "speed" | "wanderRadius">
        > = {};
        if (existing.instanceName !== obj.instanceName) {
          patch.instanceName = obj.instanceName;
        }
        if (existing.speed !== resolvedSpeed) {
          patch.speed = resolvedSpeed;
        }
        if (existing.wanderRadius !== resolvedWanderRadius) {
          patch.wanderRadius = resolvedWanderRadius;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existing._id, patch);
        }
      } else {
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
          speed: resolvedSpeed,
          wanderRadius: resolvedWanderRadius,
          currentHp: undefined,
          maxHp: undefined,
          defeatedAt: undefined,
          respawnAt: undefined,
          lastHitAt: undefined,
          aggroTargetProfileId: undefined,
          aggroUntil: undefined,
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
