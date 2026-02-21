/**
 * Main game class. Manages the PixiJS application, camera, map rendering,
 * entity layer, input, and audio. Composes extracted modules for each concern.
 */
import { Application } from "pixi.js";
import { Camera } from "../Camera.ts";
import { MapRenderer } from "../MapRenderer.ts";
import { EntityLayer } from "../EntityLayer.ts";
import { ObjectLayer } from "../ObjectLayer.ts";
import { WorldItemLayer } from "../WorldItemLayer.ts";
import { WeatherLayer } from "../WeatherLayer.ts";
import { InputManager } from "../InputManager.ts";
import { AudioManager, type SfxHandle } from "../AudioManager.ts";
import { PresenceManager } from "../PresenceManager.ts";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { AppMode, MapData, Portal, ProfileData } from "../types.ts";
import type { IGame } from "./types.ts";

import { seedStaticMaps } from "./seedStaticMaps.ts";
import { loadDefaultMap } from "./loadDefaultMap.ts";
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
import { subscribeToGlobalWeather } from "./subscribeToGlobalWeather.ts";
import { setMode as setModeFn } from "./setMode.ts";
import { update as updateLoop } from "./update.ts";

export class Game implements IGame {
  app: Application;
  camera: Camera;
  mapRenderer!: MapRenderer;
  entityLayer!: EntityLayer;
  objectLayer!: ObjectLayer;
  worldItemLayer!: WorldItemLayer;
  weatherLayer!: WeatherLayer;
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
  initialized = false;
  private unlockHandler: (() => void) | null = null;

  private presenceManager: PresenceManager;

  mapObjectsUnsub: (() => void) | null = null;
  mapObjectsLoading = false;
  mapObjectsFirstCallback = true;
  mapObjectsDirty = false;

  worldItemsUnsub: (() => void) | null = null;
  npcStateUnsub: (() => void) | null = null;
  spriteDefCache: Map<string, unknown> = new Map();
  mapObjectInstanceNameById: Map<string, string> = new Map();

  weatherRainHandle: SfxHandle | null = null;
  weatherRainVolume = 0;
  weatherRainLoading = false;
  globalWeatherUnsub: (() => void) | null = null;
  globalRainyNow = false;

  changingMap = false;
  currentPortals: Portal[] = [];
  currentMapData: MapData | null = null;
  onMapChanged: ((mapName: string) => void) | null = null;
  _portalEmptyWarned?: boolean;

  toggling = false;
  pickingUp = false;
  attacking = false;
  lastAttackAt = 0;
  aggroResolving = false;
  lastAggroTickAt = 0;
  activeCombatNotifications: HTMLDivElement[] = [];

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
    const parent = this.canvas.parentElement!;
    await this.app.init({
      canvas: this.canvas,
      width: parent.clientWidth,
      height: parent.clientHeight,
      backgroundColor: 0x0a0a12,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: false,
    });

    this.mapRenderer = new MapRenderer(this);
    this.objectLayer = new ObjectLayer();
    this.objectLayer.setAudio(this.audio);
    this.worldItemLayer = new WorldItemLayer();
    this.entityLayer = new EntityLayer(this);
    this.weatherLayer = new WeatherLayer();

    this.app.stage.addChild(this.mapRenderer.container);
    this.app.stage.addChild(this.objectLayer.bgContainer);
    this.app.stage.addChild(this.worldItemLayer.container);
    this.app.stage.addChild(this.objectLayer.container);
    this.app.stage.addChild(this.entityLayer.container);
    this.app.stage.addChild(this.objectLayer.overlayContainer);
    this.app.stage.addChild(this.mapRenderer.overlayLayerContainer);
    this.app.stage.addChild(this.weatherLayer.container);
    this.app.stage.sortableChildren = true;

    this.resizeObserver = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      this.app.renderer.resize(w, h);
      this.camera.setViewport(w, h);
    });
    this.resizeObserver.observe(parent);
    this.camera.setViewport(parent.clientWidth, parent.clientHeight);

    this.app.ticker.add(() => updateLoop(this as unknown as Parameters<typeof updateLoop>[0]));

    this.unlockHandler = () => {
      this.audio.unlock();
      document.removeEventListener("click", this.unlockHandler!);
      document.removeEventListener("keydown", this.unlockHandler!);
    };
    document.addEventListener("click", this.unlockHandler);
    document.addEventListener("keydown", this.unlockHandler);

    document.addEventListener("keydown", (e) => {
      if (e.key === "m" || e.key === "M") {
        this.audio.toggleMute();
      }
    });

    this.initialized = true;

    if (!this.isGuest) {
      await seedStaticMaps(this);
    }

    await loadDefaultMap(this);

    const convex = getConvexClient();
    if (!this.isGuest) {
      try {
        await convex.mutation(api.weather.ensureLoop, {});
      } catch (e) {
        console.warn("Global weather loop ensure failed:", e);
      }
    }
    subscribeToGlobalWeather(this);

    if (!this.isGuest) {
      try {
        await convex.mutation(api.presence.cleanup, { staleThresholdMs: 5000 });
      } catch (e) {
        console.warn("Presence cleanup failed (OK on first run):", e);
      }
    }
    this.startPresence();
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

  async changeMap(targetMapName: string, spawnLabel: string, direction?: string): Promise<void> {
    return changeMap(this, targetMapName, spawnLabel, direction);
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
    this.audio.destroy();
    this.resizeObserver?.disconnect();
    this.input.destroy();
    this.app.destroy(true);
  }
}
