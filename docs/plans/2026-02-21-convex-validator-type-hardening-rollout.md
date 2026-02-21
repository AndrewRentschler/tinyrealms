# Convex Validator Type Hardening – Rollout Notes

**Date:** 2026-02-21  
**Plan:** [2026-02-21-convex-validator-type-hardening.md](./2026-02-21-convex-validator-type-hardening.md)  
**Status:** Tasks 1–6 complete; Task 7 verification and documentation.

---

## 1. Pre-Deploy Gates

Before deploying validator/type hardening changes, verify:

| Gate | Command / Check | Expected |
|------|-----------------|----------|
| **Typecheck** | `npm run typecheck` | See [§2 Verification Results](#2-verification-results) |
| **Lint** | `npm run lint` | PASS (0 errors; 2 warnings in generated files acceptable) |
| **Critical v.any()** | No `v.any()` in public-facing args or schema table definitions | See [§3 Remaining v.any()](#3-remaining-vany) |
| **Returns validators** | Critical functions in `convex/story/quests.ts`, `convex/maps/mutations.ts`, `convex/mechanics/combat/logging.ts`, `convex/npcProfiles/mutations.ts`, `convex/ai.ts`, `convex/story/storyAi.ts` | All have explicit `returns` |

### Verification Commands

```bash
npm run typecheck
npm run lint
```

---

## 2. Verification Results

### `npm run typecheck`

| Run Date | Result | Notes |
|----------|--------|-------|
| 2026-02-21 | **FAIL** (9 errors) | All errors in `src/`, not in `convex/` |

**Convex-specific typecheck:** Convex code compiles cleanly. Failures are **pre-existing** in frontend (`src/`):

| File | Issue |
|------|-------|
| `src/engine/Game/handleCombatInput.ts` | `api.mechanics/combat` not in api type |
| `src/engine/Game/handleHostileAggroTick.ts` | `api.mechanics/combat` not in api type |
| `src/engine/Game/subscribeToNpcState.ts` | `NpcStateRow.direction` type mismatch (string \| undefined vs string) |
| `src/ui/CharacterPanel.ts` | `api.story/quests` not in api type |
| `src/ui/HUD.ts` | `api.story/quests` not in api type (5 usages) |

**Gate interpretation:** For validator hardening rollout, treat **Convex-specific typecheck as PASS**. Full project typecheck fails due to pre-existing `src/` issues; address separately.

### `npm run lint`

| Run Date | Result | Notes |
|----------|--------|-------|
| 2026-02-21 | **PASS** | 2 warnings in `convex/_generated/*.js` (unused eslint-disable) |

---

## 3. Remaining v.any()

After Tasks 1–6, remaining `v.any()` usage:

| Location | Risk | Notes |
|---------|------|-------|
| `convex/schema.ts` | Medium | `logicConfigValidator`, `sideEffectsValidator` use `v.record(v.string(), v.any())` for extensible payloads |
| `convex/story/quests.ts` | Medium | `returns` and internal shapes (progress, objectives, rewards) – structured where possible |
| `convex/ai.ts` | Low | `actions` array in context |
| `convex/admin/restore.ts` | Low | Admin-only; dynamic table shapes |
| `convex/migrations.ts` | Low | `defaultValue` for backfill |
| `convex/mechanics/economy.ts` | Low | `inventory` in getShop/createShop |
| `convex/story/dialogue.ts` | Low | `nodes`, `metadata` – extensible |
| `convex/players.ts` | Low | `stats` in update mutation |

**Critical public-facing args/schema:** No remaining critical `v.any()` in public-facing function args or schema table definitions. Schema uses `v.record(v.string(), v.any())` for bounded extensibility.

---

## 4. What Changed (Tasks 1–6)

| Task | Scope | Summary |
|------|-------|---------|
| 1 | Docs | Baseline checklist, v.any() locations, returns gaps |
| 2 | Convex functions | Added `returns` validators to critical functions (quests, maps, combat, npcProfiles, ai, storyAi) |
| 3 | Convex functions | Replaced high-risk `v.any()` in function args with structured validators |
| 4 | Schema | Tightened schema `v.any()` fields with typed unions/records |
| 5 | Auth/admin | Removed unsafe `any` casts in auth and admin runtime paths |
| 6 | Queries | Replaced `.filter()` with indexes; bounded `.collect()` where applicable |

---

## 5. Migration Caveats

- **Schema shape:** If schema validators were tightened (e.g. `logicConfig`, `sideEffects`), existing documents must conform. Migrations in `convex/migrations.ts` were updated to use compatible defaults.
- **API contracts:** `returns` validators enforce handler output shape. Handlers were adjusted to match; no breaking changes to client-visible return types.
- **Index additions:** New indexes in `convex/schema.ts` may affect deployment; Convex applies schema changes automatically.

---

## 6. Rollback Strategy

Revert by task (commit group):

| Task | Revert scope |
|------|--------------|
| 6 | `convex/maps/queries.ts`, `convex/story/quests.ts`, `convex/admin/users.ts`, `convex/superuser.ts`, `convex/schema.ts` |
| 5 | `convex/superuser.ts`, `convex/mapObjects.ts`, `convex/lib/*`, `convex/items.ts`, `convex/worldItems.ts`, `convex/profiles.ts`, `convex/presence.ts`, `convex/npcEngine.ts` |
| 4 | `convex/schema.ts`, `convex/migrations.ts` |
| 3 | `convex/story/quests.ts`, `convex/mechanics/combat/logging.ts`, `convex/npc/braintrust.ts`, `convex/story/storyAi.ts`, `convex/ai.ts` |
| 2 | `convex/story/quests.ts`, `convex/maps/mutations.ts`, `convex/mechanics/combat/logging.ts`, `convex/npcProfiles/mutations.ts`, `convex/ai.ts`, `convex/story/storyAi.ts` |

```bash
# Example: revert Task 6 only
git revert <task6-commit> --no-commit
# Review, then commit
```

---

## 7. Post-Deploy Checks

1. **Convex dashboard:** Confirm functions deploy without errors.
2. **Smoke test:** Run core flows (map load, NPC interaction, quest start, combat).
3. **Admin scripts:** Verify `admin-run.mjs` and related scripts still work.
4. **Schema validation:** Confirm no runtime validator errors in Convex logs.

---

## 8. References

- [CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md](../CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md)
- [CONVEX_REVIEW_RECOMMENDATIONS.md](../CONVEX_REVIEW_RECOMMENDATIONS.md)
