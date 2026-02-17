// Shared engine type definitions

export type Direction = "up" | "down" | "left" | "right";

export interface TilePosition {
  tileX: number;
  tileY: number;
}

export interface WorldPosition {
  x: number;
  y: number;
}

export interface MapLayer {
  name: string;
  type: "bg" | "obj" | "overlay";
  tiles: number[]; // flat array, index = y * width + x
  visible: boolean;
  /** Optional per-layer tileset override; falls back to MapData.tilesetUrl. */
  tilesetUrl?: string;
}

export interface Portal {
  name: string;
  x: number;          // tile coords
  y: number;
  width: number;      // tiles
  height: number;
  targetMap: string;
  targetSpawn: string;
  direction?: string;  // facing direction on arrival
  transition?: string; // "fade" | "instant"
}

export interface CombatSettings {
  attackRangePx?: number;
  playerAttackCooldownMs?: number;
  npcHitCooldownMs?: number;
  damageVariancePct?: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number; // in tiles
  height: number; // in tiles
  tileWidth: number; // px
  tileHeight: number; // px
  tilesetUrl: string;
  tilesetPxW: number;
  tilesetPxH: number;
  layers: MapLayer[];
  collisionMask: boolean[];
  labels: MapLabel[];
  animatedTiles: AnimatedTileEntry[];
  /** URL to an animation descriptor JSON (spritesheet + tile placements) */
  animationUrl?: string;
  // Multi-map fields
  portals: Portal[];
  musicUrl?: string;
  ambientSoundUrl?: string;
  weatherMode?: "clear" | "rainy" | "scattered_rain";
  weatherIntensity?: "light" | "medium" | "heavy";
  weatherRainSfx?: boolean;
  weatherLightningEnabled?: boolean;
  weatherLightningChancePerSec?: number;
  combatEnabled?: boolean;
  combatSettings?: CombatSettings;
  status?: string;        // "draft" | "published"
  mapType?: string;       // "public" | "private" | "system"
  editors?: string[];     // profile IDs that can edit this map
  creatorProfileId?: string;
}

/** Descriptor loaded from the animationUrl JSON file */
export interface AnimationDescriptor {
  spritesheet: string;    // URL to PixiJS spritesheet JSON
  defaultSpeed: number;   // animation speed (0–1 range for PixiJS)
  tileWidth: number;      // px per tile
  tileHeight: number;
  tiles: AnimationTilePlacement[];
}

export interface AnimationTilePlacement {
  x: number;              // tile column
  y: number;              // tile row
  animation: string;      // animation sequence name in the spritesheet
  speed?: number;         // override per-tile speed
}

export interface MapLabel {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedTileEntry {
  tileIndex: number;
  spriteSheetId: string;
  animation: string;
  speed: number;
}

export interface PlayerData {
  id: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  direction: Direction;
  animation: string;
}

export interface PresenceData {
  profileId: string;
  name: string;
  spriteUrl: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  animation: string;
  lastSeen: number;
}

export interface ProfileData {
  _id: string;
  name: string;
  spriteUrl: string;
  color: string;
  role: string;  // "superuser" | "player"
  stats: {
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    level: number;
    xp: number;
  };
  items: { name: string; quantity: number }[];
  npcsChatted: string[];
  mapName?: string;
  startLabel?: string;
  x?: number;
  y?: number;
  direction?: string;
  createdAt: number;
}

export type AppMode = "play" | "build" | "sprite-edit" | "npc-edit" | "item-edit" | "quest-edit";
