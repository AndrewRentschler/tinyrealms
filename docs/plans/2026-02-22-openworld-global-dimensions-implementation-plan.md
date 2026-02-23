# Openworld Global Dimensions - Subagent-Driven Implementation Plan

> **Execution mode:** Same-session subagent-driven development.
> For each task: **Implementer subagent -> Spec compliance review -> Code quality review**.

**Primary PRD:** `docs/plans/2026-02-22-openworld-global-dimensions-prd.md`

---

## 1) Controller Protocol (Required)

For every task in this file:

1. Dispatch a **fresh implementer subagent** with only task-specific context.
2. Run **spec compliance reviewer** (must be ✅ before quality review starts).
3. Run **code quality reviewer**.
4. If either reviewer reports issues, send the same implementer subagent to fix and re-run that review.
5. Mark task complete only when both reviewers approve.

Global rules:

- Do not run two implementation subagents at once.
- Do not skip review loops.
- Keep changes additive and backward compatible.
- Run `npm run typecheck` at end of each implementation task.

---

## 2) Delivery Scope

This plan delivers the core architecture in controlled phases:

1. Global data model (`globalChunks`, `globalSpatial`, `entityLocations`, `portalDefs`, `portalTransitions`)
2. Shared portal identity (`portalId`) with legacy fallback
3. Dimension-aware transition service
4. Chunk/radius query API for global dimension
5. Chunk-streamed global rendering with cache (using existing layer rendering primitives)

Constants for this plan:

- `DEFAULT_CHUNK_WIDTH_TILES = 64`
- `DEFAULT_CHUNK_HEIGHT_TILES = 64`
- `DEFAULT_RENDER_PAGE_TILES = 32`

---

## 3) Task Graph

- Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5
- Task 6 depends on Task 2 and Task 4
- Task 7 depends on Task 5 and Task 6
- Task 8 depends on Task 1 and Task 3
- Task 9 depends on Task 6
- Task 10 final integration review

---

## 4) Task Packets

### Task 1 - Schema foundations for global dimension

**Goal**
Add new tables and indexes in `convex/schema.ts`:

- `globalChunks`
- `globalSpatial`
- `entityLocations`
- `portalDefs`
- `portalTransitions`

**Files**

- Modify: `convex/schema.ts`

**Implementation requirements**

- Use strict validators (`v.string`, `v.number`, unions) and avoid broad `v.any` except where unavoidable.
- Add indexes exactly as defined in PRD section 7.
- Keep existing tables untouched except additive changes.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Are all five tables present?
- Are required fields present and named correctly?
- Are indexes present and usable for by-entity, by-chunk, and portal lookups?
- Is this additive only?

**Quality review checklist**

- Validator quality and readability.
- Consistency with existing schema style and comments.
- No redundant or conflicting indexes.

---

### Task 2 - Portal ID compatibility layer

**Goal**
Introduce stable `portalId` support while preserving old portal behavior.

**Files**

- Modify: `convex/schema.ts` (embedded map portal validator shape)
- Modify: `convex/maps/mutations.ts` (portal validator)
- Modify: `src/types/map.ts` (`Portal` interface)

**Implementation requirements**

- Add optional `portalId` to map portal definitions.
- Do not remove `targetMap`/`targetSpawn` legacy fields.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Is `portalId` available end-to-end (schema + backend validator + frontend type)?
- Does legacy data still validate and compile?

**Quality review checklist**

- No unnecessary API churn.
- Type safety maintained in map-related code.

---

### Task 3 - Global chunk math + shared spatial utility

**Goal**
Create a shared utility for chunk math and radius chunk coverage.

**Files**

- Create: `convex/lib/globalSpatial.ts`

**Implementation requirements**

- Implement deterministic helpers:
  - `computeChunkCoord(value, chunkWorldSize)`
  - `computeChunkXY(x, y, chunkWorldWidth, chunkWorldHeight)`
  - `chunksForRadius(x, y, radius, chunkWorldWidth, chunkWorldHeight)`
  - `chunkOriginWorld(chunkX, chunkY, chunkWorldWidth, chunkWorldHeight)`
  - `worldToChunkLocal(x, y, chunkWorldWidth, chunkWorldHeight)`
- Must correctly handle negative coordinates using floor semantics.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Are helpers pure and reusable?
- Are negative coordinate edge cases handled?

**Quality review checklist**

- Clear naming and no magic constants.
- No duplicate chunk math elsewhere.

---

### Task 4 - Global spatial service API

**Goal**
Implement `convex/globalSpatial.ts` with core CRUD and query endpoints.

**Files**

- Create: `convex/globalSpatial.ts`

**Implementation requirements**

- Queries:
  - `getByEntity(entityType, entityId)`
  - `listByChunk(worldKey, chunkX, chunkY, entityType?)`
  - `queryRadius(worldKey, x, y, radius, entityType?)`
- Mutations:
  - `upsertEntity(...)`
  - `removeEntity(entityType, entityId)`
- `queryRadius` must use chunk prefilter + precise distance filter.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Are required APIs present with correct args?
- Does radius query avoid full-table scan patterns?

**Quality review checklist**

- Input validation and predictable return shapes.
- Internal helper reuse (Task 3 utilities).

---

### Task 5 - Entity location canonical state API

**Goal**
Implement `convex/entityLocations.ts`.

**Files**

- Create: `convex/entityLocations.ts`

**Implementation requirements**

- Query:
  - `get(entityType, entityId)`
- Mutation:
  - `setLocation(...)` (global or instance)
  - updates `lastPortalId`, `lastPortalUsedAt`, and optional last global coords.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Can location represent both dimensions?
- Are portal metadata fields persisted on transition updates?

**Quality review checklist**

- Clear union-like branching for dimension modes.
- No ambiguous nullable state combinations.

---

### Task 6 - Portal registry API + transition audit

**Goal**
Implement `convex/portalDefs.ts` and transition logging.

**Files**

- Create: `convex/portalDefs.ts`

**Implementation requirements**

- Query:
  - `getByPortalId(portalId)`
  - `listFromAnchor(...)`
- Mutations:
  - `upsertPortalDef(...)`
  - `removePortalDef(portalId)`
  - `recordTransition(...)` (writes `portalTransitions` row)

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Supports global->instance, instance->global, instance->instance forms.
- Transition log writes include entity and from/to dimensions.

**Quality review checklist**

- Data integrity checks for required destination fields by dimension type.

---

### Task 7 - Dimension transition orchestrator

**Goal**
Create one backend orchestration mutation to apply portal transitions consistently.

**Files**

- Create: `convex/mechanics/dimensionTransition.ts`

**Implementation requirements**

- Input: `profileId`, `portalId` (or compatible fallback for migration).
- Resolve portal and compute destination.
- Update `entityLocations`.
- Update `globalSpatial` membership:
  - entering instance: remove from `globalSpatial`
  - entering global: upsert into `globalSpatial`
- Record `portalTransitions`.
- Keep profile map-position updates consistent with existing `profiles.savePosition` semantics.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Are all side effects applied atomically in one mutation path?
- Is globalSpatial exclusive to global entities?

**Quality review checklist**

- Guardrails for missing/disabled portal defs.
- Clear error reasons and no silent state drift.

---

### Task 8 - Global chunks API (static terrain and objects)

**Goal**
Implement chunk data CRUD and fetch APIs.

**Files**

- Create: `convex/globalChunks.ts`

**Implementation requirements**

- Queries:
  - `getChunk(worldKey, chunkX, chunkY)`
  - `listChunksInWindow(worldKey, minChunkX, maxChunkX, minChunkY, maxChunkY)`
- Mutations:
  - `upsertChunk(...)`
  - `patchChunkStaticObjects(...)`
- Static objects in chunk may reference `portalId`.
- Chunk payload coordinates for static objects are chunk-local.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Does table contract match PRD fields?
- Are chunk lookup indexes actually used?

**Quality review checklist**

- Avoid giant full-row rewrites where patching is sufficient.

---

### Task 9 - Backfill and migration scripts

**Goal**
Provide operational scripts for safe adoption.

**Files**

- Create: `scripts/backfill-portal-ids.mjs`
- Create: `scripts/backfill-entity-locations.mjs`
- Optional: `scripts/reconcile-global-spatial.mjs`

**Implementation requirements**

- `backfill-portal-ids` assigns stable IDs to existing map portal entries lacking `portalId`.
- `backfill-entity-locations` creates rows for active profiles and npcState.
- dry-run and confirm modes required.

**Verification**

- `npm run typecheck` (for TS touched files)
- script lint pass if applicable.

**Spec review checklist**

- Scripts are idempotent.
- Scripts support dry-run and explicit confirm.

**Quality review checklist**

- Failure handling and progress output.

---

### Task 10 - Runtime integration (feature-flagged)

**Goal**
Integrate portal registry into current transition flow with fallback.

**Files**

- Modify: `src/engine/Game/checkPortals.ts`
- Modify: `src/engine/Game/changeMap.ts`
- Add any small bridge module needed in `src/engine/Game/`

**Implementation requirements**

- If portal has `portalId`, use backend transition orchestrator flow.
- If no `portalId`, keep existing behavior unchanged.
- Preserve current fade and subscription behavior.

---

### Task 11 - Global chunk renderer scaffold + cache

**Goal**
Add a global renderer scaffold that can display multiple global chunks concurrently with cache management.

**Files**

- Create: `src/engine/GlobalChunkRenderer.ts`
- Create: `src/engine/globalChunkCache.ts`
- Add any small integration bridge in `src/engine/Game/`

**Implementation requirements**

- Reuse map layer rendering primitives (avoid full `MapRenderer` per chunk instance).
- Render chunk containers positioned by chunk origin world coordinates.
- Support visible window + prefetch window and evict stale chunks.
- Dedupe in-flight fetches per chunk key.
- Keep this task visual-only scaffold (no full procedural generation dependency).

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Can multiple chunks be on-screen concurrently?
- Is cache lifecycle implemented (load/reuse/evict)?
- Does it avoid instantiating heavyweight per-chunk editor state?

**Quality review checklist**

- Container cleanup safety.
- No unbounded cache growth.
- Readable constants and minimal coupling.

**Verification**

- `npm run typecheck`

**Spec review checklist**

- Does legacy portal behavior still work?
- Does `portalId` path invoke new transition contract?

**Quality review checklist**

- No duplicated transition logic.
- Clear fallback path and error logs.

---

## 5) Final System Review Task

After Task 11 is approved:

1. Dispatch final code-reviewer subagent across all changed files.
2. Verify:
   - schema/index integrity
   - backward compatibility
   - no obvious drift between location and spatial records
3. Produce release notes and migration runbook snippet.

---

## 6) Suggested Task Order for Immediate Start

To unlock value quickly while minimizing risk:

1. Task 1 (schema)
2. Task 3 (chunk math utility)
3. Task 4 (globalSpatial API)
4. Task 5 (entityLocations API)

This delivers the core global spatial foundation before runtime behavior changes.

---

## 7) Definition of Done

- All 10 tasks pass spec and quality review gates.
- All 11 tasks pass spec and quality review gates.
- `npm run typecheck` passes for new/edited TS surface (aside from known unrelated baseline issues if any, explicitly documented).
- Existing map-only gameplay remains functional.
- Global dimension tables and APIs are usable for next-phase features (procedural generation, NPC global behavior, global item spawning).
