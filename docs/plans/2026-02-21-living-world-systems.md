# Living World Systems Design

**Date:** 2026-02-21  
**Status:** Draft  
**Author:** Buddy  

This document outlines the design for making Tiny Realms a living, breathing world where NPCs have needs, forage for food, rest, and make intelligent decisions using pathfinding and AI.

---

## Table of Contents

1. [Overview](#overview)
2. [Time System (Day/Night Cycle)](#time-system-daynightcycle)
3. [Natural Item Spawning](#natural-item-spawning)
4. [Food & Foraging System](#food--foraging-system)
5. [Farming System](#farming-system)
6. [Energy/Hunger System](#energyhunger-system)
7. [NPC Pathfinding (Dijkstra)](#npc-pathfinding-dijkstra)
8. [NPC Spatial Memory](#npc-spatial-memory)
9. [NPC Rest System](#npc-rest-system)
10. [NPC AI Decision Making](#npc-ai-decision-making)
11. [Implementation Phases](#implementation-phases)

---

## Overview

### Goals

1. **Natural Items**: Items spawn organically in the world (berries on bushes, mushrooms in forests, etc.)
2. **Day/Night Cycle**: Configurable time progression affecting gameplay, visuals, and NPC behavior
3. **Farming**: Players can plant, tend, and harvest crops
4. **Energy System**: Both players and NPCs have energy/hunger that depletes over time
5. **Intelligent NPCs**: NPCs pathfind to food, remember locations, rest when tired, and make decisions using AI

### Design Principles

- **Server-authoritative**: All state changes happen on Convex
- **Tick-based simulation**: Extend the existing npcEngine tick pattern
- **Emergent behavior**: Simple rules create complex, believable NPC behavior
- **Configurable**: Time scales, hunger rates, spawn rates all tunable

---

## Time System (Day/Night Cycle)

### Schema Additions

```typescript
// convex/schema.ts - new table
worldTime: defineTable({
  key: v.literal("global"),           // singleton
  currentTime: v.float64(),           // 0.0 - 24.0 (hours)
  dayNumber: v.number(),              // days elapsed since world start
  timeScale: v.float64(),             // real seconds per game hour (configurable)
  isPaused: v.boolean(),
  lastTickAt: v.number(),             // for tick loop
})
  .index("by_key", ["key"]),

// Default: 60 real seconds = 1 game hour = 24 minutes per full day
// Configurable from 10 seconds/hour (fast) to 3600 seconds/hour (real-time)
```

### Time Periods

| Period | Hours | Lighting | Effects |
|--------|-------|----------|---------|
| Dawn | 5:00-7:00 | Gradual brightening | NPCs wake up |
| Day | 7:00-18:00 | Full brightness | Normal activity |
| Dusk | 18:00-20:00 | Gradual darkening | NPCs head home |
| Night | 20:00-5:00 | Dark + ambient light | NPCs sleep, some creatures spawn |

### Implementation

```typescript
// convex/worldTime.ts
export const tick = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const world = await getWorldTime(ctx);
    
    const elapsedMs = now - world.lastTickAt;
    const elapsedHours = (elapsedMs / 1000) / world.timeScale;
    
    let newTime = world.currentTime + elapsedHours;
    let newDay = world.dayNumber;
    
    if (newTime >= 24) {
      newTime -= 24;
      newDay += 1;
    }
    
    await ctx.db.patch(world._id, {
      currentTime: newTime,
      dayNumber: newDay,
      lastTickAt: now,
    });
    
    // Reschedule (run every ~10 real seconds for smooth transitions)
    await ctx.scheduler.runAfter(10_000, internal.worldTime.tick, {});
  },
});
```

### Frontend Integration

```typescript
// src/engine/DayNightLayer.ts
export class DayNightLayer {
  private overlay: Graphics;
  private currentHour: number = 12;
  
  update(hour: number): void {
    this.currentHour = hour;
    const alpha = this.calculateDarknessAlpha(hour);
    const tint = this.calculateTint(hour);
    this.overlay.clear();
    this.overlay.rect(0, 0, width, height).fill({ color: tint, alpha });
  }
  
  private calculateDarknessAlpha(hour: number): number {
    // Night (22:00-4:00): 0.6 alpha
    // Transition (4:00-6:00, 20:00-22:00): gradual
    // Day: 0 alpha
    if (hour >= 22 || hour < 4) return 0.6;
    if (hour >= 4 && hour < 6) return 0.6 * (1 - (hour - 4) / 2);
    if (hour >= 20 && hour < 22) return 0.6 * ((hour - 20) / 2);
    return 0;
  }
}
```

---

## Natural Item Spawning

### Concept

Items spawn at designated "spawn points" on maps. Each spawn point has:
- A list of possible items to spawn
- Spawn probability and cooldowns
- Maximum concurrent spawns
- Requirements (time of day, weather, season)

### Schema

```typescript
// convex/schema.ts
itemSpawnPoints: defineTable({
  mapName: v.string(),
  x: v.float64(),
  y: v.float64(),
  radius: v.float64(),                 // spawn radius around point
  itemPool: v.array(v.object({
    itemDefName: v.string(),
    weight: v.number(),                // relative probability
  })),
  maxConcurrent: v.number(),           // max items alive from this point
  spawnChancePerTick: v.float64(),     // 0.0-1.0, checked each tick
  minSpawnIntervalMs: v.number(),      // cooldown between spawns
  lastSpawnAt: v.optional(v.number()),
  // Conditions
  requiresTimeRange: v.optional(v.object({
    start: v.number(),                 // hour (0-24)
    end: v.number(),
  })),
  requiresWeather: v.optional(v.string()), // "rainy" | "clear"
})
  .index("by_map", ["mapName"]),

// Track which items came from which spawn point
worldItems: defineTable({
  // ... existing fields ...
  spawnPointId: v.optional(v.id("itemSpawnPoints")),  // NEW
}),
```

### Tick Logic

```typescript
// convex/itemSpawner.ts
export const tick = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const worldTime = await getWorldTime(ctx);
    const weather = await getGlobalWeather(ctx);
    
    const spawnPoints = await ctx.db.query("itemSpawnPoints").collect();
    
    for (const point of spawnPoints) {
      // Check cooldown
      if (point.lastSpawnAt && now - point.lastSpawnAt < point.minSpawnIntervalMs) {
        continue;
      }
      
      // Check time requirement
      if (point.requiresTimeRange) {
        const hour = worldTime.currentTime;
        const { start, end } = point.requiresTimeRange;
        if (start < end) {
          if (hour < start || hour > end) continue;
        } else {
          // Wraps midnight (e.g., 22:00-4:00)
          if (hour < start && hour > end) continue;
        }
      }
      
      // Check weather requirement
      if (point.requiresWeather) {
        if (point.requiresWeather === "rainy" && !weather.rainyNow) continue;
        if (point.requiresWeather === "clear" && weather.rainyNow) continue;
      }
      
      // Check max concurrent
      const existingItems = await ctx.db
        .query("worldItems")
        .withIndex("by_spawnPoint", q => q.eq("spawnPointId", point._id))
        .filter(q => q.eq(q.field("pickedUpAt"), undefined))
        .collect();
      
      if (existingItems.length >= point.maxConcurrent) continue;
      
      // Roll for spawn
      if (Math.random() > point.spawnChancePerTick) continue;
      
      // Pick item from pool (weighted random)
      const item = weightedRandom(point.itemPool);
      
      // Random position within radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * point.radius;
      const x = point.x + Math.cos(angle) * dist;
      const y = point.y + Math.sin(angle) * dist;
      
      await ctx.db.insert("worldItems", {
        mapName: point.mapName,
        itemDefName: item.itemDefName,
        x, y,
        quantity: 1,
        respawn: false,  // spawn points handle respawn
        spawnPointId: point._id,
        updatedAt: now,
      });
      
      await ctx.db.patch(point._id, { lastSpawnAt: now });
    }
    
    // Reschedule
    await ctx.scheduler.runAfter(30_000, internal.itemSpawner.tick, {});
  },
});
```

---

## Food & Foraging System

### Item Types for Food

```typescript
// New item types/tags for food system
const foodItems = {
  // Wild foragables
  "wild_berries": { type: "consumable", energy: 5, tags: ["food", "foragable", "raw"] },
  "mushroom_common": { type: "consumable", energy: 8, tags: ["food", "foragable", "raw"] },
  "wild_apple": { type: "consumable", energy: 10, tags: ["food", "foragable", "fruit"] },
  "acorn": { type: "material", tags: ["food", "foragable", "nut"] }, // Can be eaten raw or cooked
  
  // Crops (from farming)
  "wheat": { type: "material", tags: ["crop", "grain"] },
  "carrot": { type: "consumable", energy: 12, tags: ["food", "crop", "vegetable"] },
  "tomato": { type: "consumable", energy: 10, tags: ["food", "crop", "vegetable"] },
  "potato": { type: "consumable", energy: 15, tags: ["food", "crop", "vegetable", "cooked"] },
  
  // Prepared foods
  "bread": { type: "consumable", energy: 25, tags: ["food", "prepared", "grain"] },
  "berry_pie": { type: "consumable", energy: 40, tags: ["food", "prepared", "dessert"] },
};
```

### Foragable Objects (Trees, Bushes)

Foraging happens through existing mapObjects that are marked as foragable:

```typescript
// convex/schema.ts - extend spriteDefinitions
spriteDefinitions: defineTable({
  // ... existing fields ...
  
  // Foragable properties
  isForagable: v.optional(v.boolean()),
  forageItemPool: v.optional(v.array(v.object({
    itemDefName: v.string(),
    weight: v.number(),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
  }))),
  forageCharges: v.optional(v.number()),      // how many times can be foraged before depleted
  forageRechargeMs: v.optional(v.number()),   // time to regain one charge
  forageAnimationState: v.optional(v.string()), // animation when depleted
}),

// Track forage state per placed object
mapObjects: defineTable({
  // ... existing fields ...
  forageChargesRemaining: v.optional(v.number()),
  forageLastRechargeAt: v.optional(v.number()),
}),
```

### Forage Interaction

```typescript
// convex/mechanics/forage.ts
export const forage = mutation({
  args: {
    profileId: v.id("profiles"),
    mapObjectId: v.id("mapObjects"),
  },
  handler: async (ctx, { profileId, mapObjectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };
    
    const mapObject = await ctx.db.get(mapObjectId);
    if (!mapObject) return { success: false, reason: "Object not found" };
    
    const spriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", q => q.eq("name", mapObject.spriteDefName))
      .first();
    
    if (!spriteDef?.isForagable) {
      return { success: false, reason: "Not foragable" };
    }
    
    // Check charges
    const maxCharges = spriteDef.forageCharges ?? 3;
    const currentCharges = mapObject.forageChargesRemaining ?? maxCharges;
    
    // Recharge logic
    const rechargeMs = spriteDef.forageRechargeMs ?? 300_000; // 5 min default
    const lastRecharge = mapObject.forageLastRechargeAt ?? 0;
    const now = Date.now();
    const rechargedCount = Math.floor((now - lastRecharge) / rechargeMs);
    const effectiveCharges = Math.min(maxCharges, currentCharges + rechargedCount);
    
    if (effectiveCharges <= 0) {
      return { success: false, reason: "Depleted" };
    }
    
    // Pick item from pool
    const item = weightedRandom(spriteDef.forageItemPool!);
    const quantity = randomInt(item.minQuantity ?? 1, item.maxQuantity ?? 1);
    
    // Add to inventory
    const profile = await ctx.db.get(profileId);
    const items = [...profile!.items];
    const existing = items.find(i => i.name === item.itemDefName);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ name: item.itemDefName, quantity });
    }
    await ctx.db.patch(profileId, { items });
    
    // Update object charges
    await ctx.db.patch(mapObjectId, {
      forageChargesRemaining: effectiveCharges - 1,
      forageLastRechargeAt: now,
    });
    
    return { success: true, itemDefName: item.itemDefName, quantity };
  },
});
```

---

## Farming System

### Schema

```typescript
// convex/schema.ts
cropPlots: defineTable({
  mapName: v.string(),
  x: v.float64(),
  y: v.float64(),
  // Ownership
  ownerId: v.optional(v.id("profiles")),  // null = public plot
  
  // Current state
  state: v.union(
    v.literal("empty"),
    v.literal("tilled"),
    v.literal("planted"),
    v.literal("growing"),
    v.literal("ready"),
    v.literal("dead"),
  ),
  cropDefName: v.optional(v.string()),    // references cropDefs
  plantedAt: v.optional(v.number()),
  wateredAt: v.optional(v.number()),
  growthStage: v.optional(v.number()),    // 0 = seed, max = ready
  health: v.optional(v.number()),         // 0-100, affects yield
})
  .index("by_map", ["mapName"])
  .index("by_owner", ["ownerId"]),

cropDefs: defineTable({
  name: v.string(),                       // unique identifier
  displayName: v.string(),
  seedItemDefName: v.string(),            // item needed to plant
  harvestItemDefName: v.string(),         // item produced
  growthStages: v.number(),               // number of visual stages
  growthTimeMs: v.number(),               // total time seed to harvest
  waterIntervalMs: v.number(),            // how often needs water
  waterToleranceMs: v.number(),           // how long without water before damage
  // Sprites for each stage
  stageSprites: v.array(v.object({
    stage: v.number(),
    spriteDefName: v.string(),
  })),
  // Yield
  minYield: v.number(),
  maxYield: v.number(),
  bonusYieldPerHealth: v.number(),        // extra items per 10% health above 50%
})
  .index("by_name", ["name"]),
```

### Farming Actions

```typescript
// convex/mechanics/farming.ts

export const till = mutation({
  args: { profileId: v.id("profiles"), x: v.float64(), y: v.float64(), mapName: v.string() },
  handler: async (ctx, args) => {
    // Check location is valid for farming
    // Create cropPlot in "tilled" state
  },
});

export const plant = mutation({
  args: { profileId: v.id("profiles"), plotId: v.id("cropPlots"), seedItemDefName: v.string() },
  handler: async (ctx, { profileId, plotId, seedItemDefName }) => {
    const plot = await ctx.db.get(plotId);
    if (!plot || plot.state !== "tilled") {
      return { success: false, reason: "Plot not ready" };
    }
    
    // Verify player has seed
    const profile = await ctx.db.get(profileId);
    const seedItem = profile!.items.find(i => i.name === seedItemDefName);
    if (!seedItem || seedItem.quantity < 1) {
      return { success: false, reason: "No seeds" };
    }
    
    // Get crop def
    const cropDef = await ctx.db
      .query("cropDefs")
      .filter(q => q.eq(q.field("seedItemDefName"), seedItemDefName))
      .first();
    if (!cropDef) {
      return { success: false, reason: "Unknown seed type" };
    }
    
    // Remove seed from inventory
    const items = profile!.items.map(i => 
      i.name === seedItemDefName ? { ...i, quantity: i.quantity - 1 } : i
    ).filter(i => i.quantity > 0);
    await ctx.db.patch(profileId, { items });
    
    // Update plot
    await ctx.db.patch(plotId, {
      state: "planted",
      cropDefName: cropDef.name,
      plantedAt: Date.now(),
      wateredAt: Date.now(),  // freshly planted = watered
      growthStage: 0,
      health: 100,
    });
    
    return { success: true };
  },
});

export const water = mutation({
  args: { profileId: v.id("profiles"), plotId: v.id("cropPlots") },
  handler: async (ctx, { plotId }) => {
    const plot = await ctx.db.get(plotId);
    if (!plot || !["planted", "growing"].includes(plot.state!)) {
      return { success: false, reason: "Nothing to water" };
    }
    await ctx.db.patch(plotId, { wateredAt: Date.now() });
    return { success: true };
  },
});

export const harvest = mutation({
  args: { profileId: v.id("profiles"), plotId: v.id("cropPlots") },
  handler: async (ctx, { profileId, plotId }) => {
    const plot = await ctx.db.get(plotId);
    if (!plot || plot.state !== "ready") {
      return { success: false, reason: "Not ready to harvest" };
    }
    
    const cropDef = await ctx.db
      .query("cropDefs")
      .withIndex("by_name", q => q.eq("name", plot.cropDefName!))
      .first();
    
    // Calculate yield based on health
    const health = plot.health ?? 100;
    let yield_ = cropDef!.minYield;
    if (health > 50) {
      yield_ += Math.floor((health - 50) / 10) * cropDef!.bonusYieldPerHealth;
    }
    yield_ = Math.min(yield_, cropDef!.maxYield);
    
    // Add to inventory
    const profile = await ctx.db.get(profileId);
    const items = [...profile!.items];
    const existing = items.find(i => i.name === cropDef!.harvestItemDefName);
    if (existing) {
      existing.quantity += yield_;
    } else {
      items.push({ name: cropDef!.harvestItemDefName, quantity: yield_ });
    }
    await ctx.db.patch(profileId, { items });
    
    // Reset plot
    await ctx.db.patch(plotId, {
      state: "tilled",
      cropDefName: undefined,
      plantedAt: undefined,
      wateredAt: undefined,
      growthStage: undefined,
      health: undefined,
    });
    
    return { success: true, yield: yield_, itemDefName: cropDef!.harvestItemDefName };
  },
});
```

### Crop Growth Tick

```typescript
// convex/mechanics/farming.ts
export const tick = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const plots = await ctx.db.query("cropPlots")
      .filter(q => q.or(
        q.eq(q.field("state"), "planted"),
        q.eq(q.field("state"), "growing"),
      ))
      .collect();
    
    for (const plot of plots) {
      const cropDef = await ctx.db
        .query("cropDefs")
        .withIndex("by_name", q => q.eq("name", plot.cropDefName!))
        .first();
      if (!cropDef) continue;
      
      // Check water status
      const timeSinceWater = now - (plot.wateredAt ?? plot.plantedAt!);
      let health = plot.health ?? 100;
      
      if (timeSinceWater > cropDef.waterIntervalMs + cropDef.waterToleranceMs) {
        // Damage from lack of water
        const damageIntervals = Math.floor(
          (timeSinceWater - cropDef.waterIntervalMs) / cropDef.waterToleranceMs
        );
        health = Math.max(0, health - damageIntervals * 10);
      }
      
      // Calculate growth
      const growthProgress = (now - plot.plantedAt!) / cropDef.growthTimeMs;
      const newStage = Math.min(
        cropDef.growthStages - 1,
        Math.floor(growthProgress * cropDef.growthStages)
      );
      
      // Determine state
      let state = plot.state;
      if (health <= 0) {
        state = "dead";
      } else if (growthProgress >= 1) {
        state = "ready";
      } else if (newStage > 0) {
        state = "growing";
      }
      
      await ctx.db.patch(plot._id, {
        state,
        growthStage: newStage,
        health,
      });
    }
    
    // Reschedule every 60 seconds
    await ctx.scheduler.runAfter(60_000, internal["mechanics/farming"].tick, {});
  },
});
```

---

## Energy/Hunger System

### Schema Changes

```typescript
// Extend profiles for player energy
profiles: defineTable({
  // ... existing fields ...
  energy: v.optional(v.number()),          // 0-100, default 100
  maxEnergy: v.optional(v.number()),       // default 100
  lastEnergyTickAt: v.optional(v.number()),
}),

// Extend npcState for NPC energy
npcState: defineTable({
  // ... existing fields ...
  energy: v.optional(v.number()),          // 0-100
  maxEnergy: v.optional(v.number()),
  lastEnergyTickAt: v.optional(v.number()),
  lastAteAt: v.optional(v.number()),
  lastSleptAt: v.optional(v.number()),
}),

// Add energy value to item definitions
itemDefs: defineTable({
  // ... existing fields ...
  energyRestore: v.optional(v.number()),   // energy gained when consumed
}),
```

### Energy Mechanics

```typescript
// Configuration
const ENERGY_CONFIG = {
  // Depletion rates (per game hour)
  PASSIVE_DRAIN: 2,           // standing still
  WALKING_DRAIN: 4,           // moving
  RUNNING_DRAIN: 8,           // sprinting
  COMBAT_DRAIN: 10,           // fighting
  
  // Thresholds
  HUNGRY_THRESHOLD: 50,       // "You're getting hungry"
  WEAK_THRESHOLD: 25,         // movement speed reduced
  CRITICAL_THRESHOLD: 10,     // HP damage starts
  
  // Effects when low
  WEAK_SPEED_MULTIPLIER: 0.7,
  CRITICAL_HP_DRAIN_PER_HOUR: 5,
  
  // Recovery
  REST_ENERGY_PER_HOUR: 20,   // sleeping restores energy
};
```

### Eat Action

```typescript
// convex/mechanics/energy.ts
export const eat = mutation({
  args: {
    profileId: v.id("profiles"),
    itemDefName: v.string(),
  },
  handler: async (ctx, { profileId, itemDefName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };
    
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return { success: false, reason: "Not your profile" };
    }
    
    // Check inventory
    const item = profile.items.find(i => i.name === itemDefName);
    if (!item || item.quantity < 1) {
      return { success: false, reason: "Item not in inventory" };
    }
    
    // Get item definition
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", q => q.eq("name", itemDefName))
      .first();
    
    if (!itemDef?.energyRestore) {
      return { success: false, reason: "Not edible" };
    }
    
    // Consume item
    const items = profile.items.map(i =>
      i.name === itemDefName ? { ...i, quantity: i.quantity - 1 } : i
    ).filter(i => i.quantity > 0);
    
    // Restore energy
    const currentEnergy = profile.energy ?? 100;
    const maxEnergy = profile.maxEnergy ?? 100;
    const newEnergy = Math.min(maxEnergy, currentEnergy + itemDef.energyRestore);
    
    await ctx.db.patch(profileId, { items, energy: newEnergy });
    
    return { 
      success: true, 
      energyRestored: newEnergy - currentEnergy,
      newEnergy,
    };
  },
});
```

### Energy Tick (Depletion)

```typescript
// convex/mechanics/energy.ts
export const tick = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const worldTime = await getWorldTime(ctx);
    
    // Process player energy
    const profiles = await ctx.db.query("profiles").collect();
    for (const profile of profiles) {
      const lastTick = profile.lastEnergyTickAt ?? now;
      const elapsedMs = now - lastTick;
      const elapsedHours = (elapsedMs / 1000) / worldTime.timeScale;
      
      // Get activity level from presence (walking/idle)
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_profile", q => q.eq("profileId", profile._id))
        .first();
      
      const isMoving = presence && (Math.abs(presence.vx ?? 0) > 0 || Math.abs(presence.vy ?? 0) > 0);
      const drainRate = isMoving ? ENERGY_CONFIG.WALKING_DRAIN : ENERGY_CONFIG.PASSIVE_DRAIN;
      
      const currentEnergy = profile.energy ?? 100;
      const newEnergy = Math.max(0, currentEnergy - drainRate * elapsedHours);
      
      // Apply effects if critical
      let hp = profile.stats?.hp ?? 100;
      if (currentEnergy <= ENERGY_CONFIG.CRITICAL_THRESHOLD) {
        hp = Math.max(1, hp - ENERGY_CONFIG.CRITICAL_HP_DRAIN_PER_HOUR * elapsedHours);
      }
      
      await ctx.db.patch(profile._id, {
        energy: newEnergy,
        stats: { ...profile.stats, hp },
        lastEnergyTickAt: now,
      });
    }
    
    // Process NPC energy (in separate tick with NPC engine)
    // NPCs will be processed in npcEngine.tick
    
    await ctx.scheduler.runAfter(30_000, internal["mechanics/energy"].tick, {});
  },
});
```

---

## NPC Pathfinding (Dijkstra)

### Overview

NPCs need to pathfind to:
1. Food sources when hungry
2. Rest areas when tired
3. Wander targets (existing behavior)
4. Flee from threats

### Collision Grid

Convert the map's collision data into a grid for pathfinding:

```typescript
// convex/lib/pathfinding.ts

interface PathNode {
  x: number;
  y: number;
  g: number;  // cost from start
  h: number;  // heuristic to goal
  f: number;  // g + h
  parent: PathNode | null;
}

/**
 * Parse collision mask into a walkability grid.
 * collisionMask is JSON string of boolean[][] where true = collision
 */
function parseCollisionGrid(collisionMask: string, width: number, height: number): boolean[][] {
  try {
    const mask = JSON.parse(collisionMask) as boolean[][];
    return mask;
  } catch {
    // Default: all walkable
    return Array(height).fill(null).map(() => Array(width).fill(false));
  }
}

/**
 * Find path from start to goal using Dijkstra's algorithm.
 * Returns array of {x, y} positions in world coordinates.
 */
export function findPath(
  collisionGrid: boolean[][],
  tileWidth: number,
  tileHeight: number,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): Array<{ x: number; y: number }> | null {
  const gridWidth = collisionGrid[0]?.length ?? 0;
  const gridHeight = collisionGrid.length;
  
  // Convert world coords to grid coords
  const startCol = Math.floor(startX / tileWidth);
  const startRow = Math.floor(startY / tileHeight);
  const goalCol = Math.floor(goalX / tileWidth);
  const goalRow = Math.floor(goalY / tileHeight);
  
  // Bounds check
  if (startCol < 0 || startCol >= gridWidth || startRow < 0 || startRow >= gridHeight) return null;
  if (goalCol < 0 || goalCol >= gridWidth || goalRow < 0 || goalRow >= gridHeight) return null;
  if (collisionGrid[goalRow][goalCol]) return null;  // Goal is blocked
  
  // Priority queue (simple array for now, could optimize with heap)
  const open: PathNode[] = [];
  const closed = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  
  const heuristic = (r: number, c: number) => 
    Math.abs(r - goalRow) + Math.abs(c - goalCol);  // Manhattan distance
  
  open.push({
    x: startCol,
    y: startRow,
    g: 0,
    h: heuristic(startRow, startCol),
    f: heuristic(startRow, startCol),
    parent: null,
  });
  
  const directions = [
    { dr: -1, dc: 0 },  // up
    { dr: 1, dc: 0 },   // down
    { dr: 0, dc: -1 },  // left
    { dr: 0, dc: 1 },   // right
    // Diagonals (optional, with higher cost)
    { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
    { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
  ];
  
  while (open.length > 0) {
    // Find lowest f score
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    
    if (current.x === goalCol && current.y === goalRow) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({
          x: node.x * tileWidth + tileWidth / 2,
          y: node.y * tileHeight + tileHeight / 2,
        });
        node = node.parent;
      }
      return path;
    }
    
    closed.add(key(current.y, current.x));
    
    for (const { dr, dc } of directions) {
      const nr = current.y + dr;
      const nc = current.x + dc;
      
      if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth) continue;
      if (collisionGrid[nr][nc]) continue;
      if (closed.has(key(nr, nc))) continue;
      
      const cost = (dr !== 0 && dc !== 0) ? 1.414 : 1;  // Diagonal cost
      const g = current.g + cost;
      const h = heuristic(nr, nc);
      
      const existing = open.find(n => n.x === nc && n.y === nr);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        }
      } else {
        open.push({ x: nc, y: nr, g, h, f: g + h, parent: current });
      }
    }
  }
  
  return null;  // No path found
}
```

### Integrating with NPC Engine

```typescript
// convex/npcEngine.ts - extend tick handler

// Add path field to npcState schema:
// currentPath: v.optional(v.array(v.object({ x: v.float64(), y: v.float64() }))),
// currentPathIndex: v.optional(v.number()),

// In tick loop, for NPCs with goals:
if (npc.goalType && !npc.currentPath) {
  const map = await ctx.db
    .query("maps")
    .withIndex("by_name", q => q.eq("name", npc.mapName))
    .first();
  
  if (map?.collisionMask) {
    const grid = parseCollisionGrid(map.collisionMask, map.width, map.height);
    const goalPos = await resolveGoalPosition(ctx, npc);
    
    if (goalPos) {
      const path = findPath(
        grid, map.tileWidth, map.tileHeight,
        npc.x, npc.y, goalPos.x, goalPos.y
      );
      
      if (path && path.length > 1) {
        await ctx.db.patch(npc._id, {
          currentPath: path,
          currentPathIndex: 1,  // Skip first point (current position)
        });
      }
    }
  }
}

// Follow path
if (npc.currentPath && npc.currentPathIndex != null) {
  const target = npc.currentPath[npc.currentPathIndex];
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 4) {
    // Reached waypoint
    if (npc.currentPathIndex >= npc.currentPath.length - 1) {
      // Reached goal
      await ctx.db.patch(npc._id, {
        currentPath: undefined,
        currentPathIndex: undefined,
        // Handle goal completion
      });
    } else {
      await ctx.db.patch(npc._id, {
        currentPathIndex: npc.currentPathIndex + 1,
      });
    }
  } else {
    // Move toward waypoint
    // ... existing movement code ...
  }
}
```

---

## NPC Spatial Memory

### Concept

NPCs remember locations they've visited but don't have global map knowledge. This creates emergent behavior where NPCs:
- Return to known food sources
- Explore new areas occasionally
- Share knowledge through dialogue (future)

### Schema

```typescript
// convex/schema.ts
npcMemories: defineTable({
  npcProfileName: v.string(),
  memoryType: v.union(
    v.literal("location_visited"),
    v.literal("food_source"),
    v.literal("rest_area"),
    v.literal("danger_zone"),
    v.literal("interesting_object"),
  ),
  mapName: v.string(),
  x: v.float64(),
  y: v.float64(),
  details: v.optional(v.object({
    itemDefName: v.optional(v.string()),
    objectId: v.optional(v.id("mapObjects")),
    lastCheckedAt: v.optional(v.number()),
    reliability: v.optional(v.number()),  // 0-1, decreases over time
  })),
  createdAt: v.number(),
  lastVisitedAt: v.number(),
})
  .index("by_npc", ["npcProfileName"])
  .index("by_npc_type", ["npcProfileName", "memoryType"])
  .index("by_npc_map", ["npcProfileName", "mapName"]),
```

### Memory Formation

```typescript
// convex/npc/memory.ts

/**
 * Record that an NPC visited a location.
 * Called periodically during NPC movement.
 */
export const recordVisit = internalMutation({
  args: {
    npcProfileName: v.string(),
    mapName: v.string(),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, { npcProfileName, mapName, x, y }) => {
    const now = Date.now();
    
    // Check if we already have a nearby memory
    const existing = await ctx.db
      .query("npcMemories")
      .withIndex("by_npc_map", q => q.eq("npcProfileName", npcProfileName).eq("mapName", mapName))
      .filter(q => q.eq(q.field("memoryType"), "location_visited"))
      .collect();
    
    const nearby = existing.find(m => {
      const dx = m.x - x;
      const dy = m.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 48;  // Within 48px
    });
    
    if (nearby) {
      await ctx.db.patch(nearby._id, { lastVisitedAt: now });
    } else {
      await ctx.db.insert("npcMemories", {
        npcProfileName,
        memoryType: "location_visited",
        mapName,
        x, y,
        createdAt: now,
        lastVisitedAt: now,
      });
    }
  },
});

/**
 * Record discovery of a food source.
 */
export const recordFoodSource = internalMutation({
  args: {
    npcProfileName: v.string(),
    mapName: v.string(),
    x: v.float64(),
    y: v.float64(),
    itemDefName: v.optional(v.string()),
    objectId: v.optional(v.id("mapObjects")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Check for existing memory of this food source
    const existing = await ctx.db
      .query("npcMemories")
      .withIndex("by_npc_map", q => 
        q.eq("npcProfileName", args.npcProfileName).eq("mapName", args.mapName)
      )
      .filter(q => q.eq(q.field("memoryType"), "food_source"))
      .collect();
    
    const nearby = existing.find(m => {
      const dx = m.x - args.x;
      const dy = m.y - args.y;
      return Math.sqrt(dx * dx + dy * dy) < 24;
    });
    
    if (nearby) {
      await ctx.db.patch(nearby._id, {
        lastVisitedAt: now,
        details: {
          ...nearby.details,
          itemDefName: args.itemDefName,
          objectId: args.objectId,
          lastCheckedAt: now,
          reliability: 1.0,
        },
      });
    } else {
      await ctx.db.insert("npcMemories", {
        npcProfileName: args.npcProfileName,
        memoryType: "food_source",
        mapName: args.mapName,
        x: args.x,
        y: args.y,
        details: {
          itemDefName: args.itemDefName,
          objectId: args.objectId,
          lastCheckedAt: now,
          reliability: 1.0,
        },
        createdAt: now,
        lastVisitedAt: now,
      });
    }
  },
});
```

### Using Memory for Decisions

```typescript
// convex/npc/decisions.ts

/**
 * Find the best known food source for an NPC.
 */
export async function findBestFoodSource(
  ctx: QueryCtx,
  npcProfileName: string,
  currentMapName: string,
  currentX: number,
  currentY: number,
): Promise<{ x: number; y: number; itemDefName?: string } | null> {
  const memories = await ctx.db
    .query("npcMemories")
    .withIndex("by_npc_type", q => 
      q.eq("npcProfileName", npcProfileName).eq("memoryType", "food_source")
    )
    .filter(q => q.eq(q.field("mapName"), currentMapName))
    .collect();
  
  if (memories.length === 0) return null;
  
  // Score each memory by distance and reliability
  const scored = memories.map(m => {
    const dx = m.x - currentX;
    const dy = m.y - currentY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const reliability = m.details?.reliability ?? 0.5;
    const recency = 1 / (1 + (Date.now() - m.lastVisitedAt) / (1000 * 60 * 60));  // decay over hours
    
    return {
      memory: m,
      score: reliability * recency / (1 + distance / 100),
    };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  if (best && best.score > 0.1) {
    return {
      x: best.memory.x,
      y: best.memory.y,
      itemDefName: best.memory.details?.itemDefName,
    };
  }
  
  return null;
}
```

---

## NPC Rest System

### Rest Areas

NPCs need designated rest areas (beds, camp sites, homes) or will rest wherever they stop at night.

```typescript
// Extend spriteDefinitions
spriteDefinitions: defineTable({
  // ... existing fields ...
  isRestArea: v.optional(v.boolean()),
  restCapacity: v.optional(v.number()),     // how many can rest here
  restQuality: v.optional(v.number()),      // multiplier for rest effectiveness
}),

// Track who's resting where
mapObjects: defineTable({
  // ... existing fields ...
  currentOccupants: v.optional(v.array(v.string())),  // npcProfileNames
}),
```

### Rest Behavior

```typescript
// In npcEngine.tick or a dedicated rest tick

async function handleNpcRest(ctx: MutationCtx, npc: NpcState, worldTime: WorldTime): Promise<void> {
  const now = Date.now();
  const hour = worldTime.currentTime;
  const isNight = hour >= 21 || hour < 6;
  const isTired = (npc.energy ?? 100) < 30;
  
  // Should this NPC try to rest?
  if (!isNight && !isTired) return;
  
  // Already resting?
  if (npc.isResting) {
    // Apply rest benefits
    const restDuration = now - (npc.restStartedAt ?? now);
    const hoursRested = (restDuration / 1000) / worldTime.timeScale;
    const restQuality = npc.currentRestQuality ?? 1.0;
    
    const energyGain = ENERGY_CONFIG.REST_ENERGY_PER_HOUR * hoursRested * restQuality;
    const newEnergy = Math.min(100, (npc.energy ?? 0) + energyGain);
    
    // Wake up if rested or morning
    if (newEnergy >= 90 || (hour >= 6 && hour < 7)) {
      await ctx.db.patch(npc._id, {
        isResting: false,
        restStartedAt: undefined,
        currentRestQuality: undefined,
        energy: newEnergy,
        lastSleptAt: now,
      });
      // Release rest area
      if (npc.currentRestAreaId) {
        await releaseRestArea(ctx, npc.currentRestAreaId, npc.instanceName);
      }
    } else {
      await ctx.db.patch(npc._id, { energy: newEnergy });
    }
    return;
  }
  
  // Find a rest area
  const profile = await ctx.db
    .query("npcProfiles")
    .withIndex("by_name", q => q.eq("name", npc.instanceName))
    .first();
  
  // Check memory for known rest areas
  const knownRestAreas = await ctx.db
    .query("npcMemories")
    .withIndex("by_npc_type", q =>
      q.eq("npcProfileName", npc.instanceName!).eq("memoryType", "rest_area")
    )
    .filter(q => q.eq(q.field("mapName"), npc.mapName))
    .collect();
  
  if (knownRestAreas.length > 0) {
    // Pathfind to nearest rest area
    const nearest = findNearest(npc.x, npc.y, knownRestAreas);
    await ctx.db.patch(npc._id, {
      goalType: "rest",
      goalX: nearest.x,
      goalY: nearest.y,
    });
  } else {
    // Rest in place (less effective)
    await ctx.db.patch(npc._id, {
      isResting: true,
      restStartedAt: now,
      currentRestQuality: 0.5,  // outdoor rest is less effective
      vx: 0,
      vy: 0,
    });
  }
}
```

---

## NPC AI Decision Making

### Goal Priority System

NPCs evaluate their needs and choose goals based on urgency:

```typescript
// convex/npc/decisions.ts

interface NpcGoal {
  type: "wander" | "seek_food" | "seek_rest" | "flee" | "interact" | "work";
  priority: number;  // higher = more urgent
  targetX?: number;
  targetY?: number;
  targetId?: string;
}

export async function evaluateGoals(
  ctx: QueryCtx,
  npc: NpcState,
  profile: NpcProfile | null,
  worldTime: WorldTime,
): Promise<NpcGoal> {
  const goals: NpcGoal[] = [];
  const hour = worldTime.currentTime;
  const isNight = hour >= 21 || hour < 6;
  const energy = npc.energy ?? 100;
  
  // 1. Critical needs
  if (energy <= 10) {
    // Desperately hungry - drop everything
    const food = await findBestFoodSource(ctx, npc.instanceName!, npc.mapName, npc.x, npc.y);
    if (food) {
      goals.push({ type: "seek_food", priority: 100, targetX: food.x, targetY: food.y });
    }
  }
  
  // 2. High priority needs
  if (energy < 30) {
    const food = await findBestFoodSource(ctx, npc.instanceName!, npc.mapName, npc.x, npc.y);
    if (food) {
      goals.push({ type: "seek_food", priority: 80, targetX: food.x, targetY: food.y });
    }
  }
  
  if (isNight && energy < 50) {
    const restArea = await findBestRestArea(ctx, npc.instanceName!, npc.mapName, npc.x, npc.y);
    if (restArea) {
      goals.push({ type: "seek_rest", priority: 70, targetX: restArea.x, targetY: restArea.y });
    }
  }
  
  // 3. Aggro response (existing system)
  if (npc.aggroTargetProfileId && npc.aggroUntil && npc.aggroUntil > Date.now()) {
    // Continue aggro behavior
    goals.push({ type: "flee", priority: 60 });  // or attack, depending on NPC
  }
  
  // 4. Scheduled activities (future: jobs, patrols)
  // if (profile?.schedule) { ... }
  
  // 5. Default wander
  goals.push({ type: "wander", priority: 10 });
  
  // Return highest priority goal
  goals.sort((a, b) => b.priority - a.priority);
  return goals[0];
}
```

### Integrating AI for Complex Decisions

For complex social decisions, we can query the AI:

```typescript
// convex/npc/ai-decisions.ts
"use node";

import { generateObject } from "ai";
import { z } from "zod";

const DecisionSchema = z.object({
  action: z.enum(["continue", "change_goal", "interact", "speak"]),
  newGoalType: z.enum(["wander", "seek_food", "seek_rest", "explore"]).optional(),
  interactWithNpc: z.string().optional(),
  dialogueLine: z.string().optional(),
  reasoning: z.string(),
});

export const makeComplexDecision = action({
  args: {
    npcProfileName: v.string(),
    currentSituation: v.string(),
    nearbyEntities: v.array(v.object({
      type: v.string(),
      name: v.string(),
      distance: v.number(),
    })),
    currentNeeds: v.object({
      energy: v.number(),
      isNight: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.npcProfiles.queries.getByNameInternal, {
      name: args.npcProfileName,
    });
    
    const prompt = `
You are ${profile?.displayName ?? args.npcProfileName}, an NPC in a fantasy world.

Personality: ${profile?.personality ?? "friendly villager"}

Current situation: ${args.currentSituation}

Nearby: ${args.nearbyEntities.map(e => `${e.type} "${e.name}" (${e.distance}px away)`).join(", ") || "nothing notable"}

Your needs:
- Energy: ${args.currentNeeds.energy}/100
- Time: ${args.currentNeeds.isNight ? "night" : "day"}

What do you do?
`;
    
    const result = await generateObject({
      model: openai.chat("gpt-5-nano"),
      schema: DecisionSchema,
      prompt,
    });
    
    return result.object;
  },
});
```

---

## Implementation Phases

### Phase 1: Foundation (Time + Energy)

**Goal**: Core time system and basic energy mechanics

1. Add `worldTime` table and tick loop
2. Implement day/night cycle frontend rendering
3. Add energy fields to profiles and npcState
4. Implement energy depletion tick
5. Implement `eat` mutation
6. Add `energyRestore` to itemDefs

**Deliverables**:
- Configurable day/night cycle
- Players can eat food to restore energy
- Low energy causes movement penalty and HP drain

### Phase 2: Food Sources

**Goal**: Natural food spawning and foraging

1. Add `itemSpawnPoints` table and spawner tick
2. Add foragable properties to spriteDefinitions
3. Implement `forage` mutation
4. Create initial food item definitions (berries, mushrooms, etc.)
5. Add foraging UI interaction

**Deliverables**:
- Wild food spawns naturally
- Players can forage from bushes/trees
- Forage objects have limited charges that recharge

### Phase 3: Farming

**Goal**: Basic crop growing

1. Add `cropPlots` and `cropDefs` tables
2. Implement till/plant/water/harvest mutations
3. Add farming tick for growth/decay
4. Create initial crop definitions
5. Add farming UI

**Deliverables**:
- Players can till soil, plant seeds, water, harvest
- Crops grow over time, need water
- Different crops with different yields

### Phase 4: NPC Pathfinding

**Goal**: NPCs can navigate around obstacles

1. Implement Dijkstra pathfinding in convex/lib
2. Add path fields to npcState
3. Integrate pathfinding into npcEngine tick
4. Test with existing wander behavior

**Deliverables**:
- NPCs navigate around walls/obstacles
- NPCs can reach distant targets
- Path recalculation when blocked

### Phase 5: NPC Memory

**Goal**: NPCs remember locations

1. Add `npcMemories` table (separate from existing conversations)
2. Implement memory formation (visit recording, food source discovery)
3. Implement memory queries for decision making
4. Integrate with pathfinding (go to remembered food)

**Deliverables**:
- NPCs remember where they've been
- NPCs return to known food sources
- Memory degrades over time

### Phase 6: NPC Needs & Rest

**Goal**: NPCs have energy/hunger and rest

1. Add energy fields to npcState
2. Extend npcEngine tick for energy depletion
3. Implement NPC food seeking behavior
4. Implement NPC rest behavior
5. Add rest area properties to objects

**Deliverables**:
- NPCs get hungry over time
- NPCs seek food when hungry
- NPCs rest at night or when tired

### Phase 7: AI Decision Making

**Goal**: NPCs make intelligent choices

1. Implement goal priority system
2. Integrate simple rule-based decisions in tick
3. Add AI-powered complex decisions (optional calls)
4. Balance and tune NPC behaviors

**Deliverables**:
- NPCs prioritize needs (hunger > rest > wander)
- NPCs respond to environment changes
- Emergent behavior from simple rules

---

## Open Questions

1. **Cross-map NPCs**: Should NPCs eventually travel between maps? (Deferred for now)
2. **NPC death**: What happens when NPC energy hits 0? Respawn? Permanent death?
3. **Economy integration**: Should NPCs trade? Buy food from shops?
4. **Seasons**: Add seasonal variation to crops/spawns? (Future phase)
5. **Weather effects**: Should rain water crops automatically? Affect energy drain?

---

## Next Steps

1. Review this design with Andrew
2. Prioritize phases based on what's most exciting to see first
3. Begin Phase 1 implementation
4. Create migration scripts for schema changes
5. Write tests for tick loops

---

*This document will be updated as implementation progresses.*
