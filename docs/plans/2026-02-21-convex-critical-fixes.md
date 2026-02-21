# Convex Critical Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address critical and high-priority findings from the Convex review (docs/CONVEX_REVIEW_RECOMMENDATIONS.md): missing auth on 7 mutations, schema indexes for filtered queries, and the N+1 pattern in quests.

**Architecture:** Add auth checks using existing patterns (requireMapEditor, getAuthUserId + profile ownership). Add schema indexes. Fix N+1 by batch-loading questDefs. No test framework exists; verify with `npm run typecheck` and `npm run lint`.

**Tech Stack:** Convex (TypeScript), @convex-dev/auth

---

## Task 1: Add requireMapEditor to updateLayer, updateCollision, updateLabels

**Files:**
- Modify: `convex/maps/mutations.ts:419-452`
- Check callers: `src/` (map editor UI) – may need to pass profileId

**Step 1: Add profileId to args and requireMapEditor**

For each of `updateLayer`, `updateCollision`, `updateLabels`:
- Add `profileId: v.id("profiles")` to args
- At start of handler: get map with `ctx.db.get(mapId)`, throw if not found
- Call `await requireMapEditor(ctx, profileId, map.name)` before patching

**Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (or fix any new errors)

**Step 3: Verify lint**

Run: `npm run lint`
Expected: PASS

**Step 4: Update frontend callers**

Search for `api.maps.mutations.updateLayer`, `updateCollision`, `updateLabels` in `src/`. Add `profileId` to each call (use current profile from context).

**Step 5: Commit**

```bash
git add convex/maps/mutations.ts src/
git commit -m "fix(convex): add requireMapEditor to updateLayer, updateCollision, updateLabels"
```

---

## Task 2: Add auth to quests.create

**Files:**
- Modify: `convex/story/quests.ts` (create mutation)

**Step 1: Add auth check to create mutation**

In `create` mutation:
- Add `getAuthUserId` import from `@convex-dev/auth/server`
- At start of handler: `const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Unauthorized");`
- Optionally: require superuser for quest creation (check existing `requireSuperuser` or similar). If quests are admin-only, use that. If any authenticated user can create, auth check above is sufficient.

**Step 2: Verify typecheck and lint**

Run: `npm run typecheck` and `npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/story/quests.ts
git commit -m "fix(convex): add auth check to quests.create"
```

---

## Task 3: Add auth to combat logging mutations

**Files:**
- Modify: `convex/mechanics/combat/logging.ts`

**Step 1: Add auth to createEncounter, submitAction, logCombat**

For each mutation:
- Import `getAuthUserId` from `@convex-dev/auth/server`
- At start: `const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Unauthorized");`
- For `submitAction` and `logCombat`: verify `profileId` belongs to the authenticated user (profile.userId === userId). Get profile with `ctx.db.get(profileId)` and check.

**Step 2: Verify typecheck and lint**

Run: `npm run typecheck` and `npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/mechanics/combat/logging.ts
git commit -m "fix(convex): add auth checks to combat logging mutations"
```

---

## Task 4: Add schema indexes for filtered queries

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Add indexes to maps table**

Add after existing indexes on `maps`:
```typescript
.index("by_status", ["status"])
.index("by_mapType", ["mapType"])
.index("by_createdBy", ["createdBy"])
```

**Step 2: Add index to spriteDefinitions**

Add:
```typescript
.index("by_category", ["category"])
```

**Step 3: Add index to lore**

Add:
```typescript
.index("by_category", ["category"])
```

**Step 4: Add index to mapObjects**

Add:
```typescript
.index("by_instanceName", ["instanceName"])
```

**Step 5: Add index to questDefs**

Add compound index:
```typescript
.index("by_sourceType_and_offeredByNpc", ["sourceType", "offeredByNpcInstanceName"])
```

**Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): add indexes for maps, spriteDefinitions, lore, mapObjects, questDefs"
```

---

## Task 5: Replace .filter() with withIndex in maps queries

**Files:**
- Modify: `convex/maps/queries.ts`

**Step 1: Update listPublished**

Replace `.filter()` by status with:
- Use `withIndex("by_status", (q) => q.eq("status", "published"))` if filtering for published only
- Or keep collect + filter if need to exclude "draft" (index on status still helps)

**Step 2: Update listSummaries and listStartMaps**

Use `withIndex("by_mapType", ...)` and `withIndex("by_createdBy", ...)` where applicable. May need compound index `by_mapType_and_createdBy` if both are filtered.

**Step 3: Verify typecheck and lint**

Run: `npm run typecheck` and `npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add convex/maps/queries.ts
git commit -m "refactor(convex): use indexes instead of filter in maps queries"
```

---

## Task 6: Fix N+1 in story/quests.ts listActive

**Files:**
- Modify: `convex/story/quests.ts` (listActive query)

**Step 1: Batch-load questDefs**

In `listActive`:
- Collect all unique `questDefKey` values from playerQuests
- Use a single query or `getAll`-style batch to load all questDefs by key
- Build a Map<questDefKey, questDef>
- Map over playerQuests and look up questDef from the Map instead of querying per item

**Step 2: Verify typecheck and lint**

Run: `npm run typecheck` and `npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add convex/story/quests.ts
git commit -m "perf(convex): fix N+1 in listActive by batch-loading questDefs"
```

---

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/plans/2026-02-21-convex-critical-fixes.md`. Two execution options:**

**1. Subagent-Driven (this session)** – I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** – Open new session with executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Session chosen:**
- Guide them to open new session in worktree
- **REQUIRED SUB-SKILL:** New session uses superpowers:executing-plans
