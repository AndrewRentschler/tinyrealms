/**
 * Main game class. Manages the PixiJS application, camera, map rendering,
 * entity layer, input, and audio. Composes extracted modules for each concern.
 */
import { Application } from "pixi.js";
import { Camera } from "../Camera.ts";
import { MapRenderer } from "../MapRenderer/index.ts";
import { EntityLayer } from "../EntityLayer/index.ts";
import { ObjectLayer } from "../ObjectLayer/index.ts";
import { WorldItemLayer } from "../WorldItemLayer/index.ts";
import { WeatherLayer } from "../WeatherLayer.ts";
import { DayNightLayer } from "../DayNightLayer.ts";
import { InputManager } from "../InputManager.ts";
import { AudioManager, type SfxHandle } from "../AudioManager/index.ts";
import { PresenceManager } from "../PresenceManager.ts";
import type { AppMode, MapData, Portal, ProfileData } from "../types.ts";
import type { IGame } from "./types.ts";

import { initialize } from "./initializer.ts";
import { changeMap } from "./changeMap.ts";
import { seedMapToConvex } from "./seedMapToConvex.ts";
import { fadeOverlay } from "./fadeOverlay.ts";
import { applyWeatherFromMap } from "./applyWeatherFromMap.ts";
import { loadPlacedObjects } from "./loadPlacedObjects.ts";
import { subscribeToMapObjects } from "./subscribeToMapObjects.ts";
import { loadWorldItems } from "./loadWorldItems.ts";
import { subscribeToWorldItems } from "./subscribeToWorldItems.ts";
import { loadSpriteDefs } from "./loadSpriteDefs.ts";
import { subscribeToNpcState } from "./subscribeToNpcState.ts";
import { setMode as setModeFn } from "./setMode.ts";

export class Game implements IGame {
  app: Application;
  camera: Camera;
  mapRenderer!: MapRenderer;
  globalChunkRenderer!: import("../GlobalChunkRenderer.ts").GlobalChunkRenderer;
  entityLayer!: EntityLayer;
  objectLayer!: ObjectLayer;
  worldItemLayer!: WorldItemLayer;
  weatherLayer!: WeatherLayer;
  dayNightLayer!: DayNightLayer;
  input: InputManager;
  audio: AudioManager;
  mode: AppMode = "play";

  profile: ProfileData;
  currentMapName = "Cozy Cabin";
  get isGuest() {
    return this.profile.role === "guest";
  }

  canvas: HTMLCanvasElement;
  fadeEl: HTMLDivElement | null = null;
  resizeObserver: ResizeObserver | null = null;
  unlockHandler: (() => void) | null = null;
  initialized = false;

  private presenceManager: PresenceManager;

  mapObjectsUnsub: IGame["mapObjectsUnsub"] = null;
  mapObjectsLoading = false;
  mapObjectsFirstCallback = true;
  mapObjectsDirty = false;

  worldItemsUnsub: IGame["worldItemsUnsub"] = null;
  npcStateUnsub: IGame["npcStateUnsub"] = null;
  globalWeatherUnsub: IGame["globalWeatherUnsub"] = null;
  worldTimeUnsub: IGame["worldTimeUnsub"] = null;
  spriteDefCache: Map<string, unknown> = new Map();
  mapObjectInstanceNameById: Map<string, string> = new Map();

  weatherRainHandle: SfxHandle | null = null;
  weatherRainVolume = 0;
  weatherRainLoading = false;
  globalRainyNow = false;
  worldTime: IGame["worldTime"] = null;

  changingMap = false;
  currentPortals: Portal[] = [];
  currentMapData: MapData | null = null;
  onMapChanged: ((mapName: string) => void) | null = null;
  portalEmptyWarned = false;
  portalTransitionInFlight = false;

  toggling = false;
  pickingUp = false;
  attacking = false;
  lastAttackAt = 0;
  aggroResolving = false;
  lastAggroTickAt = 0;
  activeCombatNotifications: HTMLDivElement[] = [];
  accessingStorage = false;
  storagePanel: import("../../ui/StoragePanel.ts").StoragePanel | null = null;

  constructor(canvas: HTMLCanvasElement, profile: ProfileData) {
    this.canvas = canvas;
    this.profile = profile;
    this.app = new Application();
    this.camera = new Camera();
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
    this.presenceManager = new PresenceManager(profile, () => this.isGuest, {
      getCurrentMapName: () => this.currentMapName,
      getPlayerPosition: () => this.entityLayer.getPlayerPosition(),
      isPlayerMoving: () => this.entityLayer.isPlayerMoving(),
      onPresenceList: (presence, localProfileId) =>
        this.entityLayer.updatePresence(presence, localProfileId),
    });
  }

  async init(): Promise<void> {
    await initialize(this);
  }

  async loadMap(mapData: MapData): Promise<void> {
    if (this.mapRenderer) {
      await this.mapRenderer.loadMap(mapData);
    }
  }

  applyWeatherFromMap(mapData: MapData): void {
    applyWeatherFromMap(this, mapData);
  }

  async seedMapToConvex(mapData: MapData): Promise<void> {
    return seedMapToConvex(this, mapData);
  }

  fadeOverlay(fadeIn: boolean): Promise<void> {
    return fadeOverlay(this, fadeIn);
  }

  async loadPlacedObjects(mapName: string): Promise<void> {
    return loadPlacedObjects(this, mapName);
  }

  subscribeToMapObjects(mapName: string, skipFirst = true): void {
    subscribeToMapObjects(this, mapName, skipFirst);
  }

  async loadWorldItems(mapName: string): Promise<void> {
    return loadWorldItems(this, mapName);
  }

  subscribeToWorldItems(mapName: string): void {
    subscribeToWorldItems(this, mapName);
  }

  async loadSpriteDefs(): Promise<void> {
    return loadSpriteDefs(this);
  }

  subscribeToNpcState(mapName: string): void {
    subscribeToNpcState(this, mapName);
  }

  startPresence(): void {
    this.presenceManager.start();
  }

  stopPresence(): void {
    this.presenceManager.stop();
  }

  async changeMap(targetMapName: string, spawnLabel: string, direction?: string, globalCoords?: { x: number; y: number }): Promise<void> {
    return changeMap(this, targetMapName, spawnLabel, direction, globalCoords);
  }

  setMode(mode: AppMode): void {
    setModeFn(this, mode);
  }

  destroy(): void {
    this.stopPresence();
    this.mapObjectsUnsub?.();
    this.mapObjectsUnsub = null;
    this.worldItemsUnsub?.();
    this.worldItemsUnsub = null;
    this.npcStateUnsub?.();
    this.npcStateUnsub = null;
    this.globalWeatherUnsub?.();
    this.globalWeatherUnsub = null;
    this.worldTimeUnsub?.();
    this.worldTimeUnsub = null;
    if (this.unlockHandler) {
      document.removeEventListener("click", this.unlockHandler);
      document.removeEventListener("keydown", this.unlockHandler);
    }
    if (this.weatherRainHandle) {
      this.weatherRainHandle.stop();
      this.weatherRainHandle = null;
      this.weatherRainVolume = 0;
    }
    this.weatherRainLoading = false;
    this.dayNightLayer?.destroy();
    this.globalChunkRenderer?.destroy();
    this.weatherLayer?.destroy();
    // Clean up storage panel if open
    if (this.storagePanel) {
      this.storagePanel.el.remove();
      this.storagePanel = null;
    }
    this.audio.destroy();
    this.resizeObserver?.disconnect();
    this.input.destroy();
    this.app.destroy(true);
  }
}
