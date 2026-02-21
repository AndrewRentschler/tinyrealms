# Objects Workflow

Current source of truth for creating and editing world objects, including
toggleables and doors.

## 1) System Overview

Objects are built from two layers:

- `spriteDefinitions` (`category: "object"`) - reusable object behavior/visual templates
- `mapObjects` - per-map placed instances (position, layer, state like `isOn`)

At runtime, `ObjectLayer` renders objects and handles interaction, audio, and
door/collision state transitions.

## 2) Create Object Sprite Definitions

Use Build mode -> object/sprite editor panel.

Definition workflow:

1. Select a sprite sheet from configured object sheets
2. Set base fields:
   - name, default animation
   - frame width/height
   - scale, animation speed, anchors
   - collidable toggle
3. Configure optional behavior:
   - toggleable objects
   - door objects
   - ambient/interact/toggle sounds
4. Save definition

Visibility model:

- `private`, `public`, `system`
- system-level edits are superuser-sensitive

## 3) Place/Edit/Remove Objects on Maps

In Build mode map editor:

1. Select Object tool
2. Pick a sprite definition
3. Click to place objects on map
4. Choose correct layer (bg/obj/overlay stack)
5. Use object-erase tool to remove
6. Save map

Placement records are stored in `mapObjects` with:

- `spriteDefName`
- `x`, `y`
- `layer`
- persisted runtime state fields like `isOn`

## 4) Toggleable Objects

Enable `toggleable` in the sprite definition to create on/off interactables
(for example lamps, switches, fire sources).

Recommended fields:

- `toggleable: true`
- `onAnimation`
- `offAnimation`
- `onSoundUrl` (loop while on)
- optional `interactSoundUrl` (one-shot on interaction)

Runtime behavior:

- Player proximity shows interaction hint
- Interaction toggles ON/OFF state
- `isOn` is persisted in `mapObjects`
- visuals and sounds update immediately on toggle

State persistence:

- Existing objects are patched on save, so `isOn` is preserved across editor saves.

## 5) Door Objects

Enable `isDoor` for door state machines with animation transitions and collision
control.

Door fields:

- `doorClosedAnimation` (required baseline)
- `doorOpeningAnimation`
- `doorOpenAnimation`
- `doorClosingAnimation`
- `doorOpenSoundUrl`
- `doorCloseSoundUrl`

Door runtime behavior:

- Transitions through closed/opening/open/closing states
- applies/removes collision overrides while opening/closing
- prevents invalid close behavior when blocked by player occupancy checks

Collision integration:

- Door collision tiles are computed from sprite bounds
- `ObjectLayer` sends changes via callback
- `MapRenderer` applies collision overrides at runtime

## 6) Storage-Enabled Objects

Objects can optionally have item storage (chests, barrels, etc.).

### Creating Storage Objects

1. In sprite definition or editor, enable "Has Storage"
2. Set capacity (number of slots)
3. Set owner type: "public" (shared) or "player" (private)
4. Place object and save

### Runtime Behavior

- Press E near storage object to open
- Storage UI shows contents and player inventory
- Click items to transfer
- Capacity enforced server-side

### Backend Tables

- `storages`: Contains slots, capacity, owner
- `mapObjects.storageId`: Links to storage

### API

- `storage.create` — Create storage instance
- `storage.get` — Fetch storage contents
- `storage.deposit` — Move item to storage
- `storage.withdraw` — Move item from storage

## 7) Permissions

Object definition permissions (`spriteDefinitions`):

- owner can edit own definitions
- superuser can edit globally
- system visibility is restricted

Map object placement permissions (`mapObjects`):

- superuser, map owner, or map editor (profile listed in map editors)
- enforced server-side on placement and bulk-save operations

## 8) Save Pipeline and State Safety

Object save uses bulk semantics:

- new objects -> insert
- known objects (`existingId`) -> patch
- removed objects -> delete

Why this matters:

- patching preserves runtime fields like `isOn`
- editor reload after save refreshes IDs for subsequent patch-based saves

Build mode safety:

- live subscription churn is guarded so unsaved drafts are less likely to be clobbered.

## 9) Common Gotchas

- Toggle and door modes should not be mixed on the same definition
- Wrong animation keys cause invisible/incorrect states
- If door closed animation is missing, door behavior fails
- If object IDs are not refreshed after first save, later saves may insert duplicates
- Layer choice affects draw order; verify overlay objects render above entities
- Private sprite definitions are only visible to owners

## 10) Debug Checklist

If object behavior is wrong:

1. Verify sprite definition fields and animation names
2. Verify object exists in `mapObjects` for current `mapName`
3. Confirm `isOn` persistence across save/reload
4. Check permission errors from map editor mutations
5. For doors, verify collision override changes are firing in runtime logs

## Key Source Files

- `src/sprited/SpriteEditorPanel.ts`
- `src/editor/MapEditorPanel.ts`
- `src/engine/ObjectLayer.ts`
- `src/engine/MapRenderer.ts`
- `src/engine/Game.ts`
- `convex/spriteDefinitions.ts`
- `convex/mapObjects.ts`
- `convex/lib/requireMapEditor.ts`

## Related Docs

- `docs/LevelCreate.md` - full map authoring workflow and save lifecycle
- `docs/NPCs.md` - NPC-specific object/profile behaviors on top of map objects
- `docs/Items.md` - world item workflows that run alongside object placement
- `docs/Combat.md` - combat interactions influenced by object collision and map flow
- `docs/AuthPermissions.md` - sprite/map edit permission and ownership rules
- `docs/Operations.md` - operational playbooks and admin tooling
