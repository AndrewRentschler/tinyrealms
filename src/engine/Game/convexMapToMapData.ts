import type { MapData } from "../types.ts";

/**
 * Convert a Convex map document to a client-side MapData.
 */
export function convexMapToMapData(saved: Record<string, unknown>): MapData {
  const s = saved as {
    _id: string;
    name: string;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    tilesetUrl?: string;
    tilesetPxW: number;
    tilesetPxH: number;
    layers: Array<{ name: string; type: string; tiles: string; visible: boolean; tilesetUrl?: string }>;
    collisionMask: string;
    labels: Array<{ name: string; x: number; y: number; width?: number; height?: number }>;
    animationUrl?: string;
    portals?: Array<unknown>;
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
  };
  return {
    id: s._id,
    name: s.name,
    width: s.width,
    height: s.height,
    tileWidth: s.tileWidth,
    tileHeight: s.tileHeight,
    tilesetUrl: s.tilesetUrl ?? "/assets/tilesets/fantasy-interior.png",
    tilesetPxW: s.tilesetPxW,
    tilesetPxH: s.tilesetPxH,
    layers: s.layers.map((l) => ({
      name: l.name,
      type: l.type as "bg" | "obj" | "overlay",
      tiles: JSON.parse(l.tiles) as number[],
      visible: l.visible,
      tilesetUrl: l.tilesetUrl,
    })),
    collisionMask: JSON.parse(s.collisionMask) as boolean[],
    labels: s.labels.map((l) => ({
      name: l.name,
      x: l.x,
      y: l.y,
      width: l.width ?? 1,
      height: l.height ?? 1,
    })),
    animatedTiles: [],
    animationUrl: s.animationUrl,
    portals: (s.portals ?? []) as MapData["portals"],
    musicUrl: s.musicUrl,
    ambientSoundUrl: s.ambientSoundUrl,
    weatherMode: s.weatherMode as MapData["weatherMode"],
    weatherIntensity: s.weatherIntensity as MapData["weatherIntensity"],
    weatherRainSfx: s.weatherRainSfx,
    weatherLightningEnabled: s.weatherLightningEnabled,
    weatherLightningChancePerSec: s.weatherLightningChancePerSec,
    combatEnabled: s.combatEnabled,
    combatSettings: s.combatSettings as MapData["combatSettings"],
    status: s.status,
    editors: s.editors?.map((e) => String(e)),
    creatorProfileId: s.creatorProfileId ? String(s.creatorProfileId) : undefined,
  };
}
