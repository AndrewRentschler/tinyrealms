/**
 * Map-related types: layers, portals, labels, combat settings.
 */
import type { VisibilityType } from "./visibility.ts";

/** Map layer type: background, object, or overlay. */
export type MapLayerType = "bg" | "obj" | "overlay";

export interface MapLayer {
  name: string;
  type: MapLayerType;
  tiles: number[];
  visible: boolean;
  tilesetUrl?: string;
}

export interface Portal {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetMap: string;
  targetSpawn: string;
  direction?: string;
  transition?: string;
}

export interface MapLabel {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CombatSettings {
  attackRangePx?: number;
  playerAttackCooldownMs?: number;
  npcHitCooldownMs?: number;
  damageVariancePct?: number;
}

export interface AnimatedTileEntry {
  tileIndex: number;
  spriteSheetId: string;
  animation: string;
  speed: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesetUrl: string;
  tilesetPxW: number;
  tilesetPxH: number;
  layers: MapLayer[];
  collisionMask: boolean[];
  labels: MapLabel[];
  animatedTiles: AnimatedTileEntry[];
  animationUrl?: string;
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
  status?: string;
  mapType?: VisibilityType;
  editors?: string[];
  creatorProfileId?: string;
}
