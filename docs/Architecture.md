# Architecture: Convex vs Frontend

This document describes the boundary between the Convex backend and the frontend for the Tiny Realms (Here) 2D RPG, and how the codebase is organized.

---

## Convex (Server-Authoritative)

The following live **only** in Convex and are the source of truth:

| Domain | Tables / Module | Responsibility |
|--------|-----------------|----------------|
| **World state** | `maps`, `mapObjects`, `worldItems`, `presence`, `weatherGlobal` | Map data, placed objects, pickups, player positions, global weather |
| **Players** | `profiles`, `presence` | Character identity, stats, inventory, last position |
| **NPCs** | `npcProfiles`, `npcState`, `npcEngine` | NPC identity, server-authoritative movement and combat |
| **Combat** | `mechanics/combat` | Player attack, NPC aggro, damage, XP, loot drops |
| **Economy** | `wallets`, `shops`, `mechanics/economy`, `mechanics/inventory`, `mechanics/loot` | Currency, inventory, loot resolution |
| **Quests** | `questDefs`, `playerQuests`, `story/quests` | Quest templates, accept/abandon/claim, progress |
| **Story** | `story/dialogue`, `story/lore`, `story/events` | Dialogue trees, lore, map-triggered events |
| **Chat** | `messages` | Map-scoped chat |
| **Auth** | `auth`, `auth.config` | Authentication and permissions |

Convex modules are organized as follows:

- **Root / domain folders**: `admin/`, `maps/`, `mechanics/`, `story/`, `npc/`, `npcProfiles/`
- **Large domains** are split into submodules (e.g. `admin/clear`, `admin/users`, `maps/queries`, `maps/mutations`, `mechanics/combat/*`).
- **Shared utilities**: `lib/requireSuperuser`, `lib/requireMapEditor`, `lib/requireAdminKey`.

---

## Frontend (Client-Side)

The frontend is responsible for:

| Area | Location | Responsibility |
|------|----------|----------------|
| **Rendering** | `src/engine/` (MapRenderer, EntityLayer, ObjectLayer, WorldItemLayer, etc.) | PixiJS rendering, layers, animations |
| **Input** | `src/engine/`, `src/config/` | Keyboard/gamepad, cooldown gating (server still validates) |
| **Interpolation** | `src/lib/interpolation.ts` | Smooth remote player positions between server ticks |
| **Dialogue** | `src/story/DialogueRunner.ts`, `src/npc/` | Run dialogue trees; choices and outcomes sent to Convex |
| **UI** | `src/ui/` | HUD, panels, chat, map browser, character sheet |
| **Non-authoritative helpers** | `src/mechanics/` (Inventory, Economy, LootRoller) | Sorting, price preview, loot preview only |

The client **never** decides combat damage, inventory changes, or quest progress; it sends actions and subscribes to Convex for reactive updates.

---

## Data Flow

1. **Subscriptions**: The game and UI subscribe to Convex queries (`onUpdate` or reactive queries) for maps, presence, world items, NPC state, quests, chat.
2. **Mutations**: Player actions (move, attack, pickup, accept quest, etc.) call Convex mutations. The server validates and applies changes.
3. **Real-time**: Convex pushes updates to all subscribed clients, so multiplayer state stays in sync.

---

## API Access

- Use the generated `api` from `convex/_generated/api` for typed references.
- Modules with slashes use bracket notation: `api["story/quests"].listActive`, `api["mechanics/combat"].attackNearestHostile`.
- Directory modules use full paths: `api.maps.queries.list`, `api.npcProfiles.queries.getByName` (Convex does not support index.ts re-exports).

---

## MMO-Scale Notes

For many concurrent players:

- **Presence** is map-scoped; consider spatial partitioning (e.g. chunk-based queries) if a single map has hundreds of players.
- **Rate limiting** on mutations (combat, chat, presence) should be added to prevent abuse.
- **Subscription scope** should stay narrow (e.g. by map) to avoid over-fetching.
