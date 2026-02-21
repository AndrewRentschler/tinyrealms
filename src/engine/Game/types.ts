/**
 * Minimal interface for Game methods that need to call back into Game.
 * Used by extracted modules to avoid circular imports.
 */
import type {
  Application,
} from "pixi.js";
import type { Camera } from "../Camera.ts";
import type { MapRenderer } from "../MapRenderer.ts";
import type { EntityLayer } from "../EntityLayer.ts";
import type { ObjectLayer } from "../ObjectLayer.ts";
import type { WorldItemLayer } from "../WorldItemLayer.ts";
import type { WeatherLayer } from "../WeatherLayer.ts";
import type { InputManager } from "../InputManager.ts";
import type { AudioManager, SfxHandle } from "../AudioManager.ts";
import type { MapData, Portal, ProfileData } from "../types.ts";
import type { AppMode } from "../types.ts";

export interface IGame {
  app: Application;
  camera: Camera;
  mapRenderer: MapRenderer;
  entityLayer: EntityLayer;
  objectLayer: ObjectLayer;
  worldItemLayer: WorldItemLayer;
  weatherLayer: WeatherLayer;
  input: InputManager;
  audio: AudioManager;
  mode: AppMode;
  profile: ProfileData;
  currentMapName: string;
  currentMapData: MapData | null;
  currentPortals: Portal[];
  readonly isGuest: boolean;
  changingMap: boolean;
  mapObjectsDirty: boolean;
  spriteDefCache: Map<string, unknown>;
  mapObjectInstanceNameById: Map<string, string>;
  weatherRainHandle: SfxHandle | null;
  weatherRainVolume: number;
  weatherRainLoading: boolean;
  globalRainyNow: boolean;
  canvas: HTMLCanvasElement;
  fadeEl: HTMLDivElement | null;
  onMapChanged: ((mapName: string) => void) | null;
  _portalEmptyWarned?: boolean;

  loadMap(mapData: MapData): Promise<void>;
  applyWeatherFromMap(mapData: MapData): void;
  seedMapToConvex(mapData: MapData): Promise<void>;
  fadeOverlay(fadeIn: boolean): Promise<void>;
  loadPlacedObjects(mapName: string): Promise<void>;
  subscribeToMapObjects(mapName: string, skipFirst?: boolean): void;
  loadWorldItems(mapName: string): Promise<void>;
  subscribeToWorldItems(mapName: string): void;
  loadSpriteDefs(): Promise<void>;
  subscribeToNpcState(mapName: string): void;
  startPresence(): void;
  stopPresence(): void;
  changeMap(targetMapName: string, spawnLabel: string, direction?: string): Promise<void>;
}

export type { MapData };
