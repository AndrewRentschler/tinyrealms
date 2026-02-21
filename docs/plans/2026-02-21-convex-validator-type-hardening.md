# Convex Validator and Type Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate unsafe validator/type patterns in `convex/` by adding explicit `returns` validators, replacing high-risk `v.any()` usage, and removing unsafe `any` casts in core runtime paths.

**Architecture:** Apply changes in small vertical slices (file groups) so each slice compiles cleanly. Start with function contracts (`returns`) to enforce runtime/API boundaries, then tighten input/schema validators, then remove unsafe casts and query anti-patterns. Keep behavior unchanged while improving safety, correctness, and maintainability.

**Tech Stack:** Convex (TypeScript), Convex validators (`v`), existing auth helpers, existing lint/typecheck pipeline

---

**References:** @convex-basics, @convex-anti-patterns, @convex-best-practices

### Task 1: Establish Baseline and Contract Checklist

**Files:**
- Create: `docs/CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md`
- Modify: `docs/CONVEX_REVIEW_RECOMMENDATIONS.md`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test (baseline snapshot)**

Create a checklist document with explicit sections:
- Missing `returns` validators by file/function
- `v.any()` locations grouped by risk (high/medium/low)
- `as any` / `: any` runtime casts grouped by domain
- `.filter()` / unbounded `.collect()` query risks

**Step 2: Run baseline commands and capture failure points**

Run: `npm run typecheck`
Expected: PASS or current known failures recorded in checklist.

Run: `npm run lint`
Expected: PASS or current known failures recorded in checklist.

**Step 3: Commit**

```bash
git add docs/CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md docs/CONVEX_REVIEW_RECOMMENDATIONS.md
git commit -m "docs(convex): add validator/type hardening checklist baseline"
```

---

### Task 2: Add `returns` Validators to Critical Convex Functions

**Files:**
- Modify: `convex/story/quests.ts`
- Modify: `convex/maps/mutations.ts`
- Modify: `convex/mechanics/combat/logging.ts`
- Modify: `convex/npcProfiles/mutations.ts`
- Modify: `convex/ai.ts`
- Modify: `convex/story/storyAi.ts`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

For each function in the files above, add a `returns` validator first without changing body logic. Example pattern:

```typescript
export const listActive = query({
  args: { profileId: v.id("profiles") },
  returns: v.array(
    v.object({
      questDefKey: v.string(),
      status: v.union(v.literal("active"), v.literal("completed"), v.literal("failed")),
      progress: v.optional(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    // existing implementation unchanged initially
  },
});
```

**Step 2: Run typecheck to expose mismatches**

Run: `npm run typecheck`
Expected: FAIL initially where handler return shape diverges from declared `returns`.

**Step 3: Write minimal implementation to satisfy contracts**

Adjust handler return values (not behavior) so they match declared validators; use `v.null()` when no meaningful value is returned.

**Step 4: Verify pass**

Run: `npm run typecheck`
Expected: PASS for updated files.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/story/quests.ts convex/maps/mutations.ts convex/mechanics/combat/logging.ts convex/npcProfiles/mutations.ts convex/ai.ts convex/story/storyAi.ts
git commit -m "fix(convex): add explicit returns validators to critical functions"
```

---

### Task 3: Replace High-Risk `v.any()` in Function Args

**Files:**
- Modify: `convex/story/quests.ts`
- Modify: `convex/mechanics/combat/logging.ts`
- Modify: `convex/npc/braintrust.ts`
- Modify: `convex/story/storyAi.ts`
- Modify: `convex/ai.ts`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

Replace each high-risk `v.any()` arg with temporary strict validators that intentionally fail where shapes are unknown. Example:

```typescript
args: {
  conversationHistory: v.array(
    v.object({
      role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }),
  ),
}
```

**Step 2: Run typecheck to find gaps**

Run: `npm run typecheck`
Expected: FAIL where current callsites send incompatible shapes.

**Step 3: Write minimal compatible validators**

Introduce precise unions/records for real payloads (e.g., quest steps, rewards, combat actions). Use `v.union(...)` + `v.object(...)` instead of `v.any()`.

**Step 4: Verify pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/story/quests.ts convex/mechanics/combat/logging.ts convex/npc/braintrust.ts convex/story/storyAi.ts convex/ai.ts
git commit -m "refactor(convex): replace high-risk v.any args with structured validators"
```

---

### Task 4: Tighten Schema `v.any()` Fields Safely

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/migrations.ts`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

Define target validator shapes for:
- `npcProfiles.logicConfig`
- `events.conditions`
- `events.script`
- any `sideEffects` objects

Start strict enough to reveal undocumented shapes.

**Step 2: Run typecheck and schema validation**

Run: `npm run typecheck`
Expected: FAIL initially if runtime code relies on undocumented dynamic shapes.

**Step 3: Write minimal schema-safe implementation**

Use `v.union(...)` with discriminators and bounded `v.record(v.string(), ...)` for extensible fields. Update migration defaults accordingly so documents remain valid.

**Step 4: Verify pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/migrations.ts
git commit -m "refactor(convex): replace schema v.any usage with typed unions and records"
```

---

### Task 5: Remove Unsafe `any` Casts in Auth and Admin Paths

**Files:**
- Modify: `convex/superuser.ts`
- Modify: `convex/mapObjects.ts`
- Modify: `convex/lib/requireSuperuser.ts`
- Modify: `convex/lib/requireMapEditor.ts`
- Modify: `convex/lib/requireAdminKey.ts`
- Modify: `convex/items.ts`
- Modify: `convex/worldItems.ts`
- Modify: `convex/profiles.ts`
- Modify: `convex/presence.ts`
- Modify: `convex/npcEngine.ts`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

Remove one `as any` cast at a time and replace with concrete types (`Doc<...>`, `Id<...>`, narrow interfaces). Let type errors expose missing guards.

**Step 2: Run typecheck for each micro-change**

Run: `npm run typecheck`
Expected: FAIL after each cast removal until proper narrowing/guards are added.

**Step 3: Write minimal type-safe implementation**

Add explicit null/undefined checks and type guards at boundaries; avoid reintroducing `any`. Prefer helper functions for repeated narrowing logic.

**Step 4: Verify pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/superuser.ts convex/mapObjects.ts convex/lib/requireSuperuser.ts convex/lib/requireMapEditor.ts convex/lib/requireAdminKey.ts convex/items.ts convex/worldItems.ts convex/profiles.ts convex/presence.ts convex/npcEngine.ts
git commit -m "refactor(convex): remove unsafe any casts in auth and admin runtime paths"
```

---

### Task 6: Replace `.filter()` Query Anti-Patterns and Bound `.collect()`

**Files:**
- Modify: `convex/maps/queries.ts`
- Modify: `convex/story/quests.ts`
- Modify: `convex/admin/users.ts`
- Modify: `convex/superuser.ts`
- Modify: `convex/schema.ts` (index additions as needed)
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

Replace one `.filter()` call with `withIndex(...)` in each file group and run typecheck/lint before proceeding to next.

**Step 2: Run checks to confirm query contract stability**

Run: `npm run typecheck`
Expected: PASS or clear failures where new indexes are required.

**Step 3: Write minimal implementation**

- Add missing indexes in `convex/schema.ts` using index names that include all indexed fields.
- Replace unbounded `.collect()` with bounded patterns (`take(n)`, pagination, or explicit admin-only justification).

**Step 4: Verify pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/maps/queries.ts convex/story/quests.ts convex/admin/users.ts convex/superuser.ts convex/schema.ts
git commit -m "perf(convex): replace query filters with indexes and bound collect usage"
```

---

### Task 7: Final Regression Verification and Rollout Notes

**Files:**
- Modify: `docs/CONVEX_REVIEW_RECOMMENDATIONS.md`
- Modify: `docs/CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md`
- Create: `docs/plans/2026-02-21-convex-validator-type-hardening-rollout.md`
- Test: N/A (command-based verification only)

**Step 1: Write the failing test**

Create a rollout checklist with explicit pre-deploy gates:
- Typecheck clean
- Lint clean
- No remaining critical `v.any()` in public-facing args/schema
- No missing `returns` validators in `convex/`

**Step 2: Run full verification**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

**Step 3: Write minimal rollout documentation**

Document:
- what changed,
- migration caveats (if schema shape tightened),
- rollback strategy (revert commit group by task),
- post-deploy checks.

**Step 4: Commit**

```bash
git add docs/CONVEX_REVIEW_RECOMMENDATIONS.md docs/CONVEX_VALIDATOR_TYPE_HARDENING_CHECKLIST.md docs/plans/2026-02-21-convex-validator-type-hardening-rollout.md
git commit -m "docs(convex): add validator/type hardening rollout and verification notes"
```

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-02-21-convex-validator-type-hardening.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Session chosen:**
- Guide opening a new session in a dedicated worktree
- **REQUIRED SUB-SKILL:** New session uses superpowers:executing-plans
