# Characters: End-to-End Workflow

This guide covers creating a new playable character — from preparing the spritesheet to making it selectable on the profile screen.

---

## Table of Contents

1. [Overview](#overview)
2. [Spritesheet Format](#spritesheet-format)
3. [Preparing the Assets](#preparing-the-assets)
4. [Registering in the Sprite Editor](#registering-in-the-sprite-editor)
5. [Creating a Sprite Definition](#creating-a-sprite-definition)
6. [Adding to the Profile Screen](#adding-to-the-profile-screen)
7. [How Characters Render at Runtime](#how-characters-render-at-runtime)
8. [Profile System](#profile-system)
9. [File Reference](#file-reference)

---

## Overview

A playable character in **Here** is a sprite sheet that the player selects when creating their profile. At runtime, the engine renders a `PixiJS AnimatedSprite` that walks in four directions using frame-based animation.

The pipeline is:

1. **Create** a spritesheet (PNG + JSON) with directional walk animations
2. **Place** the files in `public/assets/sprites/`
3. **Register** the sheet in the Sprite Editor so it can be previewed
4. **Create a sprite definition** (optional — mainly needed for NPC/object use)
5. **Add** the sheet to the profile screen's character picker

---

## Spritesheet Format

Each character requires **two files** in the same directory:

```
public/assets/sprites/
├── your-character.json    ← frame/animation metadata
└── your-character.png     ← spritesheet image
```

### PNG Layout

The PNG is a grid of animation frames. A typical character sheet has 4 rows (one per direction) and 3 columns (the walk cycle):

```
┌──────┬──────┬──────┐
│ Down │ Down │ Down │   row 0 — facing down
│  0   │  1   │  2   │
├──────┼──────┼──────┤
│ Left │ Left │ Left │   row 1 — facing left
│  0   │  1   │  2   │
├──────┼──────┼──────┤
│Right │Right │Right │   row 2 — facing right
│  0   │  1   │  2   │
├──────┼──────┼──────┤
│  Up  │  Up  │  Up  │   row 3 — facing up
│  0   │  1   │  2   │
└──────┴──────┴──────┘
```

Common frame sizes:

| Style | Frame Size | Notes |
|-------|-----------|-------|
| 16-bit RPG | 32 × 48 px | Taller than wide (body + head) |
| Chibi / small | 24 × 32 px | Compact style |
| Large | 48 × 64 px | Detailed characters |

### JSON Format (PixiJS / TexturePacker)

```json
{
  "frames": {
    "tile0_0": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 }
    },
    "tile0_1": {
      "frame": { "x": 32, "y": 0, "w": 32, "h": 48 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 }
    },
    "tile0_2": {
      "frame": { "x": 64, "y": 0, "w": 32, "h": 48 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 }
    }
    // ... repeat for all frames across all rows
  },
  "animations": {
    "row0": ["tile0_0", "tile0_1", "tile0_2"],
    "row1": ["tile1_0", "tile1_1", "tile1_2"],
    "row2": ["tile2_0", "tile2_1", "tile2_2"],
    "row3": ["tile3_0", "tile3_1", "tile3_2"]
  },
  "meta": {
    "image": "your-character.png",
    "format": "RGBA8888",
    "scale": "1"
  }
}
```

**Key rules:**

| Field | Requirement |
|-------|-------------|
| `meta.image` | Just the filename (e.g. `"your-character.png"`), **not** a path. Resolved relative to the JSON file. |
| `animations` | Named groups of frame keys. Character sprites use `row0`–`row3` by convention. |
| Frame naming | `tile{row}_{col}` — must be unique within the file. |
| Minimum frames | At least 2 per animation row for a visible walk cycle. 3 is standard. |

### Creating with TexturePacker

If you use [TexturePacker](https://www.codeandweb.com/texturepacker):

1. Import your individual frame images or a grid sheet.
2. Set output format to **PixiJS**.
3. Enable the **animations** feature and group frames into `row0`–`row3`.
4. Export — you get a `.json` + `.png` pair ready to drop into `public/assets/sprites/`.

### Creating Manually

If you have a plain grid PNG and no tooling, you can write the JSON by hand:

1. Measure the frame width and height in pixels.
2. Count columns and rows in the grid.
3. Build frame entries: `"tile{row}_{col}": { "frame": { "x": col*fw, "y": row*fh, "w": fw, "h": fh }, ... }`
4. Build animation entries grouping frames by row.

---

## Preparing the Assets

1. Place both files in `public/assets/sprites/`:

   ```
   public/assets/sprites/your-character.json
   public/assets/sprites/your-character.png
   ```

2. Verify the PNG renders correctly by opening it in an image viewer. Each frame should be cleanly aligned to the grid.

---

## Registering in the Sprite Editor

The Sprite Editor lets you preview animations, adjust speed, and create reusable definitions.

Open `src/sprited/SpriteEditorPanel.ts` and add to the `SPRITE_SHEETS` array:

```typescript
const SPRITE_SHEETS: SheetEntry[] = [
  // ... existing entries ...
  { name: "Your Character", jsonUrl: "/assets/sprites/your-character.json" },
];
```

Now when you open the Sprite Editor (via the **Sprites** toolbar button, admin only), your character appears in the sheet dropdown. You can:

- Browse all named animations
- Adjust playback speed
- Preview the walk cycle

---

## Creating a Sprite Definition

A sprite definition is a saved configuration (prefab) in Convex that tells the engine how to render and behave. For player characters, the definition is **optional** — the profile system references the spritesheet URL directly. But if you want to use the character as a placeable object or NPC, you need one.

In the Sprite Editor:

1. Select your sheet from the dropdown.
2. Set:
   - **Name** — unique identifier (e.g. `your-character`)
   - **Default Animation** — `row0` (facing down is the idle pose)
   - **Animation Speed** — `0.15` is a good starting point
   - **Scale** — rendering multiplier (1.0 = native size)
   - **Anchor X / Y** — `0.5` / `1.0` (center-bottom) for characters
   - **Frame Width / Height** — matches one frame in the PNG
   - **Category** — `"npc"` if it will be an NPC, or `"object"` otherwise
3. Click **Save**. The definition is stored via `spriteDefinitions.save` in Convex.

---

## Adding to the Profile Screen

To make the character selectable when players create their profile, edit `src/ui/ProfileScreen.ts`:

```typescript
const SPRITE_OPTIONS = [
  { label: "Villager 1", url: "/assets/sprites/villager2.json" },
  { label: "Villager 2", url: "/assets/sprites/villager3.json" },
  { label: "Villager 3", url: "/assets/sprites/villager4.json" },
  { label: "Villager 4", url: "/assets/sprites/villager5.json" },
  { label: "Woman",      url: "/assets/sprites/woman-med.json" },
  // Add your character:
  { label: "Your Character", url: "/assets/sprites/your-character.json" },
];
```

Players will see a clickable sprite picker on the profile creation screen. Each option shows an animated preview of the character walking.

---

## How Characters Render at Runtime

### Loading

`SpriteLoader` (`src/engine/SpriteLoader.ts`) handles loading spritesheets. It uses a custom cache-busting strategy to avoid PixiJS global texture collisions when multiple entities use different sheets.

### Entity Layer

`EntityLayer` (`src/engine/EntityLayer.ts`) manages all player and NPC sprites on the map:

1. When a player joins or changes maps, `EntityLayer` creates an `AnimatedSprite` from the player's `spriteUrl`.
2. The sprite switches between `row0`–`row3` based on the player's facing direction.
3. Animation plays while moving, pauses on idle (showing frame 0 of the current direction).

### Direction Mapping (default)

| Animation | Direction |
|-----------|-----------|
| `row0` | Down |
| `row1` | Up |
| `row2` | Right |
| `row3` | Left |

This mapping is configurable per sprite definition using the `npcDirDown`, `npcDirUp`, `npcDirLeft`, `npcDirRight` fields (useful when a spritesheet uses a non-standard row order).

---

## Profile System

Profiles store the player's identity and persistent state.

### Schema (`convex/schema.ts` — `profiles` table)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name |
| `spriteUrl` | `string` | Path to the spritesheet JSON |
| `color` | `string` | Hex color for the name tag (e.g. `"#6c5ce7"`) |
| `role` | `string?` | `"admin"` or `"player"` |
| `stats` | `object` | HP, ATK, DEF, SPD, level, XP |
| `items` | `array` | Inventory (name + quantity pairs) |
| `npcsChatted` | `string[]` | NPCs the player has spoken to |
| `mapName` | `string?` | Last map the player was on |
| `x`, `y` | `number?` | Last known position |
| `direction` | `string?` | Last facing direction |
| `createdAt` | `number` | Timestamp |

### Key Mutations (`convex/profiles.ts`)

| Mutation | Purpose |
|----------|---------|
| `create` | Create a new profile (first profile auto-gets admin role) |
| `savePosition` | Update the player's map, position, and direction |
| `updateStats` | Modify HP, ATK, DEF, etc. |
| `addItem` | Add an item to inventory |
| `recordNpcChat` | Track that the player spoke to an NPC |
| `setRole` | Change admin/player role |
| `resetMap` | Reset spawn location (useful for stuck players) |
| `remove` | Delete a profile |

---

## File Reference

| Purpose | Path |
|---------|------|
| Character spritesheets | `public/assets/sprites/` |
| Sprite Editor panel | `src/sprited/SpriteEditorPanel.ts` |
| Profile creation screen | `src/ui/ProfileScreen.ts` |
| Sprite loader | `src/engine/SpriteLoader.ts` |
| Entity rendering | `src/engine/EntityLayer.ts` |
| Convex sprite definitions | `convex/spriteDefinitions.ts` |
| Convex profiles | `convex/profiles.ts` |
| Convex schema | `convex/schema.ts` |
