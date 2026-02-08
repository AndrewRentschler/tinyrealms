# Items: End-to-End Workflow

This guide covers the item system — creating item definitions, editing their properties, and the roadmap for integrating items into gameplay (player inventories, NPC shops, loot drops, crafting, etc.).

---

## Table of Contents

1. [Overview](#overview)
2. [Item Architecture](#item-architecture)
3. [Creating Items (Item Editor)](#creating-items-item-editor)
4. [Item Types](#item-types)
5. [Rarity System](#rarity-system)
6. [Stats & Effects](#stats--effects)
7. [Tags & Properties](#tags--properties)
8. [Schema Reference](#schema-reference)
9. [Convex API](#convex-api)
10. [Roadmap: How Items Will Evolve](#roadmap-how-items-will-evolve)
11. [File Reference](#file-reference)

---

## Overview

Items in **Here** are defined as templates in the `itemDefs` table. Each definition describes what an item *is* — its name, description, type, rarity, stats, effects, and properties. Item definitions are created and edited through the **Item Editor** (admin toolbar → **Items**).

Currently, the system focuses on **item creation and editing** — defining the game's item catalog. The broader item lifecycle (finding, equipping, trading, dropping) is outlined in the [Roadmap](#roadmap-how-items-will-evolve) section.

### What Exists Today

- **Item definitions** — rich templates with types, rarities, stats, effects, tags, lore
- **Item Editor UI** — full CRUD panel for creating and editing items
- **Player inventory** — basic `{ name, quantity }` arrays on profiles
- **NPC inventory** — basic `{ name, quantity }` arrays on NPC profiles
- **Convex storage** — all data persisted in `itemDefs` table

### What's Coming

- Linking inventory items to item definitions (by name)
- Equipment slots and stat bonuses
- Loot tables and drop mechanics
- NPC shops and trading
- Crafting recipes
- Item icons in the game world
- Unique/one-of-a-kind enforcement

---

## Item Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Item Editor  │────→│  itemDefs table  │←────│  Player/NPC      │
│  (admin UI)   │     │  (Convex)        │     │  inventories     │
└──────────────┘     └──────────────────┘     └──────────────────┘
                            │
                            │  name (slug)
                            │
                     ┌──────┴──────┐
                     │  Referenced  │
                     │  by name in  │
                     │  profiles,   │
                     │  npcProfiles │
                     │  items[]     │
                     └─────────────┘
```

**Item definitions are templates**, not instances. When a player has "3 health potions", their profile stores `{ name: "health-potion", quantity: 3 }`, and the full definition (description, stats, effects, rarity) is looked up from `itemDefs` by name.

---

## Creating Items (Item Editor)

### Opening the Editor

1. Log in as an admin.
2. Click the **Items** button (⚔️) in the mode toggle toolbar.
3. The Item Editor opens with a sidebar list and a main editing area.

### Creating a New Item

1. Click **+ New** in the sidebar.
2. Fill out the form:
   - **Name** (slug): unique identifier, lowercase with hyphens (e.g. `iron-sword`)
   - **Display Name**: what players see (e.g. "Iron Sword")
   - **Description**: short tooltip text
   - **Type**: weapon, armor, consumable, etc.
   - **Rarity**: common through unique
3. Configure stats, effects, and properties.
4. Click **Save**.

### Editing an Existing Item

1. Click any item in the sidebar list.
2. Modify fields as needed.
3. Click **Save** to persist changes.

### Deleting an Item

1. Select the item.
2. Click **Delete** in the header.

### Searching

Use the search bar to filter items by name, display name, type, or rarity.

---

## Item Types

| Type | Icon | Description | Examples |
|------|------|-------------|----------|
| **weapon** | ⚔️ | Offensive equipment | Swords, bows, staves, daggers |
| **armor** | 🛡️ | Defensive equipment | Helmets, chest plates, shields |
| **accessory** | 💍 | Stat-boosting wearables | Rings, amulets, cloaks |
| **consumable** | 🧪 | Single-use items | Health potions, buff scrolls, food |
| **material** | 🧱 | Crafting ingredients | Iron ore, herbs, monster drops |
| **key** | 🔑 | Progression unlocks | Door keys, quest tokens |
| **currency** | 💰 | Tradeable value stores | Gold coins, gems, rare tokens |
| **quest** | 📜 | Quest-related items | Letters, artifacts, evidence |
| **misc** | 📦 | Everything else | Junk, collectibles, flavor items |

---

## Rarity System

Rarity indicates how rare and powerful an item is. Each rarity has a distinct color for visual identification:

| Rarity | Color | Dot | Description |
|--------|-------|-----|-------------|
| **Common** | Gray `#b0b0b0` | ⚪ | Basic items, widely available |
| **Uncommon** | Green `#1eff00` | 🟢 | Slightly better than common |
| **Rare** | Blue `#0070dd` | 🔵 | Notable items, harder to find |
| **Epic** | Purple `#a335ee` | 🟣 | Powerful items, limited availability |
| **Legendary** | Orange `#ff8000` | 🟠 | Extremely powerful, very rare |
| **Unique** | Gold `#e6cc80` | ⭐ | One-of-a-kind, cannot be duplicated |

### Unique Items

Items marked as `isUnique: true` are intended to be one-of-a-kind in the game world. Currently this is a flag for design intent — enforcement (preventing duplication) will be implemented when the inventory system matures.

Examples: "The Crown of the Forgotten King", "Excalibur", "The Merchant's Last Ledger"

---

## Stats & Effects

### Stat Bonuses

Items can provide flat stat bonuses when equipped:

| Stat | Description |
|------|-------------|
| **ATK** | Attack power bonus |
| **DEF** | Defense bonus |
| **SPD** | Speed bonus |
| **HP** | Flat HP restoration/bonus |
| **Max HP** | Maximum HP increase |

These are stored in `stats: { atk?, def?, spd?, hp?, maxHp? }`. Only non-zero values need to be set.

### Effects

Effects are special properties beyond raw stats — they define *what happens* when an item is used or equipped:

```typescript
effects: [
  { type: "heal", value: 50, description: "Restores 50 HP" },
  { type: "buff", value: 10, duration: 60, description: "+10 ATK for 60 seconds" },
  { type: "poison", value: 5, duration: 30, description: "Poisons target for 5 dmg/sec" },
  { type: "teleport", description: "Returns you to the hub map" },
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Effect category (e.g. "heal", "buff", "poison", "teleport") |
| `value` | No | Numeric magnitude |
| `duration` | No | Duration in seconds (for timed effects) |
| `description` | No | Human-readable description |

Effect types are freeform strings — define whatever makes sense for your game. Common types:

- `heal` — restore HP
- `buff` / `debuff` — temporary stat changes
- `poison` / `burn` / `freeze` — damage over time
- `teleport` — move the player
- `summon` — spawn an entity
- `unlock` — open a door/chest
- `xp-boost` — increase XP gain

---

## Tags & Properties

### Tags

Tags are freeform strings for categorizing and filtering items:

```typescript
tags: ["fire", "cursed", "two-handed", "quest-reward", "crafting-material"]
```

Useful for:
- Filtering in UI ("show all fire items")
- Game logic ("immune to cursed items")
- NPC shop filtering ("sells only crafting-material items")
- Loot table rules ("drop items tagged forest-loot")

### Equipment Slots

Items with an `equipSlot` can be worn/wielded by the player:

| Slot | Description |
|------|-------------|
| `weapon` | Main hand weapon |
| `head` | Helmet, hat, crown |
| `body` | Chest armor, robe |
| `legs` | Leg armor, pants |
| `feet` | Boots, shoes |
| `accessory` | Ring, amulet, cloak |

### Other Properties

| Property | Type | Description |
|----------|------|-------------|
| `stackable` | boolean | Can multiple copies stack in one slot? |
| `maxStack` | number | Maximum per stack (default 99) |
| `value` | number | Base currency value (for shops, selling) |
| `levelRequirement` | number | Minimum player level to use/equip |
| `lore` | string | Extended lore text (longer than description) |
| `iconUrl` | string | Path to icon image (e.g. `/assets/icons/iron-sword.png`) |

---

## Schema Reference

### `itemDefs` table (`convex/schema.ts`)

```typescript
itemDefs: defineTable({
  name: string,                  // unique slug
  displayName: string,           // pretty display name
  description: string,           // tooltip text
  type: "weapon" | "armor" | "accessory" | "consumable" |
        "material" | "key" | "currency" | "quest" | "misc",
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "unique",
  iconUrl?: string,
  iconSpriteSheetId?: Id<"spriteSheets">,
  stats?: {
    atk?: number,
    def?: number,
    spd?: number,
    hp?: number,
    maxHp?: number,
  },
  effects?: [{
    type: string,
    value?: number,
    duration?: number,
    description?: string,
  }],
  equipSlot?: string,
  levelRequirement?: number,
  stackable: boolean,
  maxStack?: number,
  value: number,
  isUnique?: boolean,
  tags?: string[],
  lore?: string,
  createdBy?: Id<"profiles">,
  updatedAt: number,
}).index("by_name", ["name"])
```

### Inventory References (on profiles and npcProfiles)

Both player profiles and NPC profiles store items as simple `{ name, quantity }` arrays:

```typescript
// profiles.items / npcProfiles.items
items: [
  { name: "health-potion", quantity: 5 },
  { name: "iron-sword", quantity: 1 },
]
```

The `name` field references `itemDefs.name`. To get the full item details, look up the definition by name.

---

## Convex API

### `convex/items.ts`

| Function | Type | Args | Description |
|----------|------|------|-------------|
| `list` | query | — | List all item definitions |
| `getByName` | query | `{ name }` | Get a single item by slug |
| `save` | mutation | `{ profileId, name, displayName, ... }` | Upsert an item definition (admin only) |
| `remove` | mutation | `{ profileId, id }` | Delete an item definition (admin only) |

### Example: Creating an Item Programmatically

```typescript
import { api } from "../convex/_generated/api";

await convex.mutation(api.items.save, {
  profileId: adminProfile._id,
  name: "fire-staff",
  displayName: "Staff of Ember",
  description: "A gnarled staff that crackles with flame.",
  type: "weapon",
  rarity: "rare",
  stats: { atk: 15, spd: -2 },
  effects: [
    { type: "burn", value: 3, duration: 10, description: "Burns target for 3 dmg/sec" },
  ],
  equipSlot: "weapon",
  levelRequirement: 5,
  stackable: false,
  value: 250,
  tags: ["fire", "magic", "two-handed"],
  lore: "Forged in the volcanic depths beneath Mount Cerith, this staff holds a fragment of the eternal flame.",
});
```

---

## Roadmap: How Items Will Evolve

The item system is designed to grow incrementally. Here's the planned evolution:

### Phase 1: Catalog (Current)
- [x] Item definitions with rich metadata
- [x] Item Editor UI for CRUD
- [x] Basic inventory arrays on profiles and NPC profiles
- [x] Item types, rarities, stats, effects, tags

### Phase 2: Linked Inventories
- [ ] Link player `items[].name` to `itemDefs` for full lookups
- [ ] Show item details (icon, rarity color, stats) in the Character Panel
- [ ] Validate item names against `itemDefs` when adding to inventories
- [ ] Item icon rendering in the UI (from `iconUrl`)

### Phase 3: Equipment & Stat Bonuses
- [ ] Equipment slot system on player profiles (weapon, head, body, legs, feet, accessory)
- [ ] Equip/unequip actions that modify effective stats
- [ ] Level requirement enforcement
- [ ] Equipment display in Character Panel (paper doll or slot grid)

### Phase 4: World Items
- [ ] Drop items on the map (visible sprite in the game world)
- [ ] Pick up items by walking over them or pressing E
- [ ] Item sprites in the object layer
- [ ] Despawn timers for dropped items

### Phase 5: NPC Shops & Trading
- [ ] Shop UI triggered by talking to shopkeeper NPCs
- [ ] Buy/sell mechanics using currency items
- [ ] NPC inventory as shop stock (depletes on purchase)
- [ ] Price modifiers based on NPC relationships/faction

### Phase 6: Loot Tables & Drops
- [ ] Define loot tables (weighted item pools)
- [ ] Loot drops from combat encounters
- [ ] Chest/container objects that hold loot
- [ ] Boss-specific unique drop guarantees

### Phase 7: Crafting
- [ ] Crafting recipes (material items → result item)
- [ ] Crafting stations (special map objects)
- [ ] Recipe discovery (learn by finding scrolls or talking to NPCs)
- [ ] Material gathering from the world

### Phase 8: Item Effects at Runtime
- [ ] Consumable use (heal, buff, teleport)
- [ ] Equipment passive effects
- [ ] Buff/debuff system with duration tracking
- [ ] Visual effects for active item abilities

### Phase 9: Unique Item Enforcement
- [ ] Track which unique items exist in the game world
- [ ] Prevent duplication of unique items
- [ ] Unique item provenance (who found it, when, where)
- [ ] Transfer/trade tracking for unique items

### Phase 10: Advanced Features
- [ ] Item enchanting / upgrading
- [ ] Durability and repair
- [ ] Set bonuses (wearing multiple items from a set)
- [ ] Soulbound items (cannot be traded)
- [ ] Item level scaling

---

## File Reference

| Purpose | Path |
|---------|------|
| Item Editor panel | `src/ui/ItemEditorPanel.ts` |
| Item Editor CSS | `src/ui/ItemEditor.css` |
| Item CRUD functions | `convex/items.ts` |
| Item schema | `convex/schema.ts` (itemDefs table) |
| Player inventory | `convex/schema.ts` (profiles.items) |
| NPC inventory | `convex/schema.ts` (npcProfiles.items) |
| Character Panel (shows items) | `src/ui/CharacterPanel.ts` |
| NPC Editor (NPC items) | `src/ui/NpcEditorPanel.ts` |
| Mode toggle | `src/ui/ModeToggle.ts` |
| Game shell | `src/ui/GameShell.ts` |
| Engine types | `src/engine/types.ts` |
