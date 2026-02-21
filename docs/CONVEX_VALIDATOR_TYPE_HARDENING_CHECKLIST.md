# Convex Validator and Type Hardening Checklist

**Created:** 2026-02-21  
**Purpose:** Baseline snapshot for validator/type hardening work. Use for tracking progress and regression verification.

---

## 1. Missing `returns` Validators by File/Function

**Status:** All Convex functions lack explicit `returns` validators (Convex best practice).

| File | Functions Missing `returns` |
|------|-----------------------------|
| `convex/maps/mutations.ts` | create, saveFullMap, updateMetadata, setEditors, remove, updateLayer, updateCollision, updateLabels |
| `convex/maps/queries.ts` | list, listPublished, listSummaries, listStartMaps, get, getByName |
| `convex/admin/backfills.ts` | backfillMaps, migrateSpriteSheetUrls, backfillAssetVisibilityTypes, grantMapEditor |
| `convex/admin/users.ts` | backfillRoles, listProfiles, setRole, removeProfile, listUsers, removeAnonymousUsers, cleanupProfileInUse, currentUser, myAccountInfo, assignUnlinkedProfiles, grantSuperuser, removeUser, removeUserByEmail, listUsersWithProfiles |
| `convex/admin/maps.ts` | resetProfileMap, resetAllProfileMaps, listMaps, adminUpdateMap |
| `convex/admin/restore.ts` | dumpAll, restoreClearTable, restoreInsertChunk |
| `convex/admin/inspection.ts` | listNpcs |
| `convex/admin/clear.ts` | clearChat, clearProfiles, clearPresence, clearMaps, clearMapObjects |
| `convex/superuser.ts` | dashboard, setRole, removeUser, removeMap, setMapEditors, setMapType |
| `convex/spriteDefinitions.ts` | list, getByName, save, remove |
| `convex/items.ts` | list, getByName, listByNames, save, remove |
| `convex/npcProfiles/mutations.ts` | save, assignInstanceName, remove, clearConversationHistory |
| `convex/npcProfiles/queries.ts` | list, getByName, getByNameInternal, listInstances |
| `convex/story/quests.ts` | list, get, create, getProgress, startQuest, advanceQuest, listActive, listAvailable, listHistory, accept, abandon, claimReward |
| `convex/mechanics/combat/logging.ts` | createEncounter, submitAction, logCombat |
| `convex/mechanics/combat/queries.ts` | getEncounter |
| `convex/mechanics/combat/playerAttack.ts` | attackNearestHostile |
| `convex/mechanics/combat/aggro.ts` | resolveAggroAttack |
| `convex/storage/storage.ts` | get, canAccess, listByOwner |
| `convex/mapObjects.ts` | listByMap, place, move, remove, toggle, bulkSave |
| `convex/worldItems.ts` | listByMap, place, remove, bulkSave, pickup, respawn |
| `convex/npc/braintrust.ts` | generateResponse |
| `convex/mechanics/inventory.ts` | getByPlayer, addItem, removeItem |
| `convex/ai.ts` | generateNpcResponse, generateStoryBranch |
| `convex/story/storyAi.ts` | generateDialogue, expandNarrative |
| `convex/profiles.ts` | list, get, create, savePosition, recordNpcChat, updateStats, addItem, removeItem, consumeConsumable, setRole, resetMap, remove |
| `convex/presence.ts` | update, listByMap, remove, cleanup |
| `convex/npcEngine.ts` | listByMap, tick, syncMap, ensureLoop, clearAll |
| `convex/migrations.ts` | backfillField, removeField, listMissing, bumpSchemaVersion, auditMapSizes, migratePlayerRefsToProfiles, cleanupLegacyPlayerRefs, backfillNpcAiDefaults |
| `convex/mechanics/economy.ts` | getWallet, addCurrency, spendCurrency, getShop, createShop |
| `convex/weather.ts` | getGlobal, ensureLoop, setGlobalConfig, setGlobalConfigAdmin, tick |
| `convex/story/lore.ts` | list, getByKey, create, discover |
| `convex/story/events.ts` | listByMap, create |
| `convex/story/dialogue.ts` | getByNpc, get, create, update |
| `convex/storage.ts` | generateUploadUrl, getUrl |
| `convex/spriteSheets.ts` | list, get, create, update, remove |
| `convex/players.ts` | getOrCreate, get, getByUser, update |
| `convex/npcs.ts` | listByMap, get, create, update |
| `convex/mechanics/loot.ts` | resolveLoot |
| `convex/chat.ts` | send, listRecent |

---

## 2. `v.any()` Locations Grouped by Risk

### High Risk (public-facing args, schema fields)

| File | Line | Field/Arg | Context |
|------|------|-----------|---------|
| `convex/schema.ts` | 224 | `logicConfig` | npcProfiles table |
| `convex/schema.ts` | 494 | `sideEffects` | npcActionLog table |
| `convex/story/quests.ts` | 28, 30 | `steps`, `rewards` | create mutation args |
| `convex/story/quests.ts` | 77 | `choice` | advanceQuest mutation args |
| `convex/mechanics/combat/logging.ts` | 10, 11, 26, 48 | `enemies`, `rewards`, `action`, `turns` | createEncounter, submitAction, logCombat args |
| `convex/npcProfiles/mutations.ts` | 51 | `logicConfig` | save mutation args |
| `convex/npc/braintrust.ts` | 10 | `conversationHistory` | generateResponse action args |
| `convex/ai.ts` | 45, 56 | `context` | generateNpcResponse, generateStoryBranch args |
| `convex/story/storyAi.ts` | 11 | `conversationHistory` | generateDialogue action args |

### Medium Risk (internal/admin, extensible payloads)

| File | Line | Field/Arg | Context |
|------|------|-----------|---------|
| `convex/admin/restore.ts` | 114 | `rows` | restoreInsertChunk mutation args |
| `convex/migrations.ts` | 22 | `defaultValue` | backfillField mutation args |
| `convex/mechanics/economy.ts` | 76 | `inventory` | getShop/createShop args |
| `convex/story/events.ts` | 19, 20 | `conditions`, `script` | create mutation args |
| `convex/story/dialogue.ts` | 25, 26, 36, 37 | `nodes`, `metadata` | create/update mutations |
| `convex/players.ts` | 64 | `stats` | update mutation args |

### Low Risk (admin-only, one-off migrations)

| File | Line | Field/Arg | Context |
|------|------|-----------|---------|
| `convex/admin/restore.ts` | 114 | `rows` | Admin restore; dynamic table shapes |

---

## 3. `as any` / `: any` Runtime Casts Grouped by Domain

### Auth / Superuser / Admin

| File | Lines | Description |
|------|-------|-------------|
| `convex/superuser.ts` | 6, 12, 33–34, 38, 47–50, 54, 114, 119, 128, 197, 201, 212, 236 | requireOwnedSuperuserProfile, dashboard, setMapEditors, setMapType |
| `convex/spriteDefinitions.ts` | 6, 13, 17, 19, 101, 109, 158, 163 | canReadDef, isSuperuserUser, list, save, remove |
| `convex/items.ts` | 48, 55, 59, 61, 161, 179, 185, 233, 238 | canReadItem, isSuperuserUser, list, save, remove |
| `convex/lib/requireSuperuser.ts` | 14 | role check |
| `convex/lib/requireMapEditor.ts` | 22, 57 | role checks |
| `convex/lib/requireAdminKey.ts` | 2 | env access |
| `convex/profiles.ts` | 47 | requireOwnedProfile |
| `convex/presence.ts` | 5 | requireOwnedProfile |

### Map / World / NPC

| File | Lines | Description |
|------|-------|-------------|
| `convex/mapObjects.ts` | 17, 27, 35, 233, 252 | listByMap, assignInstanceName |
| `convex/worldItems.ts` | 29–32, 41, 46–51 | icon sprite def enrichment |
| `convex/weather.ts` | 24, 27, 72–73, 174–175 | getGlobalRow, tick, setGlobalConfig |
| `convex/npcEngine.ts` | (via mapObjects, npcProfiles) | — |

### Story / Quests / Dialogue

| File | Lines | Description |
|------|-------|-------------|
| `convex/story/quests.ts` | 87, 89, 92 | advanceQuest handler |
| `convex/story/storyAi.ts` | 14, 17, 20, 61 | env, messages, conversationHistory |

### Migrations / Admin Restore

| File | Lines | Description |
|------|-------|-------------|
| `convex/migrations.ts` | 26, 29–30, 50, 53, 55, 76–77, 98, 101–102, 151, 198–270, 306–372 | backfillField, removeField, migratePlayerRefsToProfiles, cleanupLegacyPlayerRefs, backfillNpcAiDefaults |
| `convex/admin/restore.ts` | 103, 126 | restoreInsertChunk |

### Mechanics (Inventory, Loot, Players)

| File | Lines | Description |
|------|-------|-------------|
| `convex/mechanics/inventory.ts` | 41, 47, 84–85 | addItem, removeItem |
| `convex/mechanics/loot.ts` | 23, 57, 59 | resolveLoot |
| `convex/players.ts` | 15, 48 | identity.subject |
| `convex/spriteSheets.ts` | 41 | identity.subject |

---

## 4. `.filter()` / Unbounded `.collect()` Query Risks

### `.filter()` Usage (Should Use Indexes)

| File | Line(s) | Description |
|------|---------|-------------|
| `convex/maps/queries.ts` | 66, 116 | In-memory filter on maps after collect |
| `convex/npcProfiles/queries.ts` | 17, 57, 60, 64 | Filters by visibility, category |
| `convex/story/quests.ts` | 179, 182, 186, 197, 199 | Filters by sourceType, offeredByNpc, status |
| `convex/admin/users.ts` | 30, 120, 229, 237 | Filters by userId, name |
| `convex/superuser.ts` | 30, 128, 207 | Filters by userId, name |
| `convex/spriteDefinitions.ts` | 30 | canReadDef filter |
| `convex/items.ts` | 76 | canReadItem filter |
| `convex/story/lore.ts` | 9 | Filter by category |
| `convex/npcEngine.ts` | 34, 259, 274 | Filter respawnAt, category |
| `convex/mapObjects.ts` | 28, 35 | Filter by instanceName |
| `convex/npcProfiles/mutations.ts` | 234 | Filter mapObjects |

### Unbounded `.collect()` Risks

**High priority (large tables, user-facing):**

- `messages` – convex/admin/clear.ts, convex/admin/restore.ts
- `npcConversations` – (if present)
- `worldItems` – convex/worldItems.ts, convex/admin/restore.ts
- `presence` – convex/presence.ts, convex/admin/backfills.ts, convex/admin/clear.ts
- `playerQuests` / `questProgress` – convex/story/quests.ts

**Medium priority:**

- `maps` – convex/maps/queries.ts, convex/admin/*
- `mapObjects` – convex/mapObjects.ts, convex/npcProfiles/mutations.ts
- `npcState` – convex/npcEngine.ts
- `profiles` – convex/profiles.ts, convex/admin/*
- `itemDefs` – convex/items.ts, convex/worldItems.ts

**Admin/backfill (acceptable for one-off ops):**

- convex/admin/backfills.ts, convex/admin/restore.ts, convex/migrations.ts

---

## 5. Baseline Verification Results

### `npm run typecheck`

| Run Date | Result | Notes |
|----------|--------|-------|
| 2026-02-21 | **FAIL** | 9 errors (see below) |

**Known typecheck failures (baseline):**

| File | Line | Error |
|------|------|-------|
| `src/engine/Game/handleCombatInput.ts` | 77 | `api.mechanics/combat` not in api type |
| `src/engine/Game/handleHostileAggroTick.ts` | 26 | `api.mechanics/combat` not in api type |
| `src/engine/Game/subscribeToNpcState.ts` | 21 | `NpcStateRow` – `direction` type mismatch (string \| undefined vs string) |
| `src/ui/CharacterPanel.ts` | 533 | `api.story/quests` not in api type |
| `src/ui/HUD.ts` | 122, 275, 376, 408, 441 | `api.story/quests` not in api type |

### `npm run lint`

| Run Date | Result | Notes |
|----------|--------|-------|
| 2026-02-21 | **PASS** | 2 warnings in `convex/_generated/*.js` (unused eslint-disable) |

---

## 6. Progress Tracking

- [ ] Add `returns` validators to critical functions (Task 2)
- [ ] Replace high-risk `v.any()` in function args (Task 3)
- [ ] Tighten schema `v.any()` fields (Task 4)
- [ ] Remove unsafe `any` casts in auth/admin paths (Task 5)
- [ ] Replace `.filter()` with indexes, bound `.collect()` (Task 6)
