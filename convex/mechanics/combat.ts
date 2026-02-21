import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";

const DEFAULT_ATTACK_RANGE_PX = 64;
const DEFAULT_PLAYER_ATTACK_COOLDOWN_MS = 350;
const DEFAULT_NPC_RESPAWN_MS = 15_000;
const DEFAULT_NPC_HIT_COOLDOWN_MS = 550;
const DEFAULT_DAMAGE_VARIANCE_PCT = 20;
const DEFAULT_AGGRO_MEMORY_MS = 15_000;
const DEFAULT_FLEE_DISTANCE_PX = 140;
const HIGH_AGGRESSION = "high";
const MEDIUM_AGGRESSION = "medium";
const LOW_AGGRESSION = "low";
const ENEMY_TAG = "hostile";

/** Set to true to enable verbose server-side combat logging. */
const COMBAT_DEBUG = false;

function combatLog(...args: unknown[]) {
  if (COMBAT_DEBUG) console.log(...args);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function resolveAggression(profile: Doc<"npcProfiles"> | undefined) {
  const raw = (profile as any)?.aggression;
  if (raw === HIGH_AGGRESSION || raw === LOW_AGGRESSION || raw === MEDIUM_AGGRESSION) return raw;
  return MEDIUM_AGGRESSION;
}

export const getEncounter = query({
  args: { id: v.id("combatEncounters") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const createEncounter = mutation({
  args: {
    enemies: v.any(),
    rewards: v.any(),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("combatEncounters", args);
  },
});

export const submitAction = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
    action: v.any(),
  },
  handler: async (ctx, { encounterId, profileId, action: playerAction }) => {
    // Server-authoritative combat resolution
    // For now, return the action as a turn log entry
    // Full combat engine will be implemented in Phase 7
    const encounter = await ctx.db.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    return {
      action: playerAction,
      result: "pending",
      message: "Combat engine pending implementation",
    };
  },
});

export const logCombat = mutation({
  args: {
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
    turns: v.any(),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("combatLog", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const attackNearestHostile = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { profileId, mapName, x, y }) => {
    combatLog("[CombatDebug:server] attack request", {
      profileId: String(profileId),
      mapName,
      x: Math.round(x),
      y: Math.round(y),
    });

    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map?.combatEnabled) {
      combatLog("[CombatDebug:server] rejected: combat disabled", { mapName });
      return { success: false, reason: "Combat is disabled on this map." as const };
    }
    const settings = (map as any).combatSettings ?? {};
    const attackRangePx = clamp(
      Number(settings.attackRangePx ?? DEFAULT_ATTACK_RANGE_PX),
      24,
      256,
    );
    const playerAttackCooldownMs = clamp(
      Number(settings.playerAttackCooldownMs ?? DEFAULT_PLAYER_ATTACK_COOLDOWN_MS),
      100,
      2000,
    );
    const npcHitCooldownMs = clamp(
      Number(settings.npcHitCooldownMs ?? DEFAULT_NPC_HIT_COOLDOWN_MS),
      100,
      2500,
    );
    const damageVariancePct = clamp(
      Number(settings.damageVariancePct ?? DEFAULT_DAMAGE_VARIANCE_PCT),
      0,
      100,
    );

    const player = await ctx.db.get(profileId);
    if (!player) {
      combatLog("[CombatDebug:server] rejected: missing player", { profileId: String(profileId) });
      return { success: false, reason: "Player profile not found." as const };
    }

    const now = Date.now();
    const npcProfiles = await ctx.db.query("npcProfiles").collect();
    const npcByName = new Map(npcProfiles.map((p) => [p.name, p]));

    const states = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjectInstanceNameById = new Map(
      mapObjects.map((o) => [String(o._id), o.instanceName]),
    );

    const hostiles = states.filter((s) => {
      const instanceName =
        s.instanceName ?? mapObjectInstanceNameById.get(String(s.mapObjectId));
      if (!instanceName) return false;
      const profile = npcByName.get(instanceName);
      if (!profile) return false;
      if (!profile.tags?.includes(ENEMY_TAG)) return false;
      if (s.respawnAt != null && now < s.respawnAt) return false;
      return true;
    });
    combatLog("[CombatDebug:server] target scan", {
      mapName,
      npcStateCount: states.length,
      hostileCount: hostiles.length,
    });

    if (hostiles.length === 0) {
      combatLog("[CombatDebug:server] rejected: no hostiles");
      return { success: false, reason: "No hostile NPC nearby." as const };
    }

    let nearest: Doc<"npcState"> | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const s of hostiles) {
      const dx = s.x - x;
      const dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }

    if (!nearest || nearestDist > attackRangePx) {
      combatLog("[CombatDebug:server] rejected: out of range", {
        nearestDist: Number.isFinite(nearestDist) ? Math.round(nearestDist) : null,
        attackRangePx,
      });
      return { success: false, reason: "No hostile NPC in attack range." as const };
    }
    if (nearest.lastHitAt != null && now - nearest.lastHitAt < npcHitCooldownMs) {
      combatLog("[CombatDebug:server] rejected: npc hit cooldown", {
        elapsedMs: now - nearest.lastHitAt,
        npcHitCooldownMs,
        npcId: String(nearest._id),
      });
      return { success: false, reason: "Target is recovering, attack in a moment." as const };
    }

    const nearestInstanceName =
      nearest.instanceName ?? mapObjectInstanceNameById.get(String(nearest.mapObjectId));
    if (!nearestInstanceName) {
      combatLog("[CombatDebug:server] rejected: missing instanceName", {
        npcId: String(nearest._id),
        mapObjectId: String(nearest.mapObjectId),
      });
      return { success: false, reason: "Target instance is missing." as const };
    }
    const npcProfile = npcByName.get(nearestInstanceName);
    if (!npcProfile) {
      combatLog("[CombatDebug:server] rejected: missing npc profile", {
        nearestInstanceName,
      });
      return { success: false, reason: "Target profile is missing." as const };
    }

    const npcStats = npcProfile.stats ?? {
      hp: 20,
      maxHp: 20,
      atk: 4,
      def: 1,
      spd: 1,
      level: 1,
    };
    const aggression = resolveAggression(npcProfile);

    const enemyMaxHp = Math.max(1, nearest.maxHp ?? npcStats.maxHp ?? npcStats.hp ?? 20);
    const enemyHp = Math.max(0, nearest.currentHp ?? npcStats.hp ?? enemyMaxHp);

    const playerAtk = Math.max(1, player.stats.atk ?? 1);
    const enemyDef = Math.max(0, npcStats.def ?? 0);
    const basePlayerDamage = Math.max(1, Math.round(playerAtk - enemyDef * 0.4));
    const dealtVariance = Math.round(
      basePlayerDamage * ((Math.random() * 2 - 1) * (damageVariancePct / 100)),
    );
    const dealt = Math.max(1, basePlayerDamage + dealtVariance);

    const nextEnemyHp = Math.max(0, enemyHp - dealt);
    const defeated = nextEnemyHp <= 0;

    let took = 0;
    let xpGained = 0;
    const droppedLoot: Array<{ itemDefName: string; quantity: number }> = [];

    if (defeated) {
      xpGained = Math.max(1, Math.round((npcStats.level ?? 1) * 8));
      const nextXp = (player.stats.xp ?? 0) + xpGained;
      await ctx.db.patch(profileId, {
        stats: {
          ...player.stats,
          xp: nextXp,
        },
      });

      await ctx.db.patch(nearest._id, {
        currentHp: 0,
        maxHp: enemyMaxHp,
        defeatedAt: now,
        respawnAt: now + DEFAULT_NPC_RESPAWN_MS,
        lastHitAt: now,
        aggroTargetProfileId: undefined,
        aggroUntil: undefined,
        vx: 0,
        vy: 0,
        targetX: undefined,
        targetY: undefined,
      });

      const firstLoot = (npcProfile.items ?? []).find((i) => i.quantity > 0);
      if (firstLoot) {
        const itemDef = await ctx.db
          .query("itemDefs")
          .withIndex("by_name", (q) => q.eq("name", firstLoot.name))
          .first();
        if (itemDef) {
          const quantity = 1;
          await ctx.db.insert("worldItems", {
            mapName,
            itemDefName: itemDef.name,
            x: nearest.x,
            y: nearest.y,
            quantity,
            respawn: false,
            updatedAt: now,
          });
          droppedLoot.push({ itemDefName: itemDef.name, quantity });
        }
      }

      // TODO: Uncomment this when quests are implemented
      // Quest progress: kill objective tracking (instance name and sprite def).
      // await ctx.runMutation(internal.quests.recordKillProgress, {
      //   profileId,
      //   targetNpcProfileName: nearestInstanceName,
      //   targetSpriteDefName: nearest.spriteDefName,
      //   count: 1,
      // });
    } else {
      // Medium/high hostiles become actively engaged after first hit.
      // Low aggression hostiles flee instead of locking aggro.
      let nextAggroTargetProfileId: Doc<"npcState">["aggroTargetProfileId"] = undefined;
      let nextAggroUntil: number | undefined = undefined;
      let fleeTargetX: number | undefined = undefined;
      let fleeTargetY: number | undefined = undefined;

      if (aggression === LOW_AGGRESSION) {
        const awayDx = nearest.x - x;
        const awayDy = nearest.y - y;
        const len = Math.sqrt(awayDx * awayDx + awayDy * awayDy) || 1;
        const nx = awayDx / len;
        const ny = awayDy / len;
        fleeTargetX = nearest.x + nx * DEFAULT_FLEE_DISTANCE_PX;
        fleeTargetY = nearest.y + ny * DEFAULT_FLEE_DISTANCE_PX;
      } else {
        nextAggroTargetProfileId = profileId;
        nextAggroUntil = now + DEFAULT_AGGRO_MEMORY_MS;
      }

      const enemyAtk = Math.max(1, npcStats.atk ?? 1);
      const playerDef = Math.max(0, player.stats.def ?? 0);
      const baseEnemyDamage = Math.max(0, Math.round(enemyAtk - playerDef * 0.35));
      const tookVariance = Math.round(
        baseEnemyDamage * ((Math.random() * 2 - 1) * (damageVariancePct / 100)),
      );
      took = Math.max(0, baseEnemyDamage + tookVariance);
      const nextPlayerHp = Math.max(0, (player.stats.hp ?? player.stats.maxHp) - took);

      await ctx.db.patch(profileId, {
        stats: {
          ...player.stats,
          hp: nextPlayerHp,
        },
      });

      await ctx.db.patch(nearest._id, {
        currentHp: nextEnemyHp,
        maxHp: enemyMaxHp,
        lastHitAt: now,
        aggroTargetProfileId: nextAggroTargetProfileId,
        aggroUntil: nextAggroUntil,
        targetX: fleeTargetX,
        targetY: fleeTargetY,
        idleUntil: fleeTargetX != null ? undefined : nearest.idleUntil,
      });
    }

    combatLog("[CombatDebug:server] resolved", {
      target: npcProfile.displayName || npcProfile.name,
      defeated,
      dealt,
      took,
      targetHp: defeated ? 0 : nextEnemyHp,
      targetMaxHp: enemyMaxHp,
      xpGained,
      droppedLootCount: droppedLoot.length,
      nearestDist: Math.round(nearestDist),
      attackRangePx,
    });

    return {
      success: true,
      targetName: npcProfile.displayName || npcProfile.name,
      targetInstanceName: nearestInstanceName,
      distance: Math.round(nearestDist),
      dealt,
      took,
      targetHp: defeated ? 0 : nextEnemyHp,
      targetMaxHp: enemyMaxHp,
      defeated,
      xpGained,
      droppedLoot,
      attackRangePx,
      playerAttackCooldownMs,
      npcHitCooldownMs,
      damageVariancePct,
      aggression,
    };
  },
});

export const resolveAggroAttack = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { profileId, mapName, x, y }) => {
    const map = await ctx.db
      .query("maps")
      .withIndex("by_name", (q) => q.eq("name", mapName))
      .first();
    if (!map?.combatEnabled) return { success: false, reason: "combat_disabled" as const };

    const settings = (map as any).combatSettings ?? {};
    const attackRangePx = clamp(
      Number(settings.attackRangePx ?? DEFAULT_ATTACK_RANGE_PX),
      24,
      256,
    );
    const npcHitCooldownMs = clamp(
      Number(settings.npcHitCooldownMs ?? DEFAULT_NPC_HIT_COOLDOWN_MS),
      100,
      2500,
    );
    const damageVariancePct = clamp(
      Number(settings.damageVariancePct ?? DEFAULT_DAMAGE_VARIANCE_PCT),
      0,
      100,
    );

    const player = await ctx.db.get(profileId);
    if (!player) return { success: false, reason: "missing_player" as const };
    const now = Date.now();

    const npcProfiles = await ctx.db.query("npcProfiles").collect();
    const npcByName = new Map(npcProfiles.map((p) => [p.name, p]));
    const states = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const mapObjectInstanceNameById = new Map(
      mapObjects.map((o) => [String(o._id), o.instanceName]),
    );

    let nearest: Doc<"npcState"> | null = null;
    let nearestProfile: Doc<"npcProfiles"> | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const s of states) {
      if (s.respawnAt != null && now < s.respawnAt) continue;
      if (s.lastHitAt != null && now - s.lastHitAt < npcHitCooldownMs) continue;

      const instanceName =
        s.instanceName ?? mapObjectInstanceNameById.get(String(s.mapObjectId));
      if (!instanceName) continue;
      const profile = npcByName.get(instanceName);
      if (!profile) continue;
      if (!profile.tags?.includes(ENEMY_TAG)) continue;

      const aggression = resolveAggression(profile);
      const canAggro =
        aggression === HIGH_AGGRESSION ||
        (aggression === MEDIUM_AGGRESSION &&
          s.aggroTargetProfileId === profileId &&
          s.aggroUntil != null &&
          s.aggroUntil > now);
      if (!canAggro) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > attackRangePx) continue;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
        nearestProfile = profile;
      }
    }

    if (!nearest || !nearestProfile) {
      return { success: false, reason: "no_aggro_target" as const };
    }

    const npcStats = nearestProfile.stats ?? {
      hp: 20,
      maxHp: 20,
      atk: 4,
      def: 1,
      spd: 1,
      level: 1,
    };
    const enemyAtk = Math.max(1, npcStats.atk ?? 1);
    const playerDef = Math.max(0, player.stats.def ?? 0);
    const baseEnemyDamage = Math.max(0, Math.round(enemyAtk - playerDef * 0.35));
    const tookVariance = Math.round(
      baseEnemyDamage * ((Math.random() * 2 - 1) * (damageVariancePct / 100)),
    );
    const took = Math.max(0, baseEnemyDamage + tookVariance);
    const nextPlayerHp = Math.max(0, (player.stats.hp ?? player.stats.maxHp) - took);

    await ctx.db.patch(profileId, {
      stats: {
        ...player.stats,
        hp: nextPlayerHp,
      },
    });

    await ctx.db.patch(nearest._id, {
      aggroTargetProfileId: profileId,
      aggroUntil: now + DEFAULT_AGGRO_MEMORY_MS,
    });

    return {
      success: true,
      attackerName: nearestProfile.displayName || nearestProfile.name,
      took,
      playerHp: nextPlayerHp,
      attackRangePx,
      aggression: resolveAggression(nearestProfile),
    };
  },
});
