/**
 * Mock Convex store for local/offline development.
 * Pure TypeScript – no React, no framework dependencies.
 * Stores everything in memory. No network, no auth required.
 */

// ---------------------------------------------------------------------------
// Mock data store
// ---------------------------------------------------------------------------

export interface MockStore {
  players: Map<string, any>;
  presence: Map<string, any>;
  maps: Map<string, any>;
  spriteSheets: Map<string, any>;
  messages: any[];
  [key: string]: any;
}

const store: MockStore = {
  players: new Map(),
  presence: new Map(),
  maps: new Map(),
  spriteSheets: new Map(),
  messages: [],
};

let nextId = 1;
function genId(table: string): string {
  return `${table}:${nextId++}`;
}

// Seed a default player
export const LOCAL_USER_ID = "local-user-1";
export const LOCAL_PLAYER_ID = genId("players");
store.players.set(LOCAL_PLAYER_ID, {
  _id: LOCAL_PLAYER_ID,
  userId: LOCAL_USER_ID,
  name: "Local Player",
  mapId: undefined,
  x: 128,
  y: 128,
  direction: "down",
  animation: "idle",
  stats: { hp: 100, maxHp: 100, atk: 10, def: 5, spd: 5, level: 1, xp: 0 },
});

// Seed a default map (8x8, 32px tiles)
export const LOCAL_MAP_ID = genId("maps");
const emptyTiles = JSON.stringify(new Array(8 * 8).fill(-1));
const emptyCollision = JSON.stringify(new Array(8 * 8).fill(false));
store.maps.set(LOCAL_MAP_ID, {
  _id: LOCAL_MAP_ID,
  name: "starter",
  width: 8,
  height: 8,
  tileWidth: 32,
  tileHeight: 32,
  tilesetId: null,
  tilesetPxW: 256,
  tilesetPxH: 256,
  layers: [
    { name: "bg0", type: "bg", tiles: emptyTiles, visible: true },
    { name: "bg1", type: "bg", tiles: emptyTiles, visible: true },
    { name: "obj0", type: "obj", tiles: emptyTiles, visible: true },
    { name: "obj1", type: "obj", tiles: emptyTiles, visible: true },
    { name: "overlay", type: "overlay", tiles: emptyTiles, visible: true },
  ],
  animatedTiles: [],
  collisionMask: emptyCollision,
  labels: [],
  createdBy: LOCAL_USER_ID,
  updatedAt: Date.now(),
});

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

export interface MockAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string;
  playerId: string;
  mapId: string;
}

let authState: MockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  userId: LOCAL_USER_ID,
  playerId: LOCAL_PLAYER_ID,
  mapId: LOCAL_MAP_ID,
};

type AuthListener = (state: MockAuthState) => void;
const authListeners = new Set<AuthListener>();

function notifyAuth() {
  for (const fn of authListeners) fn(authState);
}

export function onAuthChange(fn: AuthListener): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function getAuthState(): MockAuthState {
  return authState;
}

export function mockSignIn(): void {
  authState = { ...authState, isAuthenticated: true };
  notifyAuth();
}

export function mockSignOut(): void {
  authState = { ...authState, isAuthenticated: false };
  notifyAuth();
}

// ---------------------------------------------------------------------------
// Mock query / mutation helpers
// ---------------------------------------------------------------------------

export function mockQuery(_queryRef: any, _args?: any): any {
  return undefined;
}

export function mockMutation(_mutationRef: any): (...args: any[]) => Promise<any> {
  return async () => LOCAL_PLAYER_ID;
}

export { store as mockStore };
