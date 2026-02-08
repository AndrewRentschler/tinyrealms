# Maps: End-to-End Workflow

This guide covers every step of creating a new map, editing it in the map editor, and wiring it into the broader game world with portals, music, and animated tiles.

---

## Table of Contents

1. [Overview](#overview)
2. [Preparing Assets](#preparing-assets)
3. [Creating a Map](#creating-a-map)
4. [Editing a Map](#editing-a-map)
5. [Connecting Maps with Portals](#connecting-maps-with-portals)
6. [Adding Labels & Spawn Points](#adding-labels--spawn-points)
7. [Assigning Background Music](#assigning-background-music)
8. [Animated Tiles](#animated-tiles)
9. [Static Map Seeding](#static-map-seeding)
10. [Converting Legacy Maps](#converting-legacy-maps)
11. [File Reference](#file-reference)

---

## Overview

A map in **Here** is a tile-based 2D level stored in Convex. Each map has:

- A grid of tiles across 5 layers (`bg0`, `bg1`, `obj0`, `obj1`, `overlay0`)
- A collision mask (per-tile boolean)
- Labels (named locations used as spawn points and portal targets)
- Portals (rectangular zones that teleport the player to another map)
- Optional background music, animated tiles, and placed objects (NPCs, decorations)

Maps can be created in two ways: **dynamically** through the in-game Map Browser, or **statically** by writing a JSON file that the engine auto-seeds on startup.

---

## Preparing Assets

### Tileset

Every map needs at least one tileset — a PNG image where each tile occupies a fixed-size cell in a grid.

1. **Place the PNG** in `public/assets/tilesets/`:

   ```
   public/assets/tilesets/your-tileset.png
   ```

2. **Register it in the Map Editor** — add an entry to the `TILESETS` array in `src/editor/MapEditorPanel.ts`:

   ```typescript
   {
     name: "Your Tileset",
     url: "/assets/tilesets/your-tileset.png",
     tileWidth: 16,       // pixel width of one tile
     tileHeight: 16,      // pixel height of one tile
     imageWidth: 512,     // total PNG width  (auto-detected on load, but good to set)
     imageHeight: 1024,   // total PNG height (auto-detected on load, but good to set)
   }
   ```

3. **Register it in the Map Browser** — add an entry to `TILESET_OPTIONS` in `src/ui/MapBrowser.ts`:

   ```typescript
   { label: "Your Tileset", url: "/assets/tilesets/your-tileset.png", tw: 16, th: 16 }
   ```

> **Tip:** The editor auto-detects the image's `naturalWidth`/`naturalHeight` at load time and rounds to full tile multiples. You can leave `imageWidth`/`imageHeight` approximate — the runtime will correct them.

### Background Music (optional)

Drop an MP3 or M4A file into `public/assets/audio/` and register it in both:

- `MUSIC_OPTIONS` in `src/ui/MapBrowser.ts`
- `MUSIC_OPTIONS` in `src/editor/MapEditorPanel.ts`

```typescript
{ label: "Your Track", url: "/assets/audio/your-track.mp3" }
```

---

## Creating a Map

### Via the Map Browser (in-game)

1. Open the **Map** panel from the toolbar (requires admin role).
2. Click **Create Map**.
3. Fill in:
   - **Name** — unique identifier (lowercase, hyphenated, e.g. `dark-forest`)
   - **Width / Height** — grid dimensions in tiles (10–200)
   - **Tileset** — optional; can be picked or changed later in the editor
   - **Background Music** — optional
   - **Combat Enabled** — whether PvE encounters trigger on this map
   - **Is Hub** — marks this as a default spawn map
4. Click **Create**.

The Convex mutation `maps.create` builds 5 empty layers, a collision mask, and a default `start1` spawn label at the map center.

### Via Static JSON (for hand-crafted or converted maps)

Create a JSON file at `public/assets/maps/<name>.json`:

```json
{
  "name": "dark-forest",
  "width": 40,
  "height": 30,
  "tileWidth": 16,
  "tileHeight": 16,
  "tilesetUrl": "/assets/tilesets/forest.png",
  "tilesetPxW": 384,
  "tilesetPxH": 640,
  "layers": [
    { "name": "bg0",      "data": [ /* width*height tile indices, -1 = empty */ ] },
    { "name": "bg1",      "data": [ ... ] },
    { "name": "obj0",     "data": [ ... ] },
    { "name": "obj1",     "data": [ ... ] },
    { "name": "overlay0", "data": [ ... ] }
  ],
  "collision": [ /* width*height booleans: 0 or 1 */ ],
  "labels": [
    { "name": "start1", "x": 20, "y": 15, "width": 1, "height": 1 }
  ],
  "portals": [],
  "musicUrl": "/assets/audio/forest-ambience.mp3",
  "combatEnabled": false
}
```

Layer `data` arrays are row-major: index = `y * width + x`. A value of `-1` means empty/transparent.

Then register the map for auto-seeding (see [Static Map Seeding](#static-map-seeding)).

---

## Editing a Map

### Entering Build Mode

1. Travel to the map you want to edit (via the Map panel or a portal).
2. Click the **Build** button in the toolbar (admin only).
3. The Map Editor panel opens on the right side.

### Editor Layout

- **Toolbar** — tool buttons (Paint, Erase, Collision, Object, Portal, Label), a grid toggle, a save button, and a map dimensions display.
- **Tileset Palette** — shows the currently selected tileset image. Click a single tile or click-drag a rectangular region to select multi-tile brushes.
- **Layer Picker** — dropdown to switch between the 5 layers.
- **Tileset Picker** — dropdown to switch tilesets. Changing tilesets automatically updates the map's tile dimensions to match.

### Tools

| Tool | Key Behavior |
|------|-------------|
| **Paint** | Stamps the selected tile(s) onto the active layer. Multi-tile selections paint as a group. |
| **Erase** | Sets tiles to `-1` (transparent) on the active layer. |
| **Collision** | Toggles collision on/off per tile. Collision tiles show as semi-transparent red overlays. |
| **Object** | Places sprite objects (NPCs, decorations) — see the [NPCs](NPCs.md) and [Characters](Characters.md) guides. |
| **Object Erase** | Removes placed objects. |
| **Portal** | Creates portals to other maps — see [below](#connecting-maps-with-portals). |
| **Label** | Creates named spawn points — see [below](#adding-labels--spawn-points). |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `G` | Toggle grid overlay on both the map and tileset palette |

### Multi-Tile Selection

Click and drag on the tileset palette to select a rectangular region of tiles. The selection highlight updates in real time. When you paint, the entire region stamps onto the map.

### Ghost Preview

When the Paint tool is active, hovering over the map shows a semi-transparent preview of the selected tile(s). Erase and Collision tools show a colored outline instead.

### Saving

Click the **Save** button (or it will warn before closing). This calls:

- `maps.saveFullMap` — persists all tile layers, collision, labels, and portals
- `mapObjects.bulkSave` — persists all placed objects

---

## Connecting Maps with Portals

Portals are rectangular zones on the map. When the player walks into one, they are teleported to another map.

### Creating a Portal

1. Select the **Portal** tool.
2. A form appears below the toolbar with fields:
   - **Name** — identifier (e.g. `to-dark-forest`)
   - **Target Map** — dropdown of all maps in the database
   - **Target Spawn** — label name on the target map (default: `start1`)
   - **Direction** — optional facing direction after teleport (`up`, `down`, `left`, `right`)
   - **Transition** — visual transition type (default: `fade`)
3. Click once on the map to set the portal's start corner.
4. Click again to set the end corner (creates a rectangle).
5. The portal appears as a colored overlay.

### Two-Way Portals

Portals are one-directional. To make a round trip:

1. On **Map A**, create a portal targeting **Map B** at label `from-a`.
2. On **Map B**, create a label called `from-a` at the arrival point.
3. On **Map B**, create a portal targeting **Map A** at label `from-b`.
4. On **Map A**, create a label called `from-b` at the arrival point.

### Portal Detection at Runtime

`Game.ts` → `checkPortals()` runs each frame and checks if the player's position overlaps any portal rectangle. On overlap, it triggers `changeMap()` which:

1. Plays a fade transition
2. Saves the player's current position
3. Loads the target map
4. Positions the player at the target spawn label
5. Switches music if different
6. Fades in

---

## Adding Labels & Spawn Points

Labels are named coordinates on a map. They serve as:

- **Portal targets** — where the player appears after a portal transition
- **Spawn points** — where the player starts on first visit
- **Semantic markers** — for scripting, quests, or narrative triggers

### Creating a Label

1. Select the **Label** tool.
2. Enter a **Name** (e.g. `shop-entrance`, `boss-room-start`).
3. Click on the map for a single-tile label, or click twice for a rectangular zone.

Every new map gets a `start1` label at its center by default.

---

## Assigning Background Music

### At Creation Time

Select a track from the **Background Music** dropdown in the Map Browser create form.

### After Creation

Background music is stored as `musicUrl` on the map document. To change it:

1. Currently this is set at creation time or in the static JSON.
2. The music auto-plays when a player enters the map and cross-fades when switching maps.

### Adding a New Track

1. Place the file in `public/assets/audio/`.
2. Add it to `MUSIC_OPTIONS` in both `src/ui/MapBrowser.ts` and `src/editor/MapEditorPanel.ts`.

---

## Animated Tiles

Some maps have tiles that animate (flowing water, flickering torches, etc.). This is handled by the `TileAnimator` system.

### How It Works

1. An **animation descriptor** JSON file describes which tiles animate and how.
2. A **PixiJS spritesheet** (JSON + PNG) defines the animation frames.
3. At runtime, `TileAnimator` loads the descriptor and creates `AnimatedSprite` instances at the specified tile positions.

### Setting Up Animated Tiles

#### 1. Create the Spritesheet

Place a PixiJS-compatible spritesheet in `public/assets/sprites/`:

```
public/assets/sprites/your-anim.json
public/assets/sprites/your-anim.png
```

The JSON should define frame rectangles and named animations (e.g. `"water"`, `"torch"`).

#### 2. Create the Animation Descriptor

Place a descriptor JSON in `public/assets/animations/`:

```json
{
  "spritesheet": "/assets/sprites/your-anim.json",
  "defaultSpeed": 0.05,
  "tileWidth": 16,
  "tileHeight": 16,
  "tiles": [
    { "x": 5, "y": 10, "animation": "water" },
    { "x": 5, "y": 11, "animation": "water" },
    { "x": 12, "y": 3, "animation": "torch", "speed": 0.1 }
  ]
}
```

| Field | Description |
|-------|-------------|
| `spritesheet` | URL to the PixiJS spritesheet JSON |
| `defaultSpeed` | Animation speed (0–1, where 1 = 60fps) |
| `tileWidth` / `tileHeight` | Tile size in pixels (must match the map) |
| `tiles[].x`, `tiles[].y` | Tile column and row on the map |
| `tiles[].animation` | Name of the animation sequence in the spritesheet |
| `tiles[].speed` | Optional per-tile speed override |

#### 3. Link it to the Map

Add `animationUrl` to the map's JSON:

```json
{
  "animationUrl": "/assets/animations/your-map.json"
}
```

Or set it in the Convex map document. The `TileAnimator` renders on a container with `zIndex: 5`, sitting between the background and object layers.

---

## Static Map Seeding

Static maps are JSON files that get automatically imported into Convex when the game starts.

### Steps

1. Place the map JSON in `public/assets/maps/<name>.json`.
2. Add the name to the `STATIC_MAPS` array in `src/engine/Game.ts`:

   ```typescript
   private static readonly STATIC_MAPS = ["cozy-cabin", "camineet", "mage-city", "palma", "dark-forest"];
   ```

3. On game init, `seedStaticMaps()` checks each map:
   - If missing from Convex → seeds it
   - If dimensions, tileset, or `animationUrl` changed → re-seeds it
   - If already up to date → skips it

### When to Use Static Seeding

- For carefully hand-crafted maps that ship with the game
- For maps converted from external formats via scripts
- For maps that need to be reproducibly reset

Maps created via the Map Browser are stored only in Convex and are **not** static.

---

## Converting Legacy Maps

Conversion scripts live in `scripts/` and transform external map formats into the engine's JSON schema.

| Script | Source |
|--------|--------|
| `scripts/convert-map.mjs` | Cozy Cabin from tiny-spaces |
| `scripts/convert-camineet.mjs` | PS1 Camineet |
| `scripts/convert-mage.mjs` | Mage City |
| `scripts/convert-palma.mjs` | Palma overworld (with animated tiles) |

Run with:

```bash
node scripts/convert-palma.mjs
```

These scripts handle coordinate system conversion (column-major → row-major), layer flattening, label extraction, and portal definition. Output goes to `public/assets/maps/`.

### Writing a New Converter

Key considerations:

- Layer data must be **row-major**: `index = y * width + x`
- Empty tiles should be `-1`
- Include at least one label named `start1` for the default spawn
- Copy associated assets (tileset PNG, music, sprite sheets) into the appropriate `public/assets/` subdirectories

---

## File Reference

| Purpose | Path |
|---------|------|
| Tileset images | `public/assets/tilesets/` |
| Static map JSON files | `public/assets/maps/` |
| Background music | `public/assets/audio/` |
| Animation spritesheets | `public/assets/sprites/` |
| Animation descriptors | `public/assets/animations/` |
| Map Browser UI | `src/ui/MapBrowser.ts` |
| Map Editor panel | `src/editor/MapEditorPanel.ts` |
| Map Renderer | `src/engine/MapRenderer.ts` |
| Tile Animator | `src/engine/animations/TileAnimator.ts` |
| Game engine (seeding, portals) | `src/engine/Game.ts` |
| Convex map mutations | `convex/maps.ts` |
| Convex schema | `convex/schema.ts` |
| Conversion scripts | `scripts/` |
