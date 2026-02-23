# Openworld Global Dimensions - Implementation Debrief

**Date:** 2026-02-22
**Scope Reviewed:** Tasks 1-8 from `docs/plans/2026-02-22-openworld-global-dimensions-implementation-plan.md`
**Reviewer:** Buddy

---

## 1) Executive Debrief

The openworld foundation is implemented and structurally aligned with the PRD:

- chunk-backed static global terrain/object model
- global spatial index for dynamic entities
- canonical cross-dimension entity location table
- centralized portal registry + transition audit table
- backend transition orchestrator for portal travel

Implementation is **ready with caveats**: schema and services are in place, but authorization hardening and migration scripts should be completed before runtime/client integration.

---

## 2) Review Method

Reviewed the implemented code and docs directly, with task-by-task spec/quality checks already completed during implementation. Verified generated API exports and reran typecheck.

Key files reviewed:

- `convex/schema.ts`
- `convex/maps/mutations.ts`
- `src/types/map.ts`
- `convex/lib/globalSpatial.ts`
- `convex/globalSpatial.ts`
- `convex/entityLocations.ts`
- `convex/portalDefs.ts`
- `convex/globalChunks.ts`
- `convex/mechanics/dimensionTransition.ts`
- `docs/plans/2026-02-22-openworld-global-dimensions-prd.md`
- `docs/plans/2026-02-22-openworld-global-dimensions-implementation-plan.md`

---

## 3) Completion Matrix (Tasks 1-8)

1. **Task 1 (schema foundations):** Complete  
   Evidence: `convex/schema.ts:137`, `convex/schema.ts:171`, `convex/schema.ts:192`, `convex/schema.ts:210`, `convex/schema.ts:234`

2. **Task 2 (portalId compatibility):** Complete  
   Evidence: `convex/schema.ts:73`, `convex/maps/mutations.ts:22`, `src/types/map.ts:19`

3. **Task 3 (chunk math utility):** Complete  
   Evidence: `convex/lib/globalSpatial.ts:1`, `convex/lib/globalSpatial.ts:20`, `convex/lib/globalSpatial.ts:107`

4. **Task 4 (globalSpatial API):** Complete  
   Evidence: `convex/globalSpatial.ts:41`, `convex/globalSpatial.ts:56`, `convex/globalSpatial.ts:68`, `convex/globalSpatial.ts:106`, `convex/globalSpatial.ts:172`

5. **Task 5 (entityLocations API):** Complete  
   Evidence: `convex/entityLocations.ts:11`, `convex/entityLocations.ts:26`

6. **Task 6 (portalDefs API + transition log):** Complete  
   Evidence: `convex/portalDefs.ts:36`, `convex/portalDefs.ts:48`, `convex/portalDefs.ts:69`, `convex/portalDefs.ts:137`, `convex/portalDefs.ts:156`

7. **Task 7 (dimension transition orchestrator):** Complete  
   Evidence: `convex/mechanics/dimensionTransition.ts:84`

8. **Task 8 (globalChunks API):** Complete  
   Evidence: `convex/globalChunks.ts:33`, `convex/globalChunks.ts:44`, `convex/globalChunks.ts:77`, `convex/globalChunks.ts:126`

---

## 4) Validation Results

- Generated API exports include new modules.  
  Evidence: `convex/_generated/api.d.ts:101`, `convex/_generated/api.d.ts:102`, `convex/_generated/api.d.ts:103`, `convex/_generated/api.d.ts:124`, `convex/_generated/api.d.ts:139`

- `npm run typecheck` still fails due pre-existing baseline issue unrelated to this scope:  
  `convex/npc/braintrust.ts:24` (`process` type unresolved)

---

## 5) Findings

### 5.1 High-priority caveats (fix before exposing runtime path)

1. **Public mutation surface needs authorization hardening**
   - `convex/globalSpatial.ts:106`
   - `convex/globalSpatial.ts:172`
   - `convex/entityLocations.ts:26`
   - `convex/portalDefs.ts:69`
   - `convex/portalDefs.ts:137`
   - `convex/portalDefs.ts:156`
   - `convex/globalChunks.ts:77`
   - `convex/globalChunks.ts:126`

   These currently rely on caller correctness and are not restricted by ownership/admin/internal-only boundaries.

2. **Profile startup compatibility risk for global dimension**
   - Global transition branch updates profile `x/y` but not `mapName`: `convex/mechanics/dimensionTransition.ts:217`
   - Startup currently resolves map from profile mapName: `src/engine/Game/loadDefaultMap.ts:14`

   Until Task 10 runtime integration is complete, reconnect/startup can still be mapName-driven.

### 5.2 Medium-priority caveats

1. **Chunk-size consistency is caller-driven today**
   - `convex/globalSpatial.ts:75`
   - `convex/globalSpatial.ts:116`
   - `convex/mechanics/dimensionTransition.ts:88`

   Caller-provided `chunkWorldWidth/Height` can drift from world defaults if not centralized.

2. **No reconciliation scripts yet**
   - Task 9 pending; no backfill/reconcile scripts currently in tree for portal IDs/entity locations.

---

## 6) Architecture Confirmation

Implementation matches intended direction:

- **Static global world data:** `globalChunks` (`convex/schema.ts:137`)
- **Dynamic global entity index:** `globalSpatial` (`convex/schema.ts:171`)
- **Canonical dimension location:** `entityLocations` (`convex/schema.ts:192`)
- **Shared portal registry:** `portalDefs` (`convex/schema.ts:210`)
- **Transition history:** `portalTransitions` (`convex/schema.ts:234`)

Portal compatibility was preserved with optional `portalId` and legacy `targetMap/targetSpawn` fields still intact.

---

## 7) Decision

**Implementation confirmed for Tasks 1-8** with the caveats above.

Proceeding to next steps is appropriate, with immediate focus on migration/backfill tooling (Task 9), then runtime integration (Task 10), then renderer scaffold (Task 11).

---

## 8) Next Steps (Immediate)

1. Implement Task 9 scripts:
   - `scripts/backfill-portal-ids.mjs`
   - `scripts/backfill-entity-locations.mjs`
   - `scripts/reconcile-global-spatial.mjs` (recommended)
2. Add authorization/internalization pass for new backend mutation endpoints.
3. Then begin Task 10 runtime integration with fallback behavior.
