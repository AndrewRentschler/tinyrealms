import type { MapData, MapLayerType } from "../types.ts";

/** Convex maps document shape (from schema). */
export interface ConvexMapDoc {
  _id: string;
  name: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesetUrl?: string;
  tilesetPxW: number;
  tilesetPxH: number;
  layers: Array<{
    name: string;
    type: string;
    tiles: string;
    visible: boolean;
    tilesetUrl?: string;
  }>;
  collisionMask: string;
  labels: Array<{ name: string; x: number; y: number; width?: number; height?: number }>;
  animationUrl?: string;
  portals?: unknown[];
  musicUrl?: string;
  ambientSoundUrl?: string;
  weatherMode?: string;
  weatherIntensity?: string;
  weatherRainSfx?: boolean;
  weatherLightningEnabled?: boolean;
  weatherLightningChancePerSec?: number;
  combatEnabled?: boolean;
  combatSettings?: unknown;
  status?: string;
  editors?: unknown[];
  creatorProfileId?: string;
}

/**
 * Convert a Convex map document to client-side MapData.
 */
export function convexMapToMapData(saved: ConvexMapDoc): MapData {
  return {
    id: saved._id,
    name: saved.name,
    width: saved.width,
    height: saved.height,
    tileWidth: saved.tileWidth,
    tileHeight: saved.tileHeight,
    tilesetUrl: saved.tilesetUrl ?? "/assets/tilesets/fantasy-interior.png",
    tilesetPxW: saved.tilesetPxW,
    tilesetPxH: saved.tilesetPxH,
    layers: saved.layers.map((l) => ({
      name: l.name,
      type: l.type as MapLayerType,
      tiles: JSON.parse(l.tiles) as number[],
      visible: l.visible,
      tilesetUrl: l.tilesetUrl,
    })),
    collisionMask: JSON.parse(saved.collisionMask) as boolean[],
    labels: saved.labels.map((l) => ({
      name: l.name,
      x: l.x,
      y: l.y,
      width: l.width ?? 1,
      height: l.height ?? 1,
    })),
    animatedTiles: [],
    animationUrl: saved.animationUrl,
    portals: (saved.portals ?? []) as MapData["portals"],
    musicUrl: saved.musicUrl,
    ambientSoundUrl: saved.ambientSoundUrl,
    weatherMode: saved.weatherMode as MapData["weatherMode"],
    weatherIntensity: saved.weatherIntensity as MapData["weatherIntensity"],
    weatherRainSfx: saved.weatherRainSfx,
    weatherLightningEnabled: saved.weatherLightningEnabled,
    weatherLightningChancePerSec: saved.weatherLightningChancePerSec,
    combatEnabled: saved.combatEnabled,
    combatSettings: saved.combatSettings as MapData["combatSettings"],
    status: saved.status,
    editors: saved.editors?.map((e) => String(e)),
    creatorProfileId: saved.creatorProfileId ? String(saved.creatorProfileId) : undefined,
  };
}
