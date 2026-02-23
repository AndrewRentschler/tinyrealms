/**
 * Types for Game module composition.
 * IGame is the minimal interface passed to extracted modules to avoid circular imports.
 */
import type { Application } from "pixi.js";
import type { Camera } from "../Camera.ts";
import type { MapRenderer } from "../MapRenderer/index.ts";
import type { EntityLayer } from "../EntityLayer/index.ts";
import type { ObjectLayer } from "../ObjectLayer/index.ts";
import type { WorldItemLayer } from "../WorldItemLayer/index.ts";
import type { WeatherLayer } from "../WeatherLayer.ts";
import type { DayNightLayer } from "../DayNightLayer.ts";
import type { InputManager } from "../InputManager.ts";
import type { AudioManager, SfxHandle } from "../AudioManager/index.ts";
import type { AppMode, MapData, Portal, ProfileData } from "../types.ts";

/** Unsubscribe callback for Convex subscriptions */
export type Unsubscriber = () => void;

export interface WorldTimeState {
  key: "global" | string;
  currentTime: number;
  dayNumber: number;
  timeScale: number;
  isPaused: boolean;
  updatedAt: number;
  lastTickAt: number;
}

export interface IGame {
  app: Application;
  camera: Camera;
  mapRenderer: MapRenderer;
  globalChunkRenderer: import("../GlobalChunkRenderer.ts").GlobalChunkRenderer;
  entityLayer: EntityLayer;
  objectLayer: ObjectLayer;
  worldItemLayer: WorldItemLayer;
  weatherLayer: WeatherLayer;
  dayNightLayer: DayNightLayer;
  input: InputManager;
  audio: AudioManager;
  mode: AppMode;
  profile: ProfileData;
  currentMapName: string;
  currentMapData: MapData | null;
  currentPortals: Portal[];
  readonly isGuest: boolean;
  canvas: HTMLCanvasElement;
  fadeEl: HTMLDivElement | null;
  resizeObserver: ResizeObserver | null;
  unlockHandler: (() => void) | null;
  onMapChanged: ((mapName: string) => void) | null;
  initialized: boolean;

  changingMap: boolean;
  mapObjectsDirty: boolean;
  mapObjectsUnsub: Unsubscriber | null;
  mapObjectsFirstCallback: boolean;
  mapObjectsLoading: boolean;
  worldItemsUnsub: Unsubscriber | null;
  npcStateUnsub: Unsubscriber | null;
  globalWeatherUnsub: Unsubscriber | null;
  worldTimeUnsub: Unsubscriber | null;
  globalRainyNow: boolean;
  worldTime: WorldTimeState | null;

  spriteDefCache: Map<string, unknown>;
  mapObjectInstanceNameById: Map<string, string>;

  weatherRainHandle: SfxHandle | null;
  weatherRainVolume: number;
  weatherRainLoading: boolean;
  lastAppliedWeatherKey?: string;

  portalEmptyWarned: boolean;
  portalTransitionInFlight: boolean;

  toggling: boolean;
  pickingUp: boolean;
  attacking: boolean;
  lastAttackAt: number;
  aggroResolving: boolean;
  lastAggroTickAt: number;
  activeCombatNotifications: HTMLDivElement[];
  accessingStorage?: boolean;
  storagePanel: import("../../ui/StoragePanel.ts").StoragePanel | null;

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
  changeMap(targetMapName: string, spawnLabel: string, direction?: string, globalCoords?: { x: number; y: number }): Promise<void>;
}

export type { MapData };
