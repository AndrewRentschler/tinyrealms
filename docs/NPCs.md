# NPC Design Workflow

This is the current source of truth for designing, placing, and running NPCs.
It covers sprite authoring, instance/profile linking, AI/procedural dialogue modes,
hostile/combat behavior, sounds, permissions, and debugging.

## Quick Mental Model

An NPC is composed from four layers:

1. `spriteDefinitions` (`category: "npc"`) - visuals + movement/sound defaults
2. `mapObjects` - placement on a specific map, including `instanceName`
3. `npcProfiles` - identity, narrative, AI policy, combat-related traits
4. `npcState` - server-authoritative runtime position/combat state

Most behavior problems come from link mismatch between `mapObjects.instanceName`
and `npcProfiles.name`.

## 1) Asset Pipeline (PNG -> Character Sheet)

Use the in-project sprite tool:

- `/sprited.html` (local dev URL)

Workflow:

1. Import source PNG(s)
2. Define frame size and animation rows
3. Export Pixi-compatible `.png` + `.json`
4. Place files under `public/assets/characters/`
5. Register new sheet in `src/config/spritesheet-config.ts` under `NPC_SPRITE_SHEETS`

Default directional row convention:

- `row0` down
- `row1` up
- `row2` right
- `row3` left

If your sheet differs, set custom row mapping in NPC sprite settings.

## 2) Create NPC Sprite Definitions

In Build mode:

- NPCs panel -> **NPC Sprites**

Create an NPC sprite definition with:

- name (unique)
- sprite sheet URL
- frame width/height
- default animation
- scale + animation speed

NPC-specific behavior fields:

- `npcSpeed` (default about 30 px/s)
- `npcWanderRadius` (default about 60 px)
- `npcDirDown`, `npcDirUp`, `npcDirLeft`, `npcDirRight`
- `npcGreeting`

Sound fields:

- `interactSoundUrl` (one-shot on E interaction)
- `ambientSoundUrl` (loop)
- `ambientSoundRadius`
- `ambientSoundVolume`

Visibility/ownership:

- `visibilityType`: `private` | `public` | `system`
- system entries are superuser-only

## 3) Place NPCs on the Map

In Build mode map editor:

1. Select NPC placement tool
2. Choose NPC sprite definition
3. Click to place
4. Save map

This creates or updates `mapObjects` rows for placed NPC objects.

## 4) Assign Stable Instance Identity

In NPCs panel:

- **NPC Instances** tab

For each placed NPC, set/confirm `instanceName` (slug style, e.g. `dog-barn-1`).

Important:

- `instanceName` is the bridge to profile and AI behavior.
- Assignment is slugified and made unique server-side.
- If blank/conflicting, system can auto-suffix (`-2`, `-3`, ...).

Without stable instance naming, the NPC falls back to generic/procedural behavior.

## 5) Build NPC Profiles (Mind/Behavior Layer)

Profile editing is done from **NPC Instances**.

Common sections:

- identity: display name, title, faction, tags
- narrative: backstory, personality, dialogue style
- knowledge/secrets
- stats: hp/maxHp/atk/def/spd/level
- inventory
- relationships
- visibility (`private`/`public`/`system`)

AI-related fields:

- `npcType` (`procedural` or `ai`)
- `aiEnabled`
- `aiPolicy.capabilities.*` including `canChat`
- `braintrustSlug` ( AI currently uses OpenAI gpt-5-mini and gpt-5-nano via Vercel AI SDK package)

## 6) Dialogue Modes and E Interaction

Interaction mode is resolved at runtime:

- no linked profile / procedural config -> procedural dialogue
- `npcType=ai` + `aiEnabled=true` + chat capability -> AI chat splash
- chat disabled (`canChat === false`) -> dialogue disabled

Current interaction UX behavior:

- Press `E` near non-hostile NPC:
  - if chat-enabled: opens dialogue/chat
  - if chat-disabled: still interacts (faces player + plays interact sound)
- Hostile + combat-enabled map:
  - hint becomes attack flow, not E-chat flow

This allows "bark on interact" style NPCs even with chat disabled.

## 7) Sounds (Ambient + Interact/Greeting)

Ambient sound:

- loops while NPC exists
- volume scales by distance using radius and base volume
- stops when NPC removed/destroyed

Interact/greeting sound:

- `interactSoundUrl` plays on E interaction
- plays even when chat is disabled

Sound files should be registered in `src/config/audio-config.ts`.

## 8) Hostile/Combat NPC Design

To make an NPC hostile:

- add hostile-related tags (for example `hostile`)
- configure aggression/profile combat fields as needed
- ensure the map has combat enabled

Behavior:

- hostile NPCs on combat-enabled maps route to attack interaction hints
- combat uses server-authoritative `npcState` fields and tick loop
- client displays hit effects from server results

If combat is off on the map, hostile tag alone does not produce attack interaction.

## 9) Permissions and Edit Access

Sprite definitions and NPC profiles are permissioned by ownership + visibility:

- owner can edit own private/public records
- superuser can edit broadly
- system visibility is restricted

Instance assignment and map-linked operations also require map edit ownership
or superuser access.

## 10) Save + Runtime Sync (How Changes Go Live)

Sprite/profile edits:

- save directly to Convex tables
- take effect immediately or on next interaction/load depending field

Map placement edits:

1. save map/object data
2. backend sync updates `npcState` rows for map objects
3. runtime subscriptions refresh client NPC entities
4. server tick loop drives authoritative movement/combat

If an NPC does not appear or behaves incorrectly, verify both `mapObjects`
and `npcState` rows exist and are linked by object/instance identity.

## 11) Troubleshooting Checklist

### E opens wrong mode or no AI

- verify `mapObjects.instanceName` matches `npcProfiles.name`
- verify `npcType`, `aiEnabled`, and `canChat`
- verify `OPENAI_API_KEY` is set in Convex dashboard environment variables

### E should only bark (no chat)

- set chat capability off (`canChat=false`)
- keep `interactSoundUrl` set in sprite definition
- verify NPC is not routed to hostile attack mode on this map

### NPC missing from map

- confirm sprite definition category is NPC
- confirm map save completed
- confirm `npcEngine` sync/tick is running
- inspect `mapObjects` + `npcState` in Convex dashboard

### Sound not audible

- verify file exists and URL is correct
- verify sound is in sound config list
- for ambient, increase radius/volume and test close distance

## 12) Recommended Production Sequence

1. Build/export sprite sheet assets
2. Register sheet in `NPC_SPRITE_SHEETS`
3. Create NPC sprite definition
4. Place NPC in map and save
5. Assign/confirm stable `instanceName`
6. Fill profile (identity + narrative + stats + tags)
7. Configure AI policy/capabilities (or disable chat for bark-only)
8. Set interact + ambient sounds
9. Validate in editor (test actions) and in game (`E`, combat, movement)

## Key Source Files

- `src/ui/NpcEditorPanel.ts`
- `src/engine/EntityLayer.ts`
- `src/engine/NPC.ts`
- `src/npc/dialogue/NpcDialogueController.ts`
- `src/splash/screens/AiChatSplash.ts`
- `convex/npcProfiles.ts`
- `convex/npcEngine.ts`
- `convex/npc/braintrust.ts` – AI dialogue via Vercel AI SDK + OpenAI (gpt-5-mini / gpt-5-nano)
- `convex/npc/memory.ts` – conversation history for NPCs
- `convex/mapObjects.ts`
- `convex/schema.ts`

## Related Docs

- `docs/LevelCreate.md` - map and build workflow that NPC placement depends on
- `docs/Objects.md` - shared object definition and map-object save behavior
- `docs/Items.md` - item/inventory workflows used by NPC inventories and quests
- `docs/Combat.md` - hostile combat, aggro, and NPC defeat/respawn behavior
- `docs/AuthPermissions.md` - profile visibility, ownership, and edit permissions
- `docs/Operations.md` - admin scripts, backfills, and production operations
