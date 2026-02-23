# PRD: Openworld Global Dimensions, Spatial Index, and Portal Registry

**Date:** 2026-02-22
**Status:** Final
**Author:** Buddy

---

## 1) Summary

Tiny Realms will support two coordinate systems:

1. **Global dimension** (`global`): an effectively unbounded overworld using chunked coordinates (`+/- x,y`).
2. **Instance dimensions** (existing maps): local coordinate planes for interiors and unique spaces.

Entities can transition between dimensions via portals. A central portal registry and entity location model will unify global->instance, instance->global, and instance->instance travel.

Global rendering will stream multiple chunks simultaneously and use a chunk cache. The existing instance layer renderer will be reused in a tiled fashion (chunk containers and render pages), not by instantiating full map-editing runtime objects per chunk.

This design preserves the current map stack while adding global systems in parallel.

---

## 2) Current State (Code Evidence)

The current runtime and schema are map-scoped:

- Finite map docs include `width`, `height`, `layers`, `collisionMask`, and embedded `portals` in `convex/schema.ts:17`.
- Map portal objects currently have no stable ID (only `name`, zone, target map/spawn) in `convex/schema.ts:58` and `src/types/map.ts:17`.
- Portal transitions are driven directly from current map data and call `changeMap(targetMap, targetSpawn, direction)` in `src/engine/Game/checkPortals.ts:25`.
- `changeMap` persists current map-local position to profile, then unloads and resubscribes map-scoped streams in `src/engine/Game/changeMap.ts:36` and `src/engine/Game/changeMap.ts:75`.
- Presence is map-scoped and queried by `mapName` in `convex/presence.ts:67`.
- `mapObjects` are map-scoped by required `mapName` in `convex/schema.ts:317`.
- `npcState` is map-scoped by required `mapName` in `convex/schema.ts:462`.
- `worldItems` are map-scoped by required `mapName` in `convex/schema.ts:836`.
- Startup map load is map-name driven from profile state in `src/engine/Game/loadDefaultMap.ts:14`.

Conclusion: we can add global openworld systems without breaking current instance maps by introducing additive tables and transition contracts.

---

## 3) Problem Statement

The project needs an openworld that is virtually infinite in all directions while retaining authored instance maps with independent coordinate planes. Current map-local storage and subscriptions make large-scale radius/chunk queries hard and do not model cross-dimension location cleanly.

---

## 4) Product Goals

1. Add a **global chunk model** for static overworld data (tiles, collision, static objects) using **64x64 tile chunks**.
2. Add a **global spatial index** for all dynamic/interactive entities currently in global dimension.
3. Add a **shared portal registry** that can represent all transition types.
4. Add a canonical **entity location model** (global vs instance, portal metadata).
5. Keep current instance map behavior intact during rollout.

---

## 5) Non-Goals (This PRD Phase)

- Procedural generation algorithms.
- Infinite client renderer/streaming implementation.
- Full AI behavior overhaul.
- Replacing all map-scoped systems on day one.

---

## 6) User Stories

1. As a player, I can walk the outside world continuously across chunk boundaries.
2. As a player, I can enter a building/interior whose size does not match exterior footprint.
3. As a player, I can travel instance->instance through configured gates.
4. As a developer, I can query nearby global entities by radius efficiently.
5. As a developer, I can determine where any entity is (global or instance) with portal transition metadata.

---

## 7) Data Model

### 7.1 `globalChunks` (static global map data)

One row per `(worldKey, chunkX, chunkY)`.

Required fields:

- `worldKey: string` (default `"global"`)
- `chunkX: number`
- `chunkY: number`
- `chunkWidthTiles: number` (default 64)
- `chunkHeightTiles: number` (default 64)
- `tileWidth: number`
- `tileHeight: number`
- `bgTiles: string` (JSON or encoded tile payload)
- `objTiles: string`
- `overlayTiles: string`
- `collisionMask: string`
- `staticObjects: Array<{ objectKey, spriteDefName, x, y, layer, isCollidable, animation?, portalId? }>`
- `revision: number`
- `generatedAt: number`
- `updatedAt: number`

Render guidance:

- Runtime may internally split a stored 64x64 chunk into `32x32` render pages for culling/cache efficiency.

Indexes:

- `by_world_chunk: [worldKey, chunkX, chunkY]`
- `by_world_updated: [worldKey, updatedAt]`

### 7.2 `globalSpatial` (live global spatial index)

Only entities currently in global dimension appear here.

Required fields:

- `worldKey: string` (`"global"`)
- `entityType: string` (initial values: `profile`, `npcState`, `animal`, `worldItem`, `interactiveObject`)
- `entityId: string` (or typed ID serialized)
- `x: number`
- `y: number`
- `dx: number`
- `dy: number`
- `chunkX: number`
- `chunkY: number`
- `animation: string`
- `updatedAt: number`

Indexes:

- `by_entity: [entityType, entityId]`
- `by_chunk: [worldKey, chunkX, chunkY]`
- `by_chunk_type: [worldKey, chunkX, chunkY, entityType]`
- `by_world_updated: [worldKey, updatedAt]`

### 7.3 `entityLocations` (canonical dimension location)

One row per entity.

Required fields:

- `entityType`
- `entityId`
- `dimensionType: "global" | "instance"`
- `worldKey: string` (for global)
- `mapName?: string` (for instance)
- `lastPortalId?: string`
- `lastPortalUsedAt?: number`
- `lastGlobalX?: number`
- `lastGlobalY?: number`
- `updatedAt: number`

Indexes:

- `by_entity: [entityType, entityId]`
- `by_dimension: [dimensionType, mapName]`

### 7.4 `portalDefs` (shared portal registry)

Canonical portal identity for all transitions.

Required fields:

- `portalId: string` (stable unique id)
- `name: string`
- `fromDimensionType: "global" | "instance"`
- `fromMapName?: string`
- `fromGlobalX?: number`
- `fromGlobalY?: number`
- `toDimensionType: "global" | "instance"`
- `toMapName?: string`
- `toSpawnLabel?: string`
- `toGlobalX?: number`
- `toGlobalY?: number`
- `direction?: string`
- `transition?: string`
- `enabled: boolean`
- `updatedAt: number`

Indexes:

- `by_portal_id: [portalId]`
- `by_from: [fromDimensionType, fromMapName]`
- `by_to: [toDimensionType, toMapName]`

### 7.5 `portalTransitions` (audit/history)

Append-only transition log:

- `entityType`, `entityId`, `portalId`
- `fromDimensionType`, `fromMapName?`
- `toDimensionType`, `toMapName?`
- `usedAt`

Indexes:

- `by_entity_time: [entityType, entityId, usedAt]`
- `by_portal_time: [portalId, usedAt]`

---

## 8) Key Product Decisions

1. **Do not keep null-coordinate rows in `globalSpatial` for instance entities.**
   - `globalSpatial` remains query-clean and performance-focused.
   - Instance state lives in `entityLocations` + existing map tables.

2. **Portal identity is centralized via `portalId`.**
   - Existing map portal payloads gain optional `portalId` for backward compatibility.

3. **Instance maps remain independent coordinate planes.**
   - Allows interior dimensions larger than exterior footprint.

4. **Global static content is chunked, but current map stack remains intact.**
   - Enables phased migration with minimal blast radius.

5. **Chunk renderer uses tiled chunk containers + cache.**
   - Reuse layer rendering logic with chunk-compatible payloads.
   - Do not instantiate heavyweight full-map editor/runtime state per loaded chunk.

6. **Global spatial stores dynamic/interactive entities.**
   - Static/non-interactive chunk objects remain in `globalChunks` payload.

---

## 9) Functional Requirements

### FR-1 Global coordinate + chunk math

- Support signed global coordinates.
- Compute chunk with floor semantics for negatives:
  - `chunkX = floor(x / (chunkWidthTiles * tileWidth))`
  - `chunkY = floor(y / (chunkHeightTiles * tileHeight))`

### FR-2 Radius and chunk queries

- Fetch entities by chunk and by radius.
- Radius query must chunk-prefilter first, then distance-filter.

### FR-2b Chunk streaming and cache

- Runtime must support multiple chunks visible onscreen concurrently.
- Implement chunk cache with visible + prefetch windows and LRU-style eviction.
- Chunk requests should be deduplicated in flight per chunk key.

### FR-3 Transition support

- Global->Instance, Instance->Global, Instance->Instance all supported through `portalDefs`.
- All transitions record `lastPortalId` and transition timestamp.

### FR-4 Backward compatibility

- Existing map portal behavior continues if `portalId` missing.
- Existing map data does not require immediate conversion.

### FR-5 Authoritative ownership

- Canonical entity rows remain in source tables (`profiles`, `npcState`, etc.).
- `globalSpatial` is indexed projection for global entities.

### FR-6 Chunk-relative static data

- Static chunk payloads (`tiles`, `collision`, static objects) are stored and interpreted relative to chunk origin.
- Global world coordinates are derived from chunk origin + local offsets.

---

## 10) Non-Functional Requirements

- Query performance: chunk/radius operations should not require full-table scans.
- Data consistency: transition updates should be atomic from gameplay perspective.
- Safety: rollout must not break existing map transitions.
- Operability: include admin backfill/reconcile scripts.
- Rendering scalability: chunk load/unload should avoid frame spikes during movement.

---

## 11) Rollout and Migration

### Phase A (additive schema)

- Add new tables (`globalChunks`, `globalSpatial`, `entityLocations`, `portalDefs`, `portalTransitions`).
- Add optional `portalId` to map portal schema and frontend type.

### Phase B (write-through + bootstrap)

- Introduce APIs to upsert/remove global spatial rows.
- Seed `entityLocations` for existing profiles/NPCs.

### Phase C (portal registry adoption)

- Backfill `portalId` for existing map portal entries.
- Change runtime transition code path to prefer `portalId` -> `portalDefs`, with fallback to legacy target fields.

### Phase D (global queries)

- Introduce chunk/radius query endpoints and swap selected systems incrementally.

---

## 12) Risks and Mitigations

1. **Dual-write drift (`globalSpatial` vs canonical tables).**
   - Mitigation: single helper for all spatial writes + reconciliation job.

2. **Portal definition mismatch.**
   - Mitigation: schema validation + portal existence checks at save time.

3. **Chunk payload bloat.**
   - Mitigation: cap static object counts per chunk; split to `globalChunkObjects` later if needed.

4. **Negative coordinate bugs.**
   - Mitigation: central chunk math utility + deterministic tests.

5. **Chunk thrash while moving quickly.**
   - Mitigation: prefetch ring + cache reuse + in-flight request dedupe.

---

## 13) Success Metrics

- 100% of global entities represented in `globalSpatial` while in global dimension.
- Portal transitions all produce `portalTransitions` entries.
- No regression in existing instance-map travel behavior.
- Radius query p95 latency remains acceptable for live gameplay loads.
- Chunk streaming maintains stable FPS while crossing chunk boundaries.

---

## 14) Acceptance Criteria

1. New tables and indexes exist and typecheck passes.
2. A profile can transition global->instance and instance->global with portal metadata captured.
3. `globalSpatial` rows are present only while entity is in global dimension.
4. Legacy maps without `portalId` continue to work.
5. Chunk and radius queries return expected entities by type.
6. At least a 3x3 chunk window can be rendered concurrently with cache reuse behavior.

---

## 15) Open Questions

1. Should global static objects remain embedded in `globalChunks` long-term, or split to dedicated table once density increases?
2. Should we add bidirectional portal invariants at write time (A->B implies B->A), or allow one-way by design?
3. Should `entityType` use strict union now, or support future `monster`, `vehicle`, etc. via extensible enum strategy?

---

## 16) References

- `convex/schema.ts:17`
- `convex/schema.ts:58`
- `convex/schema.ts:317`
- `convex/schema.ts:430`
- `convex/schema.ts:462`
- `convex/schema.ts:836`
- `convex/presence.ts:67`
- `src/types/map.ts:17`
- `src/engine/Game/checkPortals.ts:25`
- `src/engine/Game/changeMap.ts:16`
- `src/engine/Game/loadDefaultMap.ts:14`
