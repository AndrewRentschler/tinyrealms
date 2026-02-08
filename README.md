# Tiny Realms

A persistent shared-world 2D RPG built with PixiJS, React, and Convex.

## Features

- **Multiplayer persistent world** — shared map, real-time player positions, durable state
- **Integrated map editor** — paint tiles, set collision, define zones, all saved to Convex in real-time
- **Sprite editor** — import sprite sheets, define frames and animations, export PixiJS-compatible JSON
- **Splash screen system** — generic overlay system for dialogue, combat, shops, inventory, cutscenes
- **Story engine** — human-authored quests and dialogue trees, LLM-assisted narrative via Braintrust
- **Combat engine** — turn-based, server-authoritative combat with client-side preview
- **Economy** — wallets, shops, loot tables
- **Spatial audio** — Web Audio API with distance-based attenuation
- **Auth** — Convex Auth with GitHub OAuth

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Rendering**: PixiJS v8
- **Backend**: Convex (database, real-time, file storage, auth)
- **AI**: Braintrust AI Proxy (NPC dialogue, narrative generation)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev) account
- A GitHub OAuth app (for auth)
- Optionally, a [Braintrust](https://braintrust.dev) API key (for NPC AI)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize Convex:
   ```bash
   npx convex dev
   ```
   This will prompt you to create a new Convex project and generate the `_generated` types.

3. Set up environment variables:
   - Copy `.env.local.example` to `.env.local` and fill in `VITE_CONVEX_URL`
   - In the Convex dashboard, set these environment variables:
     - `AUTH_GITHUB_ID` — your GitHub OAuth App ID
     - `AUTH_GITHUB_SECRET` — your GitHub OAuth App Secret
     - `SITE_URL` — `http://localhost:5173` (for local dev)
     - `BRAINTRUST_API_KEY` — (optional) your Braintrust API key

4. Run the dev server:
   ```bash
   npm run dev
   ```
   This starts both the Vite frontend and the Convex backend in parallel.

## Project Structure

```
convex/               Convex backend
├── schema.ts         Database schema (all tables)
├── auth.ts           Convex Auth config (GitHub OAuth)
├── maps.ts           Map CRUD
├── players.ts        Player persistence
├── presence.ts       Real-time position sync
├── story/            Narrative backend
│   ├── quests.ts
│   ├── dialogue.ts
│   ├── events.ts
│   └── storyAi.ts    Braintrust LLM actions
└── mechanics/        Game mechanics backend
    ├── items.ts
    ├── inventory.ts
    ├── combat.ts
    ├── economy.ts
    └── loot.ts

src/                  Frontend
├── engine/           PixiJS game engine
│   ├── Game.ts       Main loop
│   ├── Camera.ts     Viewport
│   ├── MapRenderer.ts
│   ├── EntityLayer.ts
│   └── InputManager.ts
├── editor/           Map editor UI
├── sprited/          Sprite editor UI
├── splash/           Splash screen system
│   ├── SplashManager.ts
│   ├── SplashHost.tsx
│   └── screens/      Concrete splash screens
├── story/            Story engine + content
│   ├── StoryEngine.ts
│   ├── DialogueRunner.ts
│   └── content/      Hand-authored narrative files
├── mechanics/        Game mechanics engine
│   ├── CombatEngine.ts
│   ├── StatBlock.ts
│   └── Economy.ts
├── hooks/            React hooks for Convex
├── lib/              Shared utilities
└── ui/               HUD, chat, mode toggle
```

## Modes

- **Play** — explore the world, interact with NPCs, engage in combat
- **Build** — edit the map (paint tiles, set collision, define zones)
- **Sprites** — create and edit sprite sheets for animations

Toggle between modes using the toolbar in the top-left corner.
