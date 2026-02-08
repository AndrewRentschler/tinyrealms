# Operations Overview

This document covers day-to-day operations for the **Here** multiplayer 2D RPG: adding assets, editing NPC dialogue, and managing game state through Convex admin commands.

---

## Table of Contents

1. [Adding New Tilesets](#adding-new-tilesets)
2. [Adding New Sprite Sheets](#adding-new-sprite-sheets)
3. [Adding New Sound Files](#adding-new-sound-files)
4. [NPC Dialogue & Conversation Scripts](#npc-dialogue--conversation-scripts)
5. [Convex Admin Commands](#convex-admin-commands)
6. [Permission System](#permission-system)

---

## Adding New Tilesets

Tilesets are static PNG images where each tile occupies a fixed-size cell in a grid.

### 1. Place the image

Drop the PNG into `public/assets/tilesets/`:

```
public/assets/tilesets/
├── fantasy-exterior.png
├── fantasy-interior.png
├── forest.png
├── gentle.png
├── gentle-obj.png
├── mage-obj.png
├── magecity.png
├── overworld_palma.png
└── your-new-tileset.png      <-- add here
```

### 2. Register it in the Map Editor

Open `src/editor/MapEditorPanel.ts` and add an entry to the `TILESETS` array near the top of the file:

```typescript
const TILESETS: TilesetInfo[] = [
  // ... existing entries ...
  {
    name: "Your New Tileset",
    url: "/assets/tilesets/your-new-tileset.png",
    tileWidth: 16,          // width of one tile in pixels
    tileHeight: 16,         // height of one tile in pixels
    imageWidth: 512,        // total image width in pixels
    imageHeight: 1024,      // total image height in pixels
  },
];
```

**Important fields:**

| Field | Description |
|-------|-------------|
| `name` | Display name shown in the editor dropdown |
| `url` | Path relative to `public/` (served at root) |
| `tileWidth` / `tileHeight` | Size of a single tile cell in pixels |
| `imageWidth` / `imageHeight` | Total dimensions of the PNG |

The editor calculates columns and rows automatically from these values. After adding the entry, the tileset will appear in the Build mode tileset dropdown.

---

## Adding New Sprite Sheets

Sprite sheets are used for animated characters, NPCs, objects (fires, fountains, etc.), and any entity that needs frame-based animation.

### File format

Each sprite requires **two files** placed side by side in `public/assets/sprites/`:

```
public/assets/sprites/
├── chicken.json          <-- metadata
├── chicken.png           <-- spritesheet image
├── cozy-fire.json
├── cozy-fire.png
└── ...
```

### JSON format (PixiJS / TexturePacker compatible)

The JSON file follows the standard PixiJS spritesheet format:

```json
{
  "frames": {
    "tile0_0": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    },
    "tile0_1": {
      "frame": { "x": 32, "y": 0, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    }
    // ... more frames
  },
  "animations": {
    "row0": ["tile0_0", "tile0_1", "tile0_2"],
    "row1": ["tile1_0", "tile1_1", "tile1_2"],
    "row2": ["tile2_0", "tile2_1", "tile2_2"],
    "row3": ["tile3_0", "tile3_1", "tile3_2"]
  },
  "meta": {
    "image": "chicken.png",
    "format": "RGBA8888",
    "scale": "1"
  }
}
```

**Key points:**

- `meta.image` must be just the filename (e.g. `"chicken.png"`), **not** a relative path like `"./chicken.png"`. The engine resolves it relative to the JSON file's directory.
- `animations` groups frame names into named animation sequences. For character sprites, by convention `row0`-`row3` map to directional movement (the mapping is configurable per sprite definition).
- Frame names must be unique **within** a single JSON file (but can reuse names across different files — the engine uses a custom loader that avoids PixiJS global cache collisions).

### Register it in the Sprite Editor

Open `src/sprited/SpriteEditorPanel.ts` and add an entry to the `SPRITE_SHEETS` array:

```typescript
const SPRITE_SHEETS: SheetEntry[] = [
  // ... existing entries ...
  { name: "Your Sprite", jsonUrl: "/assets/sprites/your-sprite.json" },
];
```

The sprite will then appear in the Sprite Editor's sheet dropdown. From there you can preview animations, configure properties, and save a **sprite definition** (prefab) to Convex for use in the map editor.

### Character sprites for profiles

Player-selectable character sprites are listed separately in `src/ui/ProfileScreen.ts`:

```typescript
const SPRITE_OPTIONS = [
  { label: "Villager 1", url: "/assets/sprites/villager2.json" },
  // ... add new character options here
];
```

---

## Adding New Sound Files

Sound files are used for background music, ambient loops (fire crackling, rain), and one-shot effects (door opening, NPC greetings).

### 1. Place the file

Drop MP3 or M4A files into `public/assets/audio/`:

```
public/assets/audio/
├── battle.mp3
├── camp-fire.mp3
├── chicken.mp3
├── cozy.m4a             <-- background music
├── fire-crackling-short.mp3
├── ps1-town.mp3
├── rain.mp3
└── your-new-sound.mp3   <-- add here
```

### 2. Register it in the Sprite Editor

Open `src/sprited/SpriteEditorPanel.ts` and add an entry to the `SOUND_FILES` array:

```typescript
const SOUND_FILES: { label: string; url: string }[] = [
  { label: "(none)", url: "" },
  // ... existing entries ...
  { label: "Your New Sound", url: "/assets/audio/your-new-sound.mp3" },
];
```

This makes the sound available in the Sprite Editor for assignment as:

- **Ambient sound** — loops continuously with distance-based volume falloff (e.g. fireplace crackling)
- **Interact sound** — plays once when a player interacts (e.g. chicken cluck on chat)

### Background music

Background music is loaded directly in the game engine (`src/engine/Game.ts`). To change or add background tracks, modify the `loadDefaultMap()` method where `this.audio.playMusic(...)` is called.

---

## NPC Dialogue & Conversation Scripts

NPCs have a dialogue system with two tiers: **hardcoded dialogue trees** for immediate use, and an optional **LLM-powered expansion** system for richer narrative.

### How dialogue works at runtime

1. Player walks near an NPC and presses **E**
2. The NPC's `dialogue` array (a list of `DialogueLine` nodes) is converted to the story system's `DialogueNode` format
3. A `DialogueSplash` overlay renders the conversation with response choices
4. Pressing **Escape** exits the dialogue at any time

### Dialogue structure

Each NPC carries an array of `DialogueLine` objects:

```typescript
interface DialogueLine {
  id: string;                                    // unique node identifier
  text: string;                                  // what the NPC says
  responses?: { text: string; nextId: string }[]; // player choices
  nextId?: string;                               // auto-advance (no choices)
}
```

Example dialogue tree:

```typescript
dialogue: [
  {
    id: "greet",
    text: "Welcome, traveler! What brings you to the cabin?",
    responses: [
      { text: "Just exploring.", nextId: "explore" },
      { text: "I heard there's treasure nearby.", nextId: "treasure" },
      { text: "Goodbye.", nextId: "bye" },
    ],
  },
  {
    id: "explore",
    text: "Take your time! The forest has many secrets.",
    responses: [
      { text: "Any tips?", nextId: "tips" },
      { text: "Thanks!", nextId: "bye" },
    ],
  },
  {
    id: "treasure",
    text: "Treasure? I wouldn't know about that... *nervous laugh*",
    nextId: "bye",     // auto-advance, no player choice
  },
  {
    id: "tips",
    text: "Watch out for the mushrooms. Not all of them are friendly.",
    nextId: "bye",
  },
  {
    id: "bye",
    text: "Safe travels, friend!",
    // No responses or nextId = conversation ends
  },
]
```

### Where to edit dialogue

**For NPCs placed via the map editor:**

Default dialogue is generated in `src/editor/MapEditorPanel.ts` in the `spawnNpcFromDef()` method (around line 593). The greeting text comes from the sprite definition's `npcGreeting` field (editable in the Sprite Editor). To customize the full dialogue tree, edit the `dialogue` array in that method.

**For hardcoded NPCs:**

NPCs added directly in game code (e.g. in `src/engine/Game.ts`) have their dialogue passed in the `NPCConfig` object. Edit the `dialogue` array in the config.

**For richer, stored dialogue (future):**

The story system supports Convex-stored dialogue trees via `convex/story/dialogue.ts`:

- `dialogue.create` — store a new dialogue tree for an NPC
- `dialogue.getByNpc` — fetch a dialogue tree by NPC ID
- `dialogue.update` — modify an existing tree

The `DialogueRunner` class (`src/story/DialogueRunner.ts`) can run these stored trees through the splash screen system.

### Story system types

The full type definitions for the narrative system are in `src/story/StoryTypes.ts`:

| Type | Purpose |
|------|---------|
| `DialogueNode` | A single dialogue screen (text + responses + effects) |
| `DialogueTreeDef` | A complete conversation tree |
| `QuestDef` | Multi-step quest with conditions and rewards |
| `StoryEventDef` | Triggered events (enter zone, interact, combat end) |
| `LoreDef` | Discoverable lore entries |

### LLM-powered dialogue expansion

The `convex/story/storyAi.ts` module provides two actions that call GPT-4o via the Braintrust AI Proxy:

| Action | Purpose |
|--------|---------|
| `generateDialogue` | Generate dialogue from a system prompt + conversation context |
| `expandNarrative` | Expand outlines into quests, dialogue trees, lore, or backstories |

**Requirements:** Set `BRAINTRUST_API_KEY` in your Convex environment variables.

**Example usage from a Convex action:**

```typescript
const dialogueJson = await ctx.runAction(api.story.storyAi.expandNarrative, {
  type: "dialogue",
  prompt: "A merchant who sells potions and is secretly a dragon in disguise",
  context: "Medieval fantasy village setting",
});
```

---

## Convex Admin Commands

All admin commands run against whatever deployment is configured in `.env.local`. For local development with `convex dev --local`, this targets the local Convex instance.

### Clearing game state

These commands **permanently delete data**. Use with care.

| npm script | What it does |
|------------|-------------|
| `npm run clear:chat` | Delete **all** chat messages across every map |
| `npm run clear:profiles` | Delete **all** player profiles and their presence rows |
| `npm run clear:presence` | Delete all presence rows (clears ghost/stuck players from the world) |
| `npm run clear:objects` | Delete **all** placed map objects (NPCs, decorations, etc.) on every map |
| `npm run clear:npcs` | Delete all NPC runtime state (positions, wander timers, etc.) — objects remain, NPCs re-sync on next tick |

### Player / profile management

| npm script | Example | What it does |
|------------|---------|-------------|
| `npm run reset:map -- '{...}'` | `npm run reset:map -- '{"name":"Bob"}'` | Reset a single profile's map to **cozy-cabin** and clear their saved position, so they respawn at the default start |
| `npm run reset:map -- '{...}'` | `npm run reset:map -- '{"name":"Bob","mapName":"mage-city"}'` | Reset a profile to a **specific** map instead of cozy-cabin |
| `npm run reset:all-maps` | `npm run reset:all-maps` | Reset **every** profile to cozy-cabin (useful after map data changes or broken maps) |
| `npm run reset:all-maps -- '{...}'` | `npm run reset:all-maps -- '{"mapName":"mage-city"}'` | Reset every profile to a specific map |

### Schema / data migrations

| npm script | What it does |
|------------|-------------|
| `npm run backfill:maps` | Patch existing maps with default values for multi-map fields (`portals`, `status`, `combatEnabled`, `isHub`, `editors`, `musicUrl`). Safe to run multiple times. |

### Direct Convex commands

These aren't in `package.json` but can be run directly:

```bash
# List all profiles with their roles
npx convex run admin:listProfiles

# Backfill the role field on profiles created before the permission system
npx convex run admin:backfillRoles

# Set a profile's role by name
npx convex run admin:setRole '{"name": "Martin", "role": "admin"}'
npx convex run admin:setRole '{"name": "Guest", "role": "player"}'

# Delete a specific map and all its objects + NPC state
npx convex run maps:remove '{"profileId": "<admin-profile-id>", "name": "old-map"}'
```

### Static map seeding

Static maps are JSON files in `public/assets/maps/` that get automatically imported into Convex on game startup. The list of known static maps is defined in `src/engine/Game.ts`:

```typescript
private static readonly STATIC_MAPS = ["cozy-cabin", "camineet", "mage-city"];
```

On each game load, the engine checks if each static map exists in Convex. If missing, it fetches the JSON and saves it via `maps.saveFullMap`. If the map exists but the **dimensions differ** from the JSON (e.g. after a conversion fix), it automatically re-seeds the corrected version.

To add a new static map:

1. Place the JSON in `public/assets/maps/<name>.json`
2. Place the tileset in `public/assets/tilesets/<name>.png`
3. Add the map name to the `STATIC_MAPS` array in `Game.ts`
4. Register the tileset in `MapEditorPanel.ts` (`TILESETS` array) and `MapBrowser.ts` (`TILESET_OPTIONS`)
5. If the map has music, place the audio file and add it to the `MUSIC_OPTIONS` arrays in both `MapBrowser.ts` and `MapEditorPanel.ts`

---

## Permission System

Profiles have a `role` field: `"admin"` or `"player"`.

### How roles are assigned

- The **first profile** ever created automatically gets `"admin"`
- All subsequent profiles default to `"player"`
- Roles can be changed via the `admin:setRole` command (see above)

### What admins can do

Admins have access to the **Build** and **Sprites** modes in the toolbar. These modes are hidden for regular players.

### Global admin–only mutations

These require the profile's `role` to be `"admin"`:

| Mutation | Purpose |
|----------|---------|
| `maps.create` | Create a brand new map |
| `maps.remove` | Delete a map and all its objects + NPC state |
| `maps.setEditors` | Change the editors list for a map |
| `spriteDefinitions.save` | Create or update a sprite definition |
| `spriteDefinitions.remove` | Delete a sprite definition |

### Per-map editor mutations

These require the caller to be a **global admin**, the **map creator**, or listed in the map's `editors` array:

| Mutation | Purpose |
|----------|---------|
| `maps.saveFullMap` | Save map tile/collision/label/portal data |
| `maps.updateMetadata` | Update music, combat, status, hub flag |
| `mapObjects.place` | Place an object on the map |
| `mapObjects.move` | Move a placed object |
| `mapObjects.remove` | Remove a placed object |
| `mapObjects.bulkSave` | Bulk save all objects (editor Save button) |

### Admin badge

Admin profiles show a purple **ADMIN** badge next to their name on the profile selection screen.
