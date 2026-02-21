import type { Container, Graphics, Text, Sprite, AnimatedSprite, Texture } from "pixi.js";

/** Minimal item def info for rendering */
export interface WorldItemDefInfo {
  name: string;
  displayName: string;
  type: string;
  rarity: string;
  pickupSoundUrl?: string;
  iconTilesetUrl?: string;
  iconTileX?: number;
  iconTileY?: number;
  iconTileW?: number;
  iconTileH?: number;
  iconSpriteDefName?: string;
  iconSpriteSheetUrl?: string;
  iconSpriteAnimation?: string;
  iconSpriteAnimationSpeed?: number;
  iconSpriteScale?: number;
  iconSpriteFrameWidth?: number;
  iconSpriteFrameHeight?: number;
}

/** A world item instance placed on the map */
export interface WorldItemInstance {
  id: string;             // worldItems._id or local UUID
  itemDefName: string;
  x: number;
  y: number;
  quantity: number;
  respawn?: boolean;
  pickedUpAt?: number;
}

/** Rendered world item entry (container, visual, glow, prompt, bob state) */
export interface RenderedWorldItem {
  id: string;
  defName: string;
  container: Container;
  sprite: Sprite | AnimatedSprite | Graphics; // the visual
  glow: Graphics;
  prompt: Text;
  baseX: number;
  baseY: number;
  bobPhase: number;
  available: boolean;       // false if picked up and not yet respawned
}

/** Context for addItem helper — layer state and caches */
export interface WorldItemLayerAddContext {
  container: Container;
  defCache: Map<string, WorldItemDefInfo>;
  textureCache: Map<string, import("pixi.js").Texture>;
  spriteSheetCache: Map<string, Awaited<ReturnType<typeof import("../SpriteLoader.ts").loadSpriteSheet>>>;
  buildMode: boolean;
}

/** Mutable state for update helper (elapsed, nearestItem updated by update()) */
export interface WorldItemLayerUpdateState {
  elapsed: number;
  rendered: RenderedWorldItem[];
  nearestItem: RenderedWorldItem | null;
}

/** Context for ghost helpers — container and caches */
export interface WorldItemLayerGhostContext {
  container: Container;
  ghostSprite: Sprite | AnimatedSprite | Graphics | null;
  ghostDefName: string | null;
  textureCache: Map<string, import("pixi.js").Texture>;
  spriteSheetCache: Map<string, Awaited<ReturnType<typeof import("../SpriteLoader.ts").loadSpriteSheet>>>;
}
