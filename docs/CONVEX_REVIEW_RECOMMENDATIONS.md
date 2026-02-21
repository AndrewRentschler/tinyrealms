# Convex Setup Review – Recommendations

**Generated:** 2025-02-21  
**Scope:** Full Convex codebase review against convex-basics skill (anti-patterns, schema validator, helpers, best practices)

---

## Summary

This document aggregates findings from a parallel review of the Tiny Realms Convex setup. Findings are appended as subagents complete their analysis.

**Related:**
- [CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md](./CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md) – baseline snapshot and progress tracking
- [plans/2026-02-21-convex-validator-type-hardening-rollout.md](./plans/2026-02-21-convex-validator-type-hardening-rollout.md) – rollout notes and verification (Tasks 1–6 complete)

---

## 1. Query Anti-Patterns

### 1.1 `.filter()` Usage (Should Use Indexes)

Replace `.filter()` with `withIndex`:

| File | Line | Description |
|------|------|-------------|
| `convex/maps/queries.ts` | 20, 41, 78 | Filters by status, mapType, createdBy |
| `convex/npcProfiles/queries.ts` | 17, 57, 60, 64 | Filters by visibility, category |
| `convex/story/quests.ts` | 170, 173, 177, 188, 190 | Filters by sourceType, offeredByNpc, mapScope, status |
| `convex/admin/users.ts` | 29, 119, 127, 206 | Admin queries using filter |
| `convex/superuser.ts` | 127, 206 | Superuser queries using filter |

**Action:** Add indexes (e.g. `by_status`, `by_mapType`, `by_createdBy`) and use `withIndex` instead of `.filter()`.

### 1.2 Unbounded `.collect()`

Many queries use `.collect()` without `.take(n)` on potentially large tables:

- **High priority:** `messages`, `npcConversations`, `worldItems`, `presence`, `playerQuests`
- **Medium:** `maps`, `mapObjects`, `npcState`, `profiles`, `itemDefs`
- **Admin/backfill:** May be acceptable for one-off operations

**Action:** Add `.take(n)` limits to user-facing queries. Consider pagination for large result sets.

### 1.3 N+1 Query Pattern

- **`convex/story/quests.ts:127-152`** – `listActive` loops through playerQuests and calls `ctx.db.query("questDefs")` for each. Batch-load questDefs with `getAll` or similar.

### 1.4 Missing `returns` Validators

**Status:** Critical functions updated (Tasks 1–2). Remaining: `convex/maps/queries.ts`, `convex/npcProfiles/queries.ts`, admin, and others.

**Action:** Add explicit `returns` validators to remaining functions (Convex best practice). See [CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md](./CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md).

---

## 2. Schema & Validator Anti-Patterns

### 2.1 `v.any()` Usage – Critical

**Status (post Tasks 1–6):** High-risk public args replaced. Schema uses `v.record(v.string(), v.any())` for extensible fields. Remaining `v.any()` in medium/low-risk areas (admin, migrations, dialogue, economy).

**Schema (`convex/schema.ts`):** `logicConfig`, `sideEffects` now use shared validators (`logicConfigValidator`, `sideEffectsValidator`) with `v.record(v.string(), v.any())`.

**Functions (remaining):** `convex/admin/restore.ts`, `convex/migrations.ts`, `convex/mechanics/economy.ts`, `convex/story/dialogue.ts`, `convex/players.ts`, `convex/ai.ts`, `convex/story/quests.ts` (internal shapes).

**Action:** Continue replacing with typed validators where feasible. See [rollout doc](./plans/2026-02-21-convex-validator-type-hardening-rollout.md).

### 2.2 Missing Indexes

| Table | Missing Index | Usage |
|-------|---------------|-------|
| `maps` | `by_status`, `by_mapType`, `by_createdBy` | maps/queries.ts |
| `lore` | `by_category` | story/lore.ts |
| `spriteDefinitions` | `by_category` | npcProfiles/queries.ts, npcEngine.ts |
| `mapObjects` | `by_instanceName` | mapObjects.ts, npcProfiles/mutations.ts |
| `npcState` | `by_respawnAt` | npcEngine.ts |
| `questDefs` | compound `by_sourceType_offeredByNpc` | story/quests.ts |
| `worldItems` | `by_pickedUpAt` or compound | worldItems queries |

### 2.3 Redundant Indexes

- `npcConversations`: `by_npc` is a prefix of `by_npc_time` – consider removing if compound covers all queries.
- `npcActionLog`: Same pattern.

---

## 3. Mutations & Actions

### 3.1 No Violations

- No `fetch()` in mutations – external calls are in actions.
- No `ctx.db` in actions – correct use of `ctx.runQuery`/`ctx.runMutation`.

### 3.2 Non-Atomic Operations

**Currency transfer:** `convex/mechanics/economy.ts` – `addCurrency` and `spendCurrency` are separate. Add `transferCurrency` mutation for atomic debit+credit.

**Storage transfer:** `convex/storage/deposit.ts`, `convex/storage/withdraw.ts` – Add `transferItem` mutation for atomic storage-to-storage moves.

### 3.3 Global Hot-Spot

**`convex/weather.ts`** – Single `weatherGlobal` document (key: `"global"`) is patched frequently by the tick loop, creating OCC contention.

**Recommendations:** Shard by map, reduce update frequency, or compute weather from time/seed instead of stored state.

### 3.4 Retry Without Backoff/Jitter

| File | Issue |
|------|-------|
| `convex/weather.ts` | Fixed tick delay – add jitter |
| `convex/npcEngine.ts` | Fixed `TICK_MS` – add jitter |
| `convex/worldItems.ts` | Fixed respawn delay – add jitter |
| `convex/mapObjects.ts` | Immediate `runAfter(0)` – consider debounce |

---

## 4. Security & Function Exposure

### 4.1 Missing Auth – Critical

| File | Mutations | Risk |
|------|-----------|------|
| `convex/maps/mutations.ts` | `updateLayer`, `updateCollision`, `updateLabels` | Anyone can modify any map |
| `convex/story/quests.ts` | `create` | Anyone can create quests |
| `convex/mechanics/combat/logging.ts` | `createEncounter`, `submitAction`, `logCombat` | Anyone can forge combat data |

**Action:** Add `requireMapEditor` to map mutations; add auth checks to quests and combat logging.

### 4.2 Missing Auth – Medium

| File | Mutation | Risk |
|------|----------|------|
| `convex/mapObjects.ts` | `toggle` | Anyone can toggle map objects. Verify if intentional. |

### 4.3 Admin Functions

Admin functions in `convex/admin/*.ts` are public mutations protected by `requireAdminKey`. This is intentional for CLI scripts but exposes endpoints publicly.

**Recommendation:** Consider `internalMutation`/`internalQuery` and calling via HTTP or scheduled functions.

---

## Priority Summary

| Priority | Category | Count |
|----------|----------|-------|
| Critical | Missing auth (maps, quests, combat) | 7 mutations |
| Critical | `v.any()` in schema and validators | 20+ instances |
| High | Add indexes for filtered queries | 7+ indexes |
| High | Atomic currency/storage transfers | 2 mutations |
| High | N+1 pattern in quests | 1 |
| Medium | Unbounded `.collect()` | 100+ |
| Medium | Replace `.filter()` with indexes | 18+ |
| Medium | Weather hot-spot, retry jitter | 4 |
| Low | Missing `returns` validators | Widespread |
| Low | Redundant indexes | 2 |

---

## Quick Checklist

- [ ] Add `requireMapEditor` to `updateLayer`, `updateCollision`, `updateLabels`
- [ ] Add auth to `quests.create`, `combat/logging` mutations
- [x] Replace `v.any()` in schema (`logicConfig`, `sideEffects`) – now use typed validators
- [x] Add indexes: `maps.by_status`, `spriteDefinitions.by_category`, etc. – Task 6
- [ ] Add `transferCurrency` and `transferItem` mutations
- [ ] Fix N+1 in `story/quests.ts` listActive
- [ ] Add `.take(n)` to unbounded collects on large tables
- [ ] Add jitter to weather/NPC tick scheduling
- [x] Add `returns` validators to critical functions – Task 2; remaining functions pending

---

