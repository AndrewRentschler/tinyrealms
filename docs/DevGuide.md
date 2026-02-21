# Developer Guide — Offline Reference

This guide is designed so you can work on the codebase without AI assistance. It covers the file layout, architecture, data flow, and how to add new features.

---

## 1. Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Rendering | PixiJS v8 | `AnimatedSprite`, `Container`, `Graphics`, `Texture` |
| Backend | Convex (local dev) | `npx convex dev --local` — real-time subscriptions |
| Frontend build | Vite | `npm run dev` starts both Vite + Convex |
| Language | TypeScript | Strict mode, no React — all DOM is manual |

Start dev servers: `npm run dev` (runs Vite on ~5200 and Convex locally).

---

## 2. Directory Layout

```
src/
├── main.ts              Entry point — creates ConvexClient, starts App
├── App.ts               Profile selection → GameShell
├── index.css            Global CSS variables & base styles
│
├── engine/              PixiJS game engine (rendering, input, audio)
│   ├── Game.ts          Main game loop, stage setup, mode switching, map loading
│   ├── EntityLayer.ts   Player + NPC rendering, movement, NPC dialogue
│   ├── MapRenderer.ts   Tile map rendering, collision overlay, portals, labels
│   ├── ObjectLayer.ts   Placed objects (static + toggleable), glow/prompt
│   ├── WorldItemLayer.ts  Item pickups on map (bob, glow, proximity)
│   ├── NPC.ts           NPC AI (wander, idle, patrol), sprite animation
│   ├── AudioManager/    Web Audio API — BGM + SFX + ambient + spatial (spatial.ts)
│   ├── Camera.ts        Viewport + smooth follow
│   ├── InputManager.ts  Keyboard/mouse state (keys, justPressed, endFrame)
│   ├── SpriteLoader.ts  Spritesheet loader (avoids PixiJS cache collisions)
│   ├── CombatEngine.ts  Turn-based combat resolution (CombatEngine/ decomposed)
│   ├── types.ts         Shared types (AppMode, MapData, Direction, etc.)
│   └── animations/
│       └── TileAnimator.ts  Animated tile overlays (water, torches)
│
├── editor/              Map editor (build mode)
│   ├── MapEditorPanel.ts  ~1900 lines — toolbar, tileset picker, layer panel,
│   │                      object/NPC/item/collision/portal/label tools
│   └── *.css
│
├── sprited/             Sprite definition editor
│   ├── SpriteEditorPanel.ts  Browse sheets, preview anims, save defs
│   └── SpriteEditor.css
│
├── ui/                  UI panels (DOM-based, not PixiJS)
│   ├── GameShell.ts     Creates canvas, hosts all panels, manages modes
│   ├── ModeToggle.ts    Play/Build/Sprite/NPC/Item mode buttons
│   ├── CharacterPanel.ts  Player stats, inventory, sprite preview
│   ├── ChatPanel.ts     Chat messages via Convex
│   ├── NpcEditorPanel.ts  NPC instance profiles (name, backstory, stats)
│   ├── ItemEditorPanel.ts Item definitions (weapons, armor, consumables)
│   ├── MapBrowser.ts    Browse/travel/create maps
│   ├── ProfileScreen.ts Profile selection on startup
│   ├── HUD.ts           Mode label overlay
│   └── *.css
│
├── splash/              Overlay screens (dialogue, inventory, battle, etc.)
│   ├── SplashManager.ts Stack-based overlay manager (singleton)
│   ├── SplashHost.ts    Renders active splash stack as DOM overlays
│   └── screens/         Individual splash implementations
│
├── mechanics/           Client-side game mechanics (mostly type defs + helpers)
│   ├── StatBlock.ts     HP/ATK/DEF/SPD formulas
│   ├── Inventory.ts     Sort/filter helpers
│   └── ItemTypes.ts     Shared item type definitions
│
├── story/               Narrative engine
│   ├── StoryEngine.ts   Event trigger evaluation
│   ├── QuestTracker.ts  Quest state management
│   ├── DialogueRunner.ts Dialogue tree walker
│   └── content/         Authored content (quests, dialogue, lore)
│
└── lib/                 Shared utilities
    ├── convexClient.ts  ConvexClient singleton
    ├── tilemath.ts      Grid ↔ world coordinate conversion
    └── interpolation.ts Smooth remote player position lerp

convex/                  Backend (Convex functions)
├── schema.ts            Database schema — ALL tables defined here
├── maps.ts              Map CRUD + save/load
├── profiles.ts          Player profiles
├── presence.ts          Real-time position sync
├── mapObjects.ts        Placed objects (place, remove, toggle, bulkSave)
├── spriteDefinitions.ts Sprite defs (CRUD)
├── worldItems.ts        World item pickups (place, remove, pickup)
├── items.ts             Item definitions (CRUD)
├── npcProfiles.ts       NPC instance profiles
├── npcEngine.ts         Server-side NPC movement tick loop
├── chat.ts              Chat messages
├── admin.ts             Admin utilities
├── lib/
│   ├── requireAdmin.ts      Permission check
│   └── requireMapEditor.ts  Permission check
├── mechanics/           Server-authoritative game logic
│   ├── combat.ts, inventory.ts, loot.ts, economy.ts
└── story/               Server-side narrative
    ├── quests.ts, dialogue.ts, lore.ts, events.ts, storyAi.ts
```

---

## 3. Architecture & Data Flow

### Mode System

`Game.mode` is one of: `"play"` | `"build"` | `"sprite-edit"` | `"npc-edit"` | `"item-edit"`

- **Play**: Entity movement, NPC interaction (E key), item pickup, object toggle
- **Build**: Camera panning (WASD), tile painting, object/NPC/item placement, collision editing
- Other modes: Open their respective editor panels

`ModeToggle.ts` has the buttons. `GameShell.ts` calls `game.setMode()` and toggles panel visibility.

### Game Loop (`Game.ts` → `update()`)

```
update() called by PixiJS ticker every frame
├── if play mode:
│   ├── entityLayer.update(dt, input)     — move player, animate, NPC proximity
│   ├── checkPortals()                    — map transitions
│   ├── worldItemLayer.update()           — item bob/glow/proximity
│   ├── objectLayer.updateToggleInteraction() — toggleable glow/prompt
│   ├── handleObjectToggle() or handleItemPickup() — E key
│   └── input.endFrame()                  — clear justPressed (MUST be last)
├── if build mode:
│   ├── camera panning (WASD/arrows)
│   └── input.endFrame()
├── updateAmbientVolumes()                — spatial audio
└── camera.apply(stage)                   — move viewport
```

### Rendering Order (Stage Children)

```
Stage (sortableChildren = true)
├── mapRenderer.container        zIndex: 0   — base tile layers (bg0, bg1, obj0, obj1)
├── worldItemLayer.container     zIndex: 45  — item pickups
├── objectLayer.container        zIndex: 50  — placed sprites (fireplaces, furniture)
├── entityLayer.container        zIndex: 50  — player + NPCs
└── mapRenderer.overlayLayerContainer  zIndex: 60  — overlay tiles (tree tops, roofs)
```

Within `objectLayer`, each object's container has `zIndex = Math.round(obj.y)` for depth sorting.

### Convex Data Flow

```
Frontend                          Convex Backend
─────────                         ──────────────
convex.query(api.X.list, {})  →   query handler reads from DB
convex.mutation(api.X.save, data) → mutation writes to DB
convex.onUpdate(api.X.list, {}, callback) → real-time subscription
```

Key pattern: **optimistic updates**. For toggleable objects, `applyToggle()` updates the sprite immediately, and the subscription callback skips full reloads when only toggle state changed.

---

## 4. Key Patterns

### Adding a UI Panel

All panels follow this pattern:

```typescript
export class MyPanel {
  el: HTMLElement;
  private game: Game | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "my-panel";
    this.el.style.display = "none";
    // Build DOM here
  }

  setGame(game: Game) { this.game = game; }

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
  }
}
```

Then in `GameShell.ts`:
1. Import and instantiate
2. Append `.el` to the shell
3. Call `setGame()` after game init
4. Toggle visibility in the mode-switch handler

### Adding a Convex Table

1. **`convex/schema.ts`**: Add table with `defineTable({...}).index(...)` 
2. **Create `convex/myTable.ts`**: Add query/mutation functions
3. **Frontend**: Import `api` from `../convex/_generated/api` and call `convex.query()` / `convex.mutation()`

### Adding a PixiJS Layer

1. Create `src/engine/MyLayer.ts` extending the pattern of `ObjectLayer` or `WorldItemLayer`
2. Create a `container: Container` property
3. In `Game.ts`:
   - Instantiate in `init()`
   - Add container to stage: `this.app.stage.addChild(myLayer.container)`
   - Set appropriate `zIndex`
   - Call update in the game loop
   - Clean up in `destroy()` and map transitions

### Adding an Editor Tool

1. **`MapEditorPanel.ts`**:
   - Add to `EditorTool` type union
   - Add to `TOOLS` array (or `DELETE_OPTIONS` for delete tools)
   - Handle in `setTool()` — show/hide relevant pickers
   - Handle in `handleCanvasAction()` — dispatch clicks
   - Handle in `paintTileAt()` if it's a tile-level tool
   - Add to `noDrag` list in `canvasMoveHandler` if single-click only

### Sprite Anchoring

All placed objects use anchor `(0.5, 1.0)` — bottom-center. This means:
- `obj.x, obj.y` is the sprite's **feet** position
- The sprite renders **above** that point
- Click detection for deletion uses asymmetric hit-test: 48px horizontal, 96px above, 16px below

### Input Handling

- `InputManager` tracks `keys` (currently held) and `justPressed` (pressed this frame)
- `wasJustPressed("e")` returns true once per key-down
- **CRITICAL**: `input.endFrame()` clears `justPressed` — must be called at the very end of the game loop, after all systems have checked it
- Key names: `"e"`, `"E"`, `"ArrowUp"`, `"a"`, `"w"`, etc. (KeyboardEvent.key values)

---

## 5. How to Add Common Features

### New Interactable Object Type

1. Add fields to `spriteDefinitions` table in `convex/schema.ts`
2. Update `SpriteEditorPanel.ts` form to edit the new fields
3. Update `ObjectLayer.addPlacedObject()` to read the new fields
4. Add interaction logic in `ObjectLayer` (similar to `updateToggleInteraction`)
5. Add handler in `Game.update()` play-mode block

### New Map Tool (e.g., "Zone Painter")

1. Add `"zone"` to `EditorTool` type
2. Add to `TOOLS` array
3. In `setTool()`, show/hide a zone picker panel
4. In `handleCanvasAction()`, dispatch to a `paintZone()` method
5. Store zone data in `mapData` (add field to `MapData` type in `types.ts`)
6. Render zone overlay in `MapRenderer` (follow collision overlay pattern)
7. Save/load in `maps.ts` bulk save

### New Splash Screen (e.g., "Crafting")

1. Create `src/splash/screens/CraftingSplash.ts`
2. Implement the `SplashScreen` interface from `SplashTypes.ts`
3. Push via `SplashManager.getInstance().push(new CraftingSplash())`
4. Style in a companion CSS file

### New NPC Behavior

1. Edit `src/engine/NPC.ts` — add a new behavior mode
2. Edit `convex/npcEngine.ts` — add server-side movement logic
3. Add the behavior config to `npcProfiles` schema if needed

### New Item Effect

1. Add the effect type to `itemDefs` schema in `convex/schema.ts`
2. Update `ItemEditorPanel.ts` to edit the new effect
3. Handle the effect in the appropriate mechanic file (`src/mechanics/` or `convex/mechanics/`)

---

## 6. PixiJS v8 Gotchas

- **No `BaseTexture`** — use `Assets.load()` to get a `Texture`, then `new Texture({ source: tex.source, frame: new Rectangle(...) })` for sub-textures
- **`AnimatedSprite`** — after setting `.textures`, re-set `.animationSpeed` and call `.gotoAndPlay(0)` (not just `.play()`)
- **`Spritesheet`** — create manually with `new Spritesheet(texture, data)` + `await sheet.parse()` to avoid cache key collisions
- **`Graphics`** — use `g.rect(x,y,w,h)` then `g.fill({color, alpha})` (method chaining changed in v8)
- **`Text`** — use `new Text({ text, style: new TextStyle({...}) })`
- **Container.sortableChildren** — must be `true` for `zIndex` to work on children

---

## 7. File Quick-Reference

| "I want to..." | File(s) |
|---|---|
| Change player movement speed | `EntityLayer.ts` → `MOVE_SPEED` |
| Add a new map | Map Browser UI or `scripts/convert-map.mjs` |
| Edit collision detection | `MapRenderer.ts` → `isCollision()`, `EntityLayer.ts` → `isBlocked()` |
| Change NPC wander behavior | `NPC.ts` → `updateWander()`, `convex/npcEngine.ts` |
| Add a new Convex table | `convex/schema.ts` → add table, create new `.ts` file |
| Style a UI panel | Companion `.css` file in same directory |
| Add a toolbar button | `MapEditorPanel.ts` → `TOOLS` or `DELETE_OPTIONS` arrays |
| Change audio settings | `AudioManager.ts`, `ObjectLayer.ts` → `updateAmbientVolumes()` |
| Modify the camera | `Camera.ts` |
| Add keyboard shortcut | `InputManager.ts` captures all keys; check in `Game.update()` |
| Change stage render order | `Game.ts` → `init()` where `app.stage.addChild(...)` is called |
| Edit map save format | `convex/maps.ts` → `save` mutation, `types.ts` → `MapData` |

---

## 8. Development Workflow

1. **Start**: `npm run dev` — opens Vite + Convex
2. **Edit**: Change files, Vite hot-reloads instantly
3. **Schema changes**: Edit `convex/schema.ts` → Convex auto-deploys locally
4. **Test**: Browser at `localhost:5200` (or next available port)
5. **Console**: Browser DevTools console shows `[MapObjects]`, `[Presence]`, etc.
6. **Save maps**: Click "Save" in build mode — sends to Convex

### Debug Tips

- Add `console.log` in `Game.update()` to trace the game loop
- Check `this.rendered` array in ObjectLayer for placed objects
- Check `this.mode` in Game.ts to verify you're in the right mode
- Browser DevTools → Network tab shows Convex WebSocket messages
- If sprites don't appear, check zIndex ordering and container parent chain

---

## 9. Common Pitfalls

1. **`input.endFrame()` placement** — Must be the last call in `Game.update()`. If called earlier, `wasJustPressed()` won't work for later systems.

2. **Subscription reload race** — Convex subscriptions fire after mutations. If you do an optimistic visual update, the subscription may destroy and recreate your sprites. Use the toggle fast-path pattern (compare rendered state to incoming data).

3. **Sprite anchor vs click position** — Objects anchored at (0.5, 1.0) mean the stored position is the feet. Click detection must account for sprite height above the anchor.

4. **Animation name case** — Spritesheet JSON may use lowercase (`row0`) while UI saves uppercase (`ROW0`). The ObjectLayer has case-insensitive lookup via `findAnim()`.

5. **Async `addPlacedObject`** — Sprite sheet loading is async. The `rendered` array may be empty briefly during reloads.

6. **PixiJS v8 texture creation** — Don't import `BaseTexture`. Use `Assets.load()` + `new Texture({ source, frame })`.
