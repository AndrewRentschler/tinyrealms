# Offline Development Guide

Everything you need to develop **Here** without an internet connection — on a plane, in the woods, wherever.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Pre-Flight Checklist](#pre-flight-checklist)
3. [How It Works](#how-it-works)
4. [Starting the Dev Environment](#starting-the-dev-environment)
5. [What Works Offline](#what-works-offline)
6. [What Doesn't Work Offline](#what-doesnt-work-offline)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Architecture Recap](#architecture-recap)

---

## Quick Start

If you've already developed locally before, you're probably good to go:

```bash
npm run dev
```

This starts both the Vite frontend and the local Convex backend. Open `http://localhost:5173` in your browser.

---

## Pre-Flight Checklist

Run through this **before going offline** to make sure everything is cached and ready.

### 1. Dependencies installed

```bash
npm install
```

All packages must be in `node_modules/`. If this directory is missing or incomplete, `npm install` requires internet.

### 2. Local Convex backend binary cached

The first time you run `convex dev --local`, it downloads a backend binary to `~/.cache/convex/binaries/`. Verify it's there:

```bash
ls ~/.cache/convex/binaries/
```

If empty, run once while online:

```bash
npm run dev:backend
```

Wait for it to print "Convex backend is ready" then Ctrl+C. The binary is now cached permanently.

### 3. Local database has data

Your local Convex data lives in `~/.convex/convex-backend-state/local-martin_casado-here/`. This persists across restarts. If you've been developing locally, your maps, profiles, and NPCs are all there.

To verify:

```bash
ls ~/.convex/convex-backend-state/local-martin_casado-here/
```

You should see `convex_local_backend.sqlite3` and `convex_local_storage/`.

### 4. Environment variables set for local mode

Your `.env.local` should point to the local backend:

```bash
CONVEX_DEPLOYMENT=local:local-martin_casado-here
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

**Warning:** If `.env.local` points to `CONVEX_DEPLOYMENT=dev:...` (cloud mode), you must switch it before going offline. The cloud backend is unreachable without internet.

### 5. Test it works

```bash
npm run dev
```

Open `http://localhost:5173`, create or select a profile, and make sure the game loads. If everything works now, it will work offline.

### 6. (Optional) Pre-load browser cache

Open Chrome DevTools > Application > Service Workers. Vite doesn't use a service worker by default, but all assets are served locally from `public/`, so they don't need caching.

---

## How It Works

The dev stack is fully local:

```
Browser (localhost:5173)
   │
   ├── Vite dev server ──────── serves HTML/TS/CSS from src/
   │                             serves static files from public/
   │
   └── Convex local backend ─── runs on localhost:3210
          │                       backed by SQLite (no cloud)
          └── ~/.convex/...  ─── persistent database & file storage
```

- **Vite** compiles TypeScript on the fly and serves everything from disk.
- **Convex local backend** is a standalone binary that runs your `convex/` functions against a local SQLite database. No cloud dependency.
- **All game assets** (tilesets, sprites, audio, maps) are in `public/assets/` and served by Vite.

---

## Starting the Dev Environment

### Option A: Both together (recommended)

```bash
npm run dev
```

This runs `vite` and `convex dev --local` in parallel via `npm-run-all`.

### Option B: Separate terminals

```bash
# Terminal 1 — backend
npm run dev:backend

# Terminal 2 — frontend
npm run dev:frontend
```

Useful if you want to restart one without the other.

### Accessing the game

Open `http://localhost:5173` in Chrome or Firefox. The game initializes a Convex client pointing at `http://127.0.0.1:3210`.

---

## What Works Offline

Everything core to the game and editor:

| Feature | Status | Notes |
|---------|--------|-------|
| Frontend dev (TS/CSS changes, hot reload) | Works | Vite serves from disk |
| Local Convex backend | Works | SQLite-backed, no cloud needed |
| Map editor (paint, erase, collision, portals, labels) | Works | Saves to local Convex |
| Sprite editor | Works | Saves sprite definitions to local Convex |
| Character panel | Works | Stats/items persist to local Convex |
| Map browser / travel | Works | All maps in local database |
| NPC placement and wandering | Works | Server-side tick loop runs locally |
| NPC dialogue (default trees) | Works | Generated from `npcGreeting` field |
| Chat | Works | Local Convex real-time subscriptions |
| Background music / ambient sounds | Works | Files in `public/assets/audio/` |
| Admin commands (`npm run clear:*`, etc.) | Works | Run against local backend |
| TypeScript compilation / type-checking | Works | `tsc` uses local `node_modules` |
| ESLint | Works | `npm run lint` |
| Build | Works | `npm run build` |

---

## What Doesn't Work Offline

| Feature | Why | Workaround |
|---------|-----|------------|
| AI narrative generation (`storyAi.ts`) | Calls Braintrust API (GPT-4o) | Write dialogue trees by hand (see [NPCs.md](NPCs.md)) |
| GitHub OAuth | Requires GitHub servers | Not needed — game uses local profiles, no auth wall |
| `npm install` (adding new packages) | Needs npm registry | Install everything before going offline |
| Cloud Convex deployment (`npm run dev:cloud`) | Needs internet | Use `npm run dev` (local mode) instead |
| Convex dashboard (dashboard.convex.dev) | Web-based tool | Use CLI commands instead: `npx convex run ...` |

---

## Common Tasks

### Editing a map

1. `npm run dev`
2. Open `http://localhost:5173`, select your admin profile
3. Click **Build** in the toolbar
4. Edit tiles, collision, portals, labels
5. Click **Save**

### Adding a new tileset

1. Drop the PNG into `public/assets/tilesets/`
2. Add an entry to `TILESETS` in `src/editor/MapEditorPanel.ts`
3. Add an entry to `TILESET_OPTIONS` in `src/ui/MapBrowser.ts`
4. The editor hot-reloads — no restart needed

### Adding a new spritesheet

1. Drop the JSON + PNG pair into `public/assets/sprites/`
2. Add to `SPRITE_SHEETS` in `src/sprited/SpriteEditorPanel.ts`
3. Open Sprites mode in-game to configure the definition

### Adding background music

1. Drop the MP3/M4A into `public/assets/audio/`
2. Add to `MUSIC_OPTIONS` in `src/ui/MapBrowser.ts` and `src/editor/MapEditorPanel.ts`

### Writing NPC dialogue

Without AI, write dialogue trees directly. See `src/engine/EntityLayer.ts` — the `spawnNpcFromDef()` method generates default dialogue from `npcGreeting`. For custom trees, create a `DialogueLine[]` array:

```typescript
const dialogue = [
  {
    id: "greet",
    text: "Hello, traveler!",
    responses: [
      { text: "Tell me about this place.", nextId: "lore" },
      { text: "Goodbye.", nextId: "bye" },
    ],
  },
  { id: "lore", text: "This cabin has stood for centuries...", nextId: "bye" },
  { id: "bye", text: "Safe travels!" },
];
```

### Running admin commands

All admin scripts work against the local backend:

```bash
npm run clear:chat         # Delete all chat messages
npm run clear:npcs         # Reset NPC state (they re-sync on next tick)
npm run clear:presence     # Clear ghost players
npm run reset:all-maps     # Reset all profiles to cozy-cabin

# Direct Convex function calls
npx convex run admin:listProfiles
npx convex run admin:setRole '{"name": "Martin", "role": "admin"}'
```

### Convex schema changes

If you modify `convex/schema.ts` or any `convex/*.ts` file, the `convex dev --local` watcher automatically picks up changes, regenerates `convex/_generated/`, and pushes the new functions to the local backend. No internet needed.

---

## Troubleshooting

### "A local backend is still running on port 3210"

A previous Convex process didn't shut down cleanly. Kill it:

```bash
lsof -ti:3210 | xargs kill -9
```

Then restart with `npm run dev`.

### "VITE_CONVEX_URL is not set"

Your `.env.local` file is missing or doesn't have the right variables. Create it:

```bash
cat > .env.local << 'EOF'
CONVEX_DEPLOYMENT=local:local-martin_casado-here
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
EOF
```

### Convex backend binary not found

If you never ran `convex dev --local` while online, the binary hasn't been downloaded. You must do this once before going offline:

```bash
npm run dev:backend
# Wait for "Convex backend is ready"
# Ctrl+C
```

### Page loads but nothing renders (blank screen)

Check the browser console. If you see `WebSocket connection to 'ws://127.0.0.1:3210/...' failed`:

1. Make sure the Convex backend is running (`npm run dev:backend`)
2. Check `.env.local` points to `127.0.0.1:3210`

### Hot reload stopped working

Vite's HMR uses WebSocket. If the connection drops:

1. Check `npm run dev:frontend` is still running
2. Hard-refresh the browser (Cmd+Shift+R)

### Database is empty after restart

The local database persists in `~/.convex/convex-backend-state/local-martin_casado-here/`. If this directory was deleted, you lost your data. Static maps will auto-seed on next game load, but profiles and placed objects are gone.

To re-seed static maps manually, just load the game — `Game.ts` calls `seedStaticMaps()` on init.

---

## Architecture Recap

For offline work, the key files and directories:

```
/Users/martin/projects/here/
├── .env.local                          # Must point to local backend
├── src/                                # All game source code
│   ├── main.ts                         # Entry point
│   ├── engine/                         # Game engine (Game.ts, MapRenderer, etc.)
│   ├── editor/                         # Map editor (MapEditorPanel.ts)
│   ├── sprited/                        # Sprite editor
│   ├── ui/                             # UI panels (GameShell, Chat, Character, etc.)
│   └── story/                          # Dialogue & narrative system
├── convex/                             # Backend functions (mutations, queries)
│   ├── schema.ts                       # Database schema
│   ├── _generated/                     # Auto-generated types (don't edit)
│   └── story/storyAi.ts               # AI features (requires internet)
├── public/assets/                      # All game assets (served by Vite)
│   ├── tilesets/                       # Tileset PNGs
│   ├── sprites/                        # Spritesheet JSON+PNG pairs
│   ├── audio/                          # Music and sound effects
│   ├── maps/                           # Static map JSON files
│   └── animations/                     # Animated tile descriptors
├── scripts/                            # Map conversion scripts
└── docs/                               # Documentation (you are here)

~/.cache/convex/binaries/               # Local Convex backend binary (auto-downloaded)
~/.convex/convex-backend-state/         # Local database (SQLite + file storage)
```

Everything runs on `localhost`. No internet required. Happy coding at 35,000 feet.
