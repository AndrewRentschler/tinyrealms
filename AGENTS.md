# AGENTS.md – Tiny Realms

Guidelines for agentic coding assistants working in this repository.

## Project Overview

Tiny Realms is a persistent shared-world 2D RPG built with **PixiJS** (frontend) and **Convex** (backend). TypeScript throughout, Vite for bundling.

## Build Commands

```bash
# Development (frontend + local Convex backend)
npm run dev

# Development (frontend + cloud Convex backend)
npm run dev:cloud

# Production build
npm run build

# Linting
npm run lint

# Type checking only
npm run typecheck

# Preview production build
npm run preview
```

## Testing

**No test framework is currently configured.** To add tests, discuss with the team first. Preferred options: Vitest (frontend), Convex testing utilities (backend).

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2022, strict mode enabled
- Module: ESNext with `.ts` extensions in imports
- Project references: `tsconfig.app.json` (src), `tsconfig.node.json` (root config)

### Imports & Exports
- Always use `.ts` extension in relative imports: `import { Game } from "./Game.ts"`
- Use named exports for classes and functions: `export class Game`
- Group imports: 1) external libs, 2) generated code, 3) internal modules, 4) types
- Import types explicitly with `import type`: `import type { ProfileData } from "./types.ts"`

### Naming Conventions
- **Classes**: PascalCase (e.g., `MapRenderer`, `EntityLayer`)
- **Interfaces/Types**: PascalCase (e.g., `ProfileData`, `MapLayer`)
- **Functions/Variables**: camelCase (e.g., `getConvexClient`, `currentMapName`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `COMBAT_ATTACK_KEY`)
- **Private members**: Use `private` keyword, optionally prefix with underscore in rare cases
- **File names**: kebab-case for config, camelCase/PascalCase for source matching primary export

### Code Organization
- Use `// ---------------------------------------------------------------------------` as section separators
- JSDoc comments for public functions and classes
- Group related functionality with clear section headers
- Keep functions focused; extract helpers for complex logic

### Error Handling
- Use descriptive error messages: `throw new Error("Call initConvexClient() first")`
- For Convex mutations/queries, return typed results rather than throwing for expected failures
- Use type guards and null checks; avoid non-null assertions (`!`) unless absolutely necessary

### Type Safety
- Enable strict TypeScript checking
- Define interfaces in `types.ts` files
- Use Convex's generated types from `convex/_generated/api` and `convex/_generated/dataModel`
- Avoid `any`; use `unknown` with type narrowing when type is truly dynamic

### Frontend (src/)
- **engine/**: Core game systems (Game, MapRenderer, EntityLayer, etc.)
- **ui/**: UI components and panels
- **lib/**: Shared utilities (convexClient, authClient, helpers)
- **config/**: Configuration constants
- **mechanics/**: Game mechanics (Combat, Inventory, Economy)
- **story/**: Dialogue, quests, narrative systems
- Use `readonly` for immutable class properties
- Clean up resources in `destroy()` methods

### Backend (convex/)
- Use Convex's `query`, `mutation`, and `action` wrappers
- Define schemas in `schema.ts` with proper validation using `v` from `convex/values`
- Extract reusable auth/permission logic to `lib/` (e.g., `requireSuperuser`)
- Use indexes for efficient queries
- Return lean data from queries; avoid over-fetching

### Scripts (scripts/)
- Admin/utility scripts use `.mjs` extension
- Use `node scripts/<script>.mjs` pattern
- Common scripts: `dump-state.mjs`, `backup-world.mjs`, `admin-run.mjs`

## Environment & Secrets

- Use `.env.local` for local development (copy from `.env.local.example`)
- Never commit `.env.local` or secrets
- Access env vars via `import.meta.env.VITE_*` in frontend code

## Common Operations

```bash
# Clear various data stores
npm run clear:chat
npm run clear:profiles
npm run clear:presence
npm run clear:objects

# Backup/restore world state
npm run backup:world
npm run restore:world

# User management
npm run users:list
npm run users:remove-anonymous

# Database maintenance
npm run db:check
npm run db:compact
```

## Documentation

See `docs/` directory for subsystem documentation:
- `LevelCreate.md` – Map editing workflows
- `NPCs.md` – NPC system
- `Items.md` – Item system
- `Combat.md` – Combat mechanics
- `Quests.md` – Quest system
- `AuthPermissions.md` – Auth and permissions
- `Operations.md` – Backups and ops
