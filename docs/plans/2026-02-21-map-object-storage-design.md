# Design: Storage Component for Map Objects

## Overview

This document describes the architecture for adding a generic storage component to map objects, enabling placeable containers (chests, barrels) and future use cases like player banks and personal storage.

## Goals

- Allow map objects to optionally have item storage (chests, barrels, etc.)
- Support both public (shared) and private (player-owned) storage
- Enable future extensibility for banks, guild vaults, and player housing
- Maintain clean separation between map object placement and storage data

## Non-Goals

- Equipment storage (only item storage)
- Storage persistence across map resets (storage lives with the object)
- Complex access control (just public vs. player-owned)

## Architecture

### Approach: Storage-First Reference

Storage data lives in its own `storages` table. Map objects link to storage instances via `storageId`. This separation enables storage to exist independently of map objects (e.g., player banks).

### Database Schema

#### New Table: `storages`

```typescript
storages: defineTable({
  // Ownership model
  ownerType: v.union(v.literal("public"), v.literal("player")),
  ownerId: v.optional(v.id("profiles")),  // null if public
  
  // Capacity (per-instance, defined at creation)
  capacity: v.number(),  // max slots
  
  // Item slots (same structure as inventories.slots)
  slots: v.array(v.object({
    itemDefName: v.string(),
    quantity: v.number(),
    metadata: v.optional(v.record(v.string(), v.string())),
  })),
  
  // Metadata
  name: v.optional(v.string()),  // e.g., "Chest", "Bank Vault"
  updatedAt: v.number(),
})
.index("by_owner", ["ownerType", "ownerId"])
```

#### Updated: `mapObjects`

```typescript
mapObjects: defineTable({
  // ... existing fields ...
  storageId: v.optional(v.id("storages")),  // links to storages table
  // ... rest unchanged ...
})
.index("by_storage", ["storageId"])
```

### Backend API

#### New Module: `convex/mechanics/storage.ts`

**Queries:**

| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `get` | `storageId` | Storage + slots | Fetch storage contents |
| `canAccess` | `storageId`, `profileId` | boolean | Check if player can access |
| `listByOwner` | `ownerType`, `ownerId?` | Storage[] | List storages by owner |

**Mutations:**

| Function | Args | Description |
|----------|------|-------------|
| `create` | `ownerType`, `ownerId?`, `capacity`, `name?` | Create new storage instance |
| `deposit` | `storageId`, `profileId`, `itemDefName`, `quantity` | Move item from player inventory to storage |
| `withdraw` | `storageId`, `profileId`, `itemDefName`, `quantity` | Move item from storage to player inventory |
| `delete` | `storageId` | Delete storage (cleanup) |

#### Integration with `mapObjects`

When placing a storage-enabled object in the editor:

1. Editor marks object as having storage (UI toggle or sprite definition flag)
2. Backend `place` mutation detects this and creates `storages` row
3. `storageId` is linked to the new `mapObjects` row
4. `bulkSave` preserves `storageId` on existing objects

### Permission Model

**Access Rules:**

1. **Public storages** (`ownerType: "public"`): Any authenticated player can deposit/withdraw
2. **Player storages** (`ownerType: "player"`, `ownerId` set): Only that player can access
3. **Map editors**: Can create/delete storage-linked objects on maps they can edit
4. **Superusers**: Full access to all storages

**Edge Cases:**

- Guest mode (no auth): Cannot access any storage
- Withdraw more than exists: Validation error, transaction blocked
- Storage at capacity: Cannot deposit, error returned
- Orphaned storage (object deleted): Storage row preserved for banks; deleted for regular containers

### Frontend Integration

#### ObjectLayer Changes

- Detect `storageId` on map objects during render
- Show interaction hint ("Open Chest") when player within range
- Press `E` to open storage UI

#### New UI: StoragePanel

- Grid display of storage slots (similar to inventory UI)
- Transfer controls between player inventory and storage
- Capacity indicator ("8/20 slots used")
- Close button (or auto-close on move away)

#### Visual Indicators

- Storage-enabled objects show subtle visual cue (small icon overlay or highlight)
- Different indicator for public vs. private storage (optional)

### Lifecycle

```
Creation:
  Editor places object + enables storage
    → Backend creates storages row
    → Links via storageId in mapObjects

Access:
  Player presses E near storage object
    → Frontend calls canAccess
    → If yes, opens StoragePanel
    → Panel queries get(storageId)

Transfer:
  Player deposits item
    → storage.deposit() mutation
    → Validates access, capacity, inventory has item
    → Updates both inventories.slots and storages.slots

Deletion:
  Editor removes object
    → If regular container: delete storage row
    → If bank/persistent: preserve storage row
```

### Future Extensibility

This architecture enables:

- **Banks**: Create `storages` row per-player without `mapObjects` link
- **Guild Vaults**: Add `ownerType: "guild"` with `guildId` field
- **Player Housing**: Storage linked to house object, persists when player offline
- **Quest Storage**: Temporary storage for quest-specific items
- **Shops**: NPC storage with special transfer rules (sell/buy)

### Key Source Files

- Backend: `convex/mechanics/storage.ts` (new)
- Schema: `convex/schema.ts` (storages table, mapObjects.storageId)
- Backend: `convex/mapObjects.ts` (integration in place/bulkSave)
- Frontend: `src/engine/ObjectLayer.ts` (detection, interaction hint)
- Frontend: `src/ui/StoragePanel.ts` (new)
- Frontend: `src/engine/Game.ts` (E key handling for storage)

## Related Docs

- `docs/Objects.md` — Object definition and placement workflow
- `docs/Items.md` — Item definitions and inventory structure
- `docs/LevelCreate.md` — Map editor save pipeline
- `docs/AuthPermissions.md` — Permission and ownership patterns

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Separate `storages` table | Enables storage without map objects (banks), cleaner queries |
| Per-instance capacity | Allows different chest sizes, player housing upgrades |
| `ownerType` + `ownerId` pattern | Matches existing visibility patterns, extensible for guilds |
| Same slot structure as `inventories` | Consistency, shared UI components possible |
| Storage creation in `mapObjects.place` | Transparent to editor, automatic linking |

---

**Status:** Design approved, ready for implementation planning
