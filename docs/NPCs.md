# NPCs: End-to-End Workflow

This guide covers creating a new NPC from scratch — preparing the spritesheet, configuring behavior, placing it on a map, assigning a unique identity, writing dialogue, adding sounds, and evolving the conversation with AI.

---

## Table of Contents

1. [Overview](#overview)
2. [Preparing the Spritesheet](#preparing-the-spritesheet)
3. [Registering the Sheet](#registering-the-sheet)
4. [Creating an NPC Sprite Definition](#creating-an-npc-sprite-definition)
5. [Placing the NPC on a Map](#placing-the-npc-on-a-map)
6. [NPC Instances & Identity](#npc-instances--identity)
7. [NPC Profiles (Personality, Backstory, Stats)](#npc-profiles-personality-backstory-stats)
8. [NPC Behavior & AI](#npc-behavior--ai)
9. [Dialogue System](#dialogue-system)
10. [Evolving Dialogue with AI](#evolving-dialogue-with-ai)
11. [Adding Sounds](#adding-sounds)
12. [File Reference](#file-reference)

---

## Overview

An NPC in **Here** is a sprite definition with `category: "npc"` that gets placed on a map via the Object tool. Each placed NPC is a distinct **instance** — the same sprite can be placed multiple times with different names and personalities.

At runtime, an NPC instance:

- **Wanders** autonomously within a configurable radius (server-authoritative)
- **Faces** the player when approached
- **Displays** a `[E] Talk` prompt when the player is within range
- **Runs** a dialogue tree when the player presses E
- **Plays** optional ambient and interaction sounds
- **Uses its instance name** for greetings and display, not the sprite def name

The lifecycle is:

```
Spritesheet → Sprite Definition → Place on Map → Assign Instance Name → Configure Profile → NPC State auto-created → Wander + Dialogue
```

### Key Concept: Sprites vs Instances

| Concept | What it is | Where it lives |
|---------|-----------|---------------|
| **Sprite Definition** | Visual template — the spritesheet, speed, wander radius, direction mappings | `spriteDefinitions` table |
| **Map Object** | A placed instance of a sprite on a specific map at (x, y) | `mapObjects` table |
| **Instance Name** | A unique name assigned to a placed NPC (e.g. "elara", "bob-merchant") | `mapObjects.instanceName` |
| **NPC Profile** | Identity, backstory, personality, stats, items, relationships | `npcProfiles` table (keyed by `name`) |
| **NPC State** | Runtime position, velocity, wander target (server-authoritative) | `npcState` table |

The same sprite definition (e.g. "villager-female") can be placed three times on different maps, each with a unique instance name ("elara", "marina", "rosa") and completely different profiles.

---

## Preparing the Spritesheet

NPC spritesheets use the same format as player characters (see [Characters.md](Characters.md#spritesheet-format) for the full spec). The key requirements:

### Files

```
public/assets/sprites/
├── your-npc.json     ← PixiJS spritesheet metadata
└── your-npc.png      ← spritesheet image
```

### Animation Rows

NPCs need directional animations for wandering:

| Animation | Direction | Minimum Frames |
|-----------|-----------|----------------|
| `row0` | Down | 2–3 |
| `row1` | Up | 2–3 |
| `row2` | Right | 2–3 |
| `row3` | Left | 2–3 |

> **Tip:** For non-directional NPCs (like a chicken pecking), you can map all four direction fields to the same animation row.

### Non-Standard Row Order

If your spritesheet has a different row layout (e.g. `row0` = left, `row1` = right), you can remap directions in the sprite definition using the `npcDirDown`, `npcDirUp`, `npcDirLeft`, `npcDirRight` fields.

---

## Registering the Sheet

Add the spritesheet to the Sprite Editor's sheet list in `src/sprited/SpriteEditorPanel.ts`:

```typescript
const SPRITE_SHEETS: SheetEntry[] = [
  // ... existing entries ...
  { name: "Your NPC", jsonUrl: "/assets/sprites/your-npc.json" },
];
```

This makes the sheet available in the Sprite Editor dropdown for previewing and configuring.

---

## Creating an NPC Sprite Definition

Open the **Sprites** panel (admin toolbar) and create a definition:

### Required Fields

| Field | Value | Notes |
|-------|-------|-------|
| **Name** | `your-npc` | Unique identifier, lowercase |
| **Sprite Sheet** | Select from dropdown | The one you just registered |
| **Category** | `npc` | Marks this as an NPC |
| **Default Animation** | `row0` | Idle animation (facing down) |
| **Animation Speed** | `0.15` | Frames per tick (0.1–0.3 is typical) |
| **Frame Width / Height** | Match your PNG frames | e.g. `32 × 48` |
| **Scale** | `1.0` | Rendering multiplier |
| **Anchor X / Y** | `0.5` / `1.0` | Center-bottom for characters |

### NPC-Specific Fields

| Field | Default | Description |
|-------|---------|-------------|
| **NPC Speed** | `30` | Movement speed in pixels per second |
| **NPC Wander Radius** | `60` | How far from spawn the NPC wanders (pixels) |
| **NPC Greeting** | `"Hello!"` | The opening line of the default dialogue |
| **Direction Down** | `row0` | Animation for facing/walking down |
| **Direction Up** | `row1` | Animation for facing/walking up |
| **Direction Left** | `row3` | Animation for facing/walking left |
| **Direction Right** | `row2` | Animation for facing/walking right |

### Optional Sound Fields

| Field | Description |
|-------|-------------|
| **Ambient Sound** | Looping sound (e.g. chicken clucking). Dropdown from registered sounds. |
| **Ambient Radius** | Distance in pixels where the sound is audible (default: 200) |
| **Ambient Volume** | Base volume 0–1 (default: 0.5) |
| **Interact Sound** | One-shot sound played when the player starts dialogue |

Click **Save** to persist the definition to Convex via `spriteDefinitions.save`.

---

## Placing the NPC on a Map

1. Enter **Build** mode on the target map.
2. Select the **Object** tool.
3. A sprite picker appears showing all saved definitions. NPC definitions are marked with their category.
4. Select your NPC definition.
5. Click on the map to place the NPC at that position.
6. Click **Save** to persist.

Behind the scenes:

- The placement creates a `mapObjects` row in Convex with the NPC's `spriteDefName`, position (`x`, `y`), layer, and an optional `instanceName`.
- On save, `mapObjects.bulkSave` writes all placed objects, preserving any assigned `instanceName`.
- The NPC engine (`convex/npcEngine.ts`) automatically creates an `npcState` row for the NPC, initializing its wander behavior and propagating the `instanceName`.

### mapObjects Schema

```typescript
{
  mapName: string,
  spriteDefName: string,        // references spriteDefinitions.name
  instanceName?: string,        // unique NPC instance name (links to npcProfiles.name)
  x: number,                    // world position in pixels
  y: number,
  layer: number,                // z-ordering
  scaleOverride?: number,
  flipX?: boolean
}
```

---

## NPC Instances & Identity

After placing an NPC on a map, it appears as an **unnamed instance** in the NPC Editor. This is where you give it a unique identity.

### Assigning an Instance Name

1. Open the **NPCs** panel (admin toolbar).
2. The sidebar lists all placed NPC instances, grouped by map.
3. Unnamed instances show a ⚠ warning — "No name assigned".
4. Click an instance to open its profile editor.
5. Enter a unique **Instance Name** (slug format, e.g. `elara-herbalist`). This becomes the primary key.
6. Click **Save**.

The instance name is:
- **Globally unique** — enforced across all maps. Two NPCs cannot share the same instance name.
- **Stored on the mapObject** — `mapObjects.instanceName` links to `npcProfiles.name`.
- **Propagated to npcState** — so the game engine can use it for display name and greeting.
- **Used at runtime** — the NPC introduces itself by its instance name instead of the sprite def name.

### Why Instances Matter

Without instances, you'd have one personality per sprite. With instances:
- Place "villager-female" sprite three times → three unique NPCs
- "Elara the Herbalist" on the village map, "Marina the Fisher" on the coast, "Rosa the Baker" in town
- Each has her own backstory, stats, items, and dialogue personality
- Same visual sprite, completely different characters

---

## NPC Profiles (Personality, Backstory, Stats)

The NPC Editor provides a full profile form for each instance, stored in the `npcProfiles` table.

### Profile Fields

| Section | Fields |
|---------|--------|
| **Identity** | Instance Name (slug), Display Name, Title/Role, Faction, Tags |
| **Narrative** | Backstory, Personality traits, Dialogue Style |
| **Knowledge** | World knowledge, Secrets |
| **Stats** | HP, Max HP, ATK, DEF, SPD, Level |
| **Inventory** | Items with quantities |
| **Relationships** | Links to other NPC instances (name + relation type) |
| **LLM** | System Prompt (for AI-driven conversation) |

### npcProfiles Schema

```typescript
{
  name: string,                  // unique instance name (e.g. "elara")
  spriteDefName: string,         // which sprite to use
  mapName?: string,              // which map this instance lives on
  displayName: string,           // "Elara the Herbalist"
  title?: string,                // "Village Herbalist"
  backstory?: string,
  personality?: string,
  dialogueStyle?: string,        // "warm, motherly, uses plant metaphors"
  systemPrompt?: string,         // full LLM system prompt
  faction?: string,              // "Forest Druids"
  knowledge?: string,            // what she knows about the world
  secrets?: string,              // what she hides
  relationships?: [{
    npcName: string,             // instance name of related NPC
    relation: string,            // "mentor", "rival", "sibling"
    notes?: string,
  }],
  stats?: {
    hp: number, maxHp: number,
    atk: number, def: number,
    spd: number, level: number,
  },
  items?: [{ name: string, quantity: number }],
  tags?: string[],               // "shopkeeper", "quest-giver", "healer"
  updatedAt: number,
}
```

### Relationships

Relationships link NPC instances to each other by name. Examples:

- `{ npcName: "bob-blacksmith", relation: "husband" }`
- `{ npcName: "dark-wizard", relation: "nemesis" }`
- `{ npcName: "elder-oak", relation: "mentor", notes: "Taught her herbalism" }`

These are stored data — they don't yet affect runtime behavior, but will be fed to LLMs for context-aware dialogue.

---

## NPC Behavior & AI

### Server-Side Wandering (`convex/npcEngine.ts`)

NPC movement is **server-authoritative** — NPCs wander even when no players are online.

**Tick loop:** The engine runs a self-scheduling tick every 500ms:

1. For each NPC with an `npcState` row:
   - If **idle**: after a random pause (1.5–5 seconds), pick a new wander target within `wanderRadius` of spawn.
   - If **moving**: advance position toward target at `npcSpeed`. Update velocity and facing direction.
   - If **arrived**: enter idle state.
2. Position, velocity, direction, and `instanceName` are persisted in the `npcState` table.

### Client-Side Rendering (`src/engine/NPC.ts`)

The `NPC` class handles visual rendering:

- Interpolates between server position updates for smooth movement
- Switches animation rows based on facing direction
- Uses `instanceName` (when available) for the NPC's display name
- Supports two modes:
  - `serverDriven: true` — position from Convex state (default for placed NPCs)
  - `serverDriven: false` — local wander AI (for hardcoded NPCs)

### npcState Schema

```typescript
{
  mapName: string,
  mapObjectId: Id<"mapObjects">,
  spriteDefName: string,
  instanceName?: string,         // propagated from mapObjects
  x: number, y: number,         // current position
  spawnX: number, spawnY: number,
  vx: number, vy: number,       // velocity
  direction: string,             // "down" | "up" | "left" | "right"
  targetX?: number, targetY?: number,
  idleUntil?: number,
  wanderRadius: number,
  speed: number,
  lastTick: number,
}
```

---

## Dialogue System

### Default Dialogue

When an NPC is placed and has an `npcGreeting` set in its sprite definition, the engine auto-generates a simple 3-node dialogue tree:

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────┐
│   Greeting  │ ──→ │  "Tell me more..."   │ ──→ │ Goodbye  │
│  (npcGreet) │     │  (generic lore line)  │     │          │
└─────────────┘     └──────────────────────┘     └──────────┘
```

If the NPC has an `instanceName`, it uses that for the greeting: `"Hello! I'm Elara..."` instead of `"Hello! I'm villager-female..."`.

This is generated in `src/engine/EntityLayer.ts` → `updateNpcStates()`.

### Dialogue Structure

Conversations are trees of `DialogueLine` nodes:

```typescript
interface DialogueLine {
  id: string;                                     // unique node identifier
  text: string;                                   // what the NPC says
  responses?: { text: string; nextId: string }[]; // player choices
  nextId?: string;                                // auto-advance (no player choice)
}
```

- A node with `responses` shows clickable options to the player.
- A node with only `nextId` auto-advances after displaying.
- A node with neither ends the conversation.

### Example: A Merchant NPC

```typescript
const dialogue: DialogueLine[] = [
  {
    id: "greet",
    text: "Welcome to my shop! Looking for something special?",
    responses: [
      { text: "What do you sell?", nextId: "wares" },
      { text: "Any news from town?", nextId: "gossip" },
      { text: "Just browsing. Goodbye.", nextId: "bye" },
    ],
  },
  {
    id: "wares",
    text: "I have potions, scrolls, and the occasional cursed artifact. Interested?",
    responses: [
      { text: "Tell me about the cursed artifacts.", nextId: "cursed" },
      { text: "Maybe later.", nextId: "bye" },
    ],
  },
  {
    id: "gossip",
    text: "They say the forest to the east has been... restless lately.",
    responses: [
      { text: "Restless how?", nextId: "forest" },
      { text: "I'll be careful. Thanks!", nextId: "bye" },
    ],
  },
  {
    id: "cursed",
    text: "Oh, you have a taste for danger! This amulet whispers at night...",
    nextId: "bye",
  },
  {
    id: "forest",
    text: "Strange lights, creatures that weren't there before. Best go prepared.",
    nextId: "bye",
  },
  {
    id: "bye",
    text: "Safe travels, adventurer!",
  },
];
```

### Where to Edit Dialogue

**For NPCs placed via the editor:**

The default dialogue is generated from `npcGreeting` in `EntityLayer.ts`. To write custom dialogue trees, you have two options:

1. **Hardcode in EntityLayer** — modify the `updateNpcStates()` method to check the NPC's `instanceName` and supply a custom `dialogue` array.

2. **Use the story system** — store dialogue trees in Convex via `convex/story/dialogue.ts`:

   ```typescript
   // Store a tree
   await ctx.runMutation(api.story.dialogue.create, {
     npcId: "elara",  // use instance name
     tree: dialogueNodes,
   });

   // Fetch at runtime
   const tree = await ctx.runQuery(api.story.dialogue.getByNpc, {
     npcId: "elara",
   });
   ```

   The `DialogueRunner` class (`src/story/DialogueRunner.ts`) can execute stored trees through the splash screen system.

### Interaction Flow at Runtime

1. Player approaches NPC (within 48px).
2. `[E] Talk` prompt appears above the NPC.
3. Player presses E.
4. NPC faces the player.
5. `DialogueSplash` overlay opens showing the greeting.
6. Player clicks response options to navigate the tree.
7. Press Escape at any time to exit.
8. The profile records that this NPC was chatted with (`profiles.recordNpcChat`).

---

## Evolving Dialogue with AI

The story system includes LLM-powered generation for creating richer, more dynamic NPC conversations. NPC profiles provide the context that makes AI dialogue feel personal and consistent.

### Setup

Set `BRAINTRUST_API_KEY` in your Convex environment variables. The system uses GPT-4o via the Braintrust AI Proxy.

### Using NPC Profiles for AI Context

The NPC profile fields are designed to feed LLMs. A typical workflow:

1. Fill out the NPC profile (backstory, personality, knowledge, secrets, relationships).
2. Either write a custom `systemPrompt`, or let it be auto-generated from the profile fields.
3. Use the system prompt for `generateDialogue` calls.

```typescript
// The NPC Editor's systemPrompt field can contain:
const systemPrompt = `You are ${profile.displayName}, ${profile.title}.
Backstory: ${profile.backstory}
Personality: ${profile.personality}
Dialogue style: ${profile.dialogueStyle}
You know: ${profile.knowledge}
You are hiding: ${profile.secrets}`;
```

### Available AI Actions (`convex/story/storyAi.ts`)

| Action | Purpose |
|--------|---------|
| `generateDialogue` | Generate dialogue from a system prompt + conversation context |
| `expandNarrative` | Expand outlines into dialogue trees, quests, lore, or backstories |

### Generating a Dialogue Tree

```typescript
const dialogueJson = await ctx.runAction(api.story.storyAi.expandNarrative, {
  type: "dialogue",
  prompt: "A merchant who sells potions and is secretly a dragon in disguise",
  context: "Medieval fantasy village setting, the player has just arrived",
});
```

### Generating Context-Aware Responses

For dynamic, per-conversation responses (rather than static trees):

```typescript
const response = await ctx.runAction(api.story.storyAi.generateDialogue, {
  systemPrompt: npcProfile.systemPrompt,
  messages: [
    { role: "user", content: "Do you know anything about the cursed forest?" },
  ],
});
```

---

## Adding Sounds

### Ambient Sounds

Ambient sounds loop continuously with distance-based volume falloff — perfect for ambient NPC activity (a crackling campfire, a humming wizard, chickens clucking).

1. **Place the audio file** in `public/assets/audio/`:

   ```
   public/assets/audio/your-ambient.mp3
   ```

2. **Register it** in `src/sprited/SpriteEditorPanel.ts` → `SOUND_FILES`:

   ```typescript
   { label: "Your Ambient Sound", url: "/assets/audio/your-ambient.mp3" }
   ```

3. **Assign it** in the Sprite Editor:
   - Select the NPC's sprite definition.
   - Set **Ambient Sound** to your new sound.
   - Set **Ambient Radius** (default: 200px) — how far the sound carries.
   - Set **Ambient Volume** (default: 0.5) — base volume at the NPC's position.
   - Save.

**Volume formula:** `volume = (1 - distance/radius) * ambientSoundVolume`

### Interaction Sounds

Interaction sounds play once when the player initiates dialogue — a greeting grunt, a shop bell, etc.

1. Place the audio file and register it (same steps as ambient).
2. In the Sprite Editor, set **Interact Sound** to the file.
3. Save.

The sound fires on the E key press that starts dialogue.

---

## Full Walkthrough: Adding a New NPC

Here's the complete checklist from zero to a working NPC:

### 1. Prepare Assets

- [ ] Create/obtain a 4-direction spritesheet PNG
- [ ] Write or generate the PixiJS JSON metadata
- [ ] Place both in `public/assets/sprites/`
- [ ] (Optional) Prepare ambient and interact sound files in `public/assets/audio/`

### 2. Register

- [ ] Add the sheet to `SPRITE_SHEETS` in `src/sprited/SpriteEditorPanel.ts`
- [ ] (If adding sounds) Add to `SOUND_FILES` in `src/sprited/SpriteEditorPanel.ts`

### 3. Configure Sprite Definition

- [ ] Open the Sprite Editor (admin toolbar → **Sprites**)
- [ ] Select the sheet, set category to `npc`
- [ ] Configure NPC speed, wander radius, greeting
- [ ] Map direction animations (`npcDirDown`, etc.)
- [ ] Assign sounds if desired
- [ ] Save the sprite definition

### 4. Place on Map

- [ ] Travel to the target map
- [ ] Enter Build mode
- [ ] Select Object tool → pick your NPC definition
- [ ] Click to place on the map
- [ ] Save

### 5. Assign Identity (NPC Editor)

- [ ] Open the NPC Editor (admin toolbar → **NPCs**)
- [ ] Find the new instance (grouped by map, shows ⚠ if unnamed)
- [ ] Click it to open the profile editor
- [ ] Enter a unique **Instance Name** (e.g. `elara-herbalist`)
- [ ] Enter a **Display Name** (e.g. "Elara the Herbalist")
- [ ] Fill out title, faction, tags as desired
- [ ] Save

### 6. Configure Profile

- [ ] Write a **backstory** and **personality**
- [ ] Set **dialogue style** (e.g. "warm, uses plant metaphors")
- [ ] Add **knowledge** and **secrets**
- [ ] Configure **stats** (HP, ATK, DEF, SPD, Level)
- [ ] Add **items** to inventory (for shops/drops later)
- [ ] Set up **relationships** to other NPC instances
- [ ] (Optional) Write or auto-generate a **system prompt** for LLM dialogue
- [ ] Save

### 7. Dialogue

- [ ] The NPC automatically gets a default dialogue tree using its instance name
- [ ] For custom dialogue: edit `EntityLayer.ts` or store a tree via `dialogue.create`
- [ ] For AI-generated dialogue: use `storyAi.expandNarrative` and store the result

### 8. Verify

- [ ] Exit NPC Editor, switch to Play mode
- [ ] Walk up to the NPC — you should see `[E] Talk`
- [ ] Press E — the greeting should use the instance name
- [ ] Check that ambient sound plays at appropriate distance
- [ ] Verify the NPC wanders within its radius

---

## File Reference

| Purpose | Path |
|---------|------|
| NPC spritesheets | `public/assets/sprites/` |
| Sound files | `public/assets/audio/` |
| Sprite Editor panel | `src/sprited/SpriteEditorPanel.ts` |
| NPC Editor panel | `src/ui/NpcEditorPanel.ts` |
| NPC Editor CSS | `src/ui/NpcEditor.css` |
| NPC runtime class | `src/engine/NPC.ts` |
| Entity layer (interaction) | `src/engine/EntityLayer.ts` |
| Server NPC engine | `convex/npcEngine.ts` |
| NPC profiles CRUD | `convex/npcProfiles.ts` |
| Dialogue splash UI | `src/splash/screens/DialogueSplash.ts` |
| Dialogue storage | `convex/story/dialogue.ts` |
| Dialogue runner | `src/story/DialogueRunner.ts` |
| Story AI generation | `convex/story/storyAi.ts` |
| Story types | `src/story/StoryTypes.ts` |
| Convex sprite definitions | `convex/spriteDefinitions.ts` |
| Convex NPC profiles | `convex/schema.ts` (npcProfiles table) |
| Convex NPC state | `convex/schema.ts` (npcState table) |
| Convex map objects | `convex/mapObjects.ts` |
| Map Editor (object tool) | `src/editor/MapEditorPanel.ts` |
| Convex schema | `convex/schema.ts` |
| Mode toggle | `src/ui/ModeToggle.ts` |
| Game shell | `src/ui/GameShell.ts` |
