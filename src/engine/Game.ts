import { Application } from "pixi.js";
import { Camera } from "./Camera.ts";
import { MapRenderer } from "./MapRenderer.ts";
import { EntityLayer } from "./EntityLayer.ts";
import { ObjectLayer } from "./ObjectLayer.ts";
import { WorldItemLayer } from "./WorldItemLayer.ts";
import { WeatherLayer, type WeatherMode } from "./WeatherLayer.ts";
import { InputManager } from "./InputManager.ts";
import { AudioManager, type SfxHandle } from "./AudioManager.ts";
import { PresenceManager } from "./PresenceManager.ts";
import { DEFAULT_ITEM_PICKUP_SFX } from "../config/audio-config.ts";
import {
  COMBAT_ATTACK_KEY,
  COMBAT_ATTACK_KEY_ALT,
  COMBAT_AGGRO_TICK_INTERVAL_MS,
  COMBAT_ATTACK_RANGE_PX,
  COMBAT_CLIENT_MIN_INPUT_COOLDOWN_MS,
  COMBAT_NOTIFICATION_ANIMATION_SECONDS,
  COMBAT_NOTIFICATION_DURATION_MS,
  COMBAT_NOTIFICATION_STACK_SPACING_PX,
  COMBAT_NOTIFICATION_TOP_PX,
  COMBAT_NPC_HIT_COOLDOWN_MS,
  COMBAT_PLAYER_ATTACK_COOLDOWN_MS,
  COMBAT_DEBUG,
} from "../config/combat-config.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { AppMode, MapData, Portal, ProfileData } from "./types.ts";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Main game class. Manages the PixiJS application, camera, map rendering,
 * entity layer, input, and audio. Now profile-aware for multiplayer.
 */
export class Game {
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

  /** The current player profile (from Convex) */
  profile: ProfileData;
  currentMapName = "Cozy Cabin";  // overwritten by profile's mapName on init

  /** True when the player is an unauthenticated guest (read-only mode) */
  get isGuest() { return this.profile.role === "guest"; }

  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private initialized = false;
  private unlockHandler: (() => void) | null = null;

  // Multiplayer
  private presenceManager: PresenceManager;

  // Live map-object subscription (static objects)
  private mapObjectsUnsub: (() => void) | null = null;
  private mapObjectsLoading = false;
  private mapObjectsFirstCallback = true;  // skip the initial fire (already loaded)
  private mapObjectsDirty = false;          // set during build mode when subscription fires; triggers re-subscribe on exit

  // Live world items subscription
  private worldItemsUnsub: (() => void) | null = null;

  // Live NPC state subscription
  private npcStateUnsub: (() => void) | null = null;
  /** Cached sprite definitions for NPC rendering */
  private spriteDefCache: Map<string, any> = new Map();
  /** mapObjectId -> instanceName cache (used to heal stale npcState rows) */
  private mapObjectInstanceNameById: Map<string, string> = new Map();
  private weatherRainHandle: SfxHandle | null = null;
  private weatherRainVolume = 0;
  private weatherRainLoading = false;
  private globalWeatherUnsub: (() => void) | null = null;
  private globalRainyNow = false;

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
      onPresenceList: (presence, localProfileId) => this.entityLayer.updatePresence(presence, localProfileId),
    });
  }

  async init() {
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

    // Now that PixiJS is initialized, create rendering layers
    this.mapRenderer = new MapRenderer(this);
    this.objectLayer = new ObjectLayer();
    this.objectLayer.setAudio(this.audio);
    this.worldItemLayer = new WorldItemLayer();
    this.entityLayer = new EntityLayer(this);
    this.weatherLayer = new WeatherLayer();

    // Add layers to stage
    // Order: map base -> bg objects -> worldItems -> objects + entities -> obj overlays -> map overlays
    this.app.stage.addChild(this.mapRenderer.container);              // base map tiles
    this.app.stage.addChild(this.objectLayer.bgContainer);            // bg-layer objects (behind entities)
    this.app.stage.addChild(this.worldItemLayer.container);           // pickups
    this.app.stage.addChild(this.objectLayer.container);              // obj-layer objects (y-sorted with entities)
    this.app.stage.addChild(this.entityLayer.container);              // player + NPCs
    this.app.stage.addChild(this.objectLayer.overlayContainer);       // overlay-layer objects (above entities)
    this.app.stage.addChild(this.mapRenderer.overlayLayerContainer);  // overlay tiles (above everything)
    this.app.stage.addChild(this.weatherLayer.container);             // weather overlay (screen-space)
    this.app.stage.sortableChildren = true;

    // Resize handling
    this.resizeObserver = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      this.app.renderer.resize(w, h);
      this.camera.setViewport(w, h);
    });
    this.resizeObserver.observe(parent);
    this.camera.setViewport(parent.clientWidth, parent.clientHeight);

    // Main game loop
    this.app.ticker.add(() => {
      this.update();
    });

    // Unlock audio on first user interaction (autoplay policy)
    this.unlockHandler = () => {
      this.audio.unlock();
      document.removeEventListener("click", this.unlockHandler!);
      document.removeEventListener("keydown", this.unlockHandler!);
    };
    document.addEventListener("click", this.unlockHandler);
    document.addEventListener("keydown", this.unlockHandler);

    // Mute toggle with M key
    document.addEventListener("keydown", (e) => {
      if (e.key === "m" || e.key === "M") {
        this.audio.toggleMute();
      }
    });

    this.initialized = true;

    // Seed any static JSON maps that aren't yet in Convex (skip for guests — read-only)
    if (!this.isGuest) {
      await this.seedStaticMaps();
    }

    // Auto-load the default map
    await this.loadDefaultMap();

    // Ensure the global weather scheduler is running, then subscribe so
    // scattered-rain maps can follow the shared on/off signal.
    const convex = getConvexClient();
    if (!this.isGuest) {
      try {
        await convex.mutation(api.weather.ensureLoop, {});
      } catch (e) {
        console.warn("Global weather loop ensure failed:", e);
      }
    }
    this.subscribeToGlobalWeather();

    // Clean up any stale presence rows, then start broadcasting
    // (guests are read-only — skip presence mutations but still subscribe)
    if (!this.isGuest) {
      try {
        const convex = getConvexClient();
        await convex.mutation(api.presence.cleanup, { staleThresholdMs: 5000 });
      } catch (e) {
        console.warn("Presence cleanup failed (OK on first run):", e);
      }
    }
    this.startPresence();
  }

  // ===========================================================================
  // Map loading
  // ===========================================================================

  /** Known static JSON maps that should be seeded into Convex if missing */
  private static readonly STATIC_MAPS = ["cozy-cabin", "camineet", "mage-city", "palma"];

  /**
   * Check each known static map — if it doesn't exist in Convex yet,
   * seed it from the static JSON file. Maps that already exist in Convex
   * are never overwritten — the database is the source of truth once seeded.
   *
   * Static maps ship WITHOUT portals — portals are created in-game via
   * the map editor and stored only in Convex.
   */
  private async seedStaticMaps() {
    const convex = getConvexClient();
    for (const name of Game.STATIC_MAPS) {
      try {
        const existing = await convex.query(api.maps.getByName, { name });
        if (existing) continue; // Already in Convex — don't overwrite

        const resp = await fetch(`/assets/maps/${name}.json`);
        if (!resp.ok) continue;

        const mapData = (await resp.json()) as MapData;
        mapData.portals = mapData.portals ?? [];

        console.log(`Seeding static map "${name}" into Convex...`);
        await this.seedMapToConvex(mapData);
      } catch (err) {
        console.warn(`Failed to seed static map "${name}":`, err);
      }
    }
  }

  private async loadDefaultMap() {
    try {
      let mapData: MapData | null = null;

      // Determine which map to load — use the profile's saved map, or default
      const targetMap = this.profile.mapName || "Cozy Cabin";
      console.log(`Loading map: "${targetMap}" (profile.mapName=${this.profile.mapName})`);

      // 1) Try to load from Convex first (saved edits)
      try {
        const convex = getConvexClient();
        console.log(`[loadDefaultMap] querying Convex for map "${targetMap}"...`);
        const saved = await convex.query(api.maps.getByName, { name: targetMap });
        if (saved) {
          console.log(`[loadDefaultMap] found "${targetMap}" in Convex (id: ${saved._id})`);
          mapData = this.convexMapToMapData(saved);
        } else {
          console.warn(`[loadDefaultMap] Convex returned null for "${targetMap}" — map not found by that name`);
        }
      } catch (convexErr) {
        console.error(
          `[loadDefaultMap] Convex query FAILED for "${targetMap}":`,
          convexErr,
        );
      }

      // 2) Fall back to static JSON file
      if (!mapData) {
        const resp = await fetch(`/assets/maps/${targetMap}.json`);
        if (resp.ok) {
          mapData = (await resp.json()) as MapData;
          mapData.portals = mapData.portals ?? [];
          console.warn(
            `Loaded map "${targetMap}" from static JSON (Convex missing/unavailable)`,
          );
          // Auto-seed to Convex (skip for guests)
          if (!this.isGuest) {
            this.seedMapToConvex(mapData).catch((e) =>
              console.warn("Failed to seed map to Convex:", e),
            );
          }
        } else {
          console.warn(
            `Static JSON not found for map "${targetMap}" (status ${resp.status})`,
          );
        }
      }

      // 3) Ultimate fallback: cozy-cabin static JSON
      if (!mapData && targetMap !== "cozy-cabin") {
        const resp = await fetch("/assets/maps/cozy-cabin.json");
        if (resp.ok) {
          mapData = (await resp.json()) as MapData;
          console.warn(`Fell back to "cozy-cabin" static JSON`);
        } else {
          console.warn(
            `Static fallback map JSON not found (status ${resp.status})`,
          );
        }
      }

      if (!mapData) {
        console.warn("No map could be loaded");
        return;
      }

      await this.loadMap(mapData!);
      this.currentMapName = mapData!.name || "Cozy Cabin";
      this.currentMapData = mapData!;
      this.currentPortals = mapData!.portals ?? [];
      this.applyWeatherFromMap(mapData!);
      console.log(`[Init] Map "${this.currentMapName}" loaded — ${this.currentPortals.length} portals, isGuest=${this.isGuest}`,
        this.currentPortals.map(p => `"${p.name}" at (${p.x},${p.y}) ${p.width}x${p.height} -> ${p.targetMap}`)
      );

      // Tell ObjectLayer the tile size so it can compute door collision tiles
      this.objectLayer.tileWidth = mapData!.tileWidth;
      this.objectLayer.tileHeight = mapData!.tileHeight;

      // Set up door collision callback
      this.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
        for (const t of tiles) {
          if (blocked) {
            this.mapRenderer.setCollisionOverride(t.x, t.y, true);
          } else {
            this.mapRenderer.setCollisionOverride(t.x, t.y, false);
          }
        }
      };

      // Position player — use saved profile position if on this map, else start label
      if (
        this.profile.mapName === this.currentMapName &&
        this.profile.x != null &&
        this.profile.y != null
      ) {
        this.entityLayer.playerX = this.profile.x;
        this.entityLayer.playerY = this.profile.y;
        if (this.profile.direction) {
          this.entityLayer.playerDirection = this.profile.direction as any;
        }
      } else {
        const preferredStartLabel = this.profile.startLabel || "start1";
        const startLabel = mapData!.labels?.find(
          (l: { name: string }) => l.name === preferredStartLabel,
        ) ?? mapData!.labels?.find(
          (l: { name: string }) => l.name === "start1",
        ) ?? mapData!.labels?.[0];
        if (startLabel && this.entityLayer) {
          this.entityLayer.playerX =
            startLabel.x * mapData!.tileWidth + mapData!.tileWidth / 2;
          this.entityLayer.playerY =
            startLabel.y * mapData!.tileHeight + mapData!.tileHeight / 2;
        }
      }

      // Load placed objects from Convex and subscribe to changes
      await this.loadPlacedObjects(this.currentMapName);
      this.subscribeToMapObjects(this.currentMapName);

      // Load and subscribe to world items
      await this.loadWorldItems(this.currentMapName);
      this.subscribeToWorldItems(this.currentMapName);

      // Subscribe to server-authoritative NPC state
      await this.loadSpriteDefs();
      this.subscribeToNpcState(this.currentMapName);

      // Ensure the NPC tick loop is running on the server (skip for guests)
      if (!this.isGuest) {
        try {
          const convex = getConvexClient();
          await convex.mutation(api.npcEngine.ensureLoop, {});
        } catch (e) {
          console.warn("NPC ensureLoop failed (OK on first run):", e);
        }
      }

      // Start background music (use map's musicUrl, fallback to default)
      const musicUrl = mapData!.musicUrl ?? "/assets/audio/cozy.m4a";
      if (musicUrl) {
        this.audio.loadAndPlay(musicUrl);
      }
    } catch (err) {
      console.warn("Failed to load default map:", err);
    }
  }

  // ===========================================================================
  // Map change (multi-map portal transitions)
  // ===========================================================================

  /** Convert a Convex map document to a client-side MapData */
  private convexMapToMapData(saved: any): MapData {
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
      layers: saved.layers.map((l: any) => ({
        name: l.name,
        type: l.type,
        tiles: JSON.parse(l.tiles),
        visible: l.visible,
        tilesetUrl: l.tilesetUrl,
      })),
      collisionMask: JSON.parse(saved.collisionMask),
      labels: saved.labels,
      animatedTiles: [],
      animationUrl: saved.animationUrl,
      portals: saved.portals ?? [],
      musicUrl: saved.musicUrl,
      ambientSoundUrl: saved.ambientSoundUrl,
      weatherMode: (saved as any).weatherMode,
      weatherIntensity: (saved as any).weatherIntensity,
      weatherRainSfx: (saved as any).weatherRainSfx,
      weatherLightningEnabled: (saved as any).weatherLightningEnabled,
      weatherLightningChancePerSec: (saved as any).weatherLightningChancePerSec,
      combatEnabled: saved.combatEnabled,
      combatSettings: (saved as any).combatSettings,
      status: saved.status,
      editors: saved.editors?.map((e: any) => String(e)) ?? [],
      creatorProfileId: saved.creatorProfileId ? String(saved.creatorProfileId) : undefined,
    };
  }

  /** Whether a map change is currently in progress */
  private changingMap = false;

  /** Current portals on the active map (for collision detection) */
  currentPortals: Portal[] = [];

  /** Current map data reference */
  currentMapData: MapData | null = null;

  /**
   * Change to a different map. Handles unloading, loading, fade transition,
   * and resubscribing to all Convex queries.
   */
  async changeMap(targetMapName: string, spawnLabel: string, direction?: string) {
    if (this.changingMap) return;
    this.changingMap = true;
    // Reset the portal-empty warning flag for the new map
    (this as any)._portalEmptyWarned = false;

    console.log(`[MapChange] ${this.currentMapName} -> ${targetMapName} (spawn: ${spawnLabel}, isGuest: ${this.isGuest})`);

    try {
      // 1) Fade out
      console.log("[MapChange] step 1: fade out");
      await this.fadeOverlay(true);

      // 2) Save current position before leaving (skip for guests)
      const convex = getConvexClient();
      if (!this.isGuest) {
        console.log("[MapChange] step 2: saving position");
        const profileId = this.profile._id as Id<"profiles">;
        const pos = this.entityLayer.getPlayerPosition();
        await convex.mutation(api.profiles.savePosition, {
          id: profileId,
          mapName: this.currentMapName,
          x: pos.x,
          y: pos.y,
          direction: pos.direction,
        }).catch(() => {});
      } else {
        console.log("[MapChange] step 2: skipped (guest)");
      }

      // 3) Unsubscribe from current map's data
      console.log("[MapChange] step 3: unsubscribing");
      this.mapObjectsUnsub?.();
      this.mapObjectsUnsub = null;
      this.worldItemsUnsub?.();
      this.worldItemsUnsub = null;
      this.npcStateUnsub?.();
      this.npcStateUnsub = null;

      // 4) Clear rendering layers
      console.log("[MapChange] step 4: clearing layers");
      this.worldItemLayer.clear();
      this.objectLayer.clear();
      this.entityLayer.removeAllPlacedNPCs();

      // 5) Load new map from Convex (or fallback to static JSON)
      console.log("[MapChange] step 5: loading map from Convex...");
      let mapData: MapData | null = null;
      try {
        const saved = await convex.query(api.maps.getByName, { name: targetMapName });
        if (saved) {
          console.log(`[MapChange] step 5: loaded "${targetMapName}" from Convex`);
          mapData = this.convexMapToMapData(saved);
        } else {
          console.log(`[MapChange] step 5: "${targetMapName}" not in Convex, trying static JSON`);
        }
      } catch (convexErr) {
        console.error("[MapChange] step 5: Convex query failed:", convexErr);
      }

      if (!mapData) {
        // Try static JSON fallback and seed it into Convex
        try {
          const resp = await fetch(`/assets/maps/${targetMapName}.json`);
          if (resp.ok) {
            mapData = (await resp.json()) as MapData;
            mapData.portals = mapData.portals ?? [];
            console.log(`[MapChange] step 5: loaded "${targetMapName}" from static JSON`);
            // Auto-seed to Convex so future loads come from there (skip for guests)
            if (!this.isGuest) {
              this.seedMapToConvex(mapData).catch((e) =>
                console.warn("Failed to seed map to Convex:", e),
              );
            }
          } else {
            console.warn(
              `[MapChange] step 5: static JSON not found for "${targetMapName}" (status ${resp.status})`,
            );
          }
        } catch (fetchErr) {
          console.error("[MapChange] step 5: static JSON fetch failed:", fetchErr);
        }
      }

      if (!mapData) {
        console.warn(`[MapChange] ABORT: map "${targetMapName}" not found anywhere`);
        await this.fadeOverlay(false);
        this.changingMap = false;
        return;
      }

      console.log(`[MapChange] step 6: loadMap (portals: ${(mapData.portals ?? []).length}, labels: ${(mapData.labels ?? []).length})`);
      await this.loadMap(mapData);
      this.currentMapName = mapData.name;
      this.currentMapData = mapData;
      this.currentPortals = mapData.portals ?? [];
      this.applyWeatherFromMap(mapData);

      // Clear collision overrides from previous map and set tile size
      this.mapRenderer.clearAllCollisionOverrides();
      this.objectLayer.tileWidth = mapData.tileWidth;
      this.objectLayer.tileHeight = mapData.tileHeight;
      this.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
        for (const t of tiles) {
          this.mapRenderer.setCollisionOverride(t.x, t.y, blocked);
        }
      };

      // 6) Position player at spawn label
      const spawn = mapData.labels?.find((l) => l.name === spawnLabel) ?? mapData.labels?.[0];
      console.log(`[MapChange] step 7: spawn label="${spawnLabel}" found=${!!spawn} pos=${spawn ? `(${spawn.x},${spawn.y})` : "none"}`);
      if (spawn) {
        this.entityLayer.playerX = spawn.x * mapData.tileWidth + mapData.tileWidth / 2;
        this.entityLayer.playerY = spawn.y * mapData.tileHeight + mapData.tileHeight / 2;
      }
      if (direction) {
        this.entityLayer.playerDirection = direction as any;
      }

      // 7) Reload objects and subscribe
      console.log("[MapChange] step 8: loading objects/items/NPCs");
      await this.loadPlacedObjects(this.currentMapName);
      this.subscribeToMapObjects(this.currentMapName);

      await this.loadWorldItems(this.currentMapName);
      this.subscribeToWorldItems(this.currentMapName);

      await this.loadSpriteDefs();
      this.subscribeToNpcState(this.currentMapName);

      // 8) Restart presence on new map
      console.log("[MapChange] step 9: restarting presence");
      this.stopPresence();
      this.startPresence();

      // 9) Start NPC loop (skip for guests — they can't trigger mutations)
      if (!this.isGuest) {
        await convex.mutation(api.npcEngine.ensureLoop, {}).catch(() => {});
      }

      // 10) Switch music if the new map has a different track
      const newMusic = mapData.musicUrl ?? "/assets/audio/cozy.m4a";
      this.audio.loadAndPlay(newMusic);

      // 11) Notify editor / chat of map change
      this.onMapChanged?.(this.currentMapName);

      // 12) Fade in
      console.log("[MapChange] step 10: fade in — SUCCESS");
      await this.fadeOverlay(false);
    } catch (err) {
      console.error("[MapChange] FAILED at some step:", err);
      await this.fadeOverlay(false);
    }

    this.changingMap = false;
  }

  /** Callback for UI panels to know when the map changes */
  onMapChanged: ((mapName: string) => void) | null = null;

  /** Seed a static JSON map into Convex (so future loads come from there) */
  private async seedMapToConvex(mapData: MapData) {
    const convex = getConvexClient();
    const existing = await convex.query(api.maps.getByName, { name: mapData.name });
    if (existing) {
      console.warn(
        `Skipping seed for "${mapData.name}" (already exists in Convex)`,
      );
      return;
    }
    const profileId = this.profile._id as Id<"profiles">;
    await convex.mutation(api.maps.saveFullMap, {
      profileId,
      name: mapData.name,
      width: mapData.width,
      height: mapData.height,
      tileWidth: mapData.tileWidth,
      tileHeight: mapData.tileHeight,
      tilesetUrl: mapData.tilesetUrl,
      tilesetPxW: mapData.tilesetPxW,
      tilesetPxH: mapData.tilesetPxH,
      layers: mapData.layers.map((l) => ({
        name: l.name,
        type: l.type as "bg" | "obj" | "overlay",
        tiles: JSON.stringify(l.tiles),
        visible: l.visible,
        tilesetUrl: l.tilesetUrl,
      })),
      collisionMask: JSON.stringify(mapData.collisionMask),
      labels: mapData.labels.map((l) => ({
        name: l.name,
        x: l.x,
        y: l.y,
        width: l.width ?? 1,
        height: l.height ?? 1,
      })),
      portals: (mapData.portals ?? []).map((p) => ({
        name: p.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        targetMap: p.targetMap,
        targetSpawn: p.targetSpawn,
        direction: p.direction,
        transition: p.transition,
      })),
      ...(mapData.animationUrl ? { animationUrl: mapData.animationUrl } : {}),
      musicUrl: mapData.musicUrl,
      weatherMode: mapData.weatherMode,
      weatherIntensity: mapData.weatherIntensity,
      weatherRainSfx: mapData.weatherRainSfx,
      weatherLightningEnabled: mapData.weatherLightningEnabled,
      weatherLightningChancePerSec: mapData.weatherLightningChancePerSec,
      combatEnabled: mapData.combatEnabled,
      combatSettings: mapData.combatSettings,
      status: mapData.status ?? "published",
      // Static maps are seeded as "system" maps
      mapType: "system",
    } as any);
    console.log(`Map "${mapData.name}" seeded to Convex as system map`);
  }

  // ---------------------------------------------------------------------------
  // Fade overlay for transitions
  // ---------------------------------------------------------------------------

  private fadeEl: HTMLDivElement | null = null;

  private fadeOverlay(fadeIn: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (!this.fadeEl) {
        this.fadeEl = document.createElement("div");
        this.fadeEl.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" +
          "pointer-events:none;z-index:9999;transition:opacity 0.4s ease;opacity:0;";
        this.canvas.parentElement?.appendChild(this.fadeEl);
      }

      if (fadeIn) {
        this.fadeEl.style.opacity = "1";
      } else {
        this.fadeEl.style.opacity = "0";
      }

      setTimeout(resolve, 420); // slightly longer than transition
    });
  }

  // ===========================================================================
  // Game loop
  // ===========================================================================

  update() {
    if (!this.initialized) return;

    const dt = this.app.ticker.deltaMS / 1000;

    if (this.mode === "play") {
      this.entityLayer.update(dt, this.input);
      this.checkPortals();

      // Update world items (glow, bob, proximity)
      this.worldItemLayer.update(
        dt,
        this.entityLayer.playerX,
        this.entityLayer.playerY,
      );

      // Update toggleable object interaction (glow + prompt)
      this.objectLayer.updateToggleInteraction(
        dt,
        this.entityLayer.playerX,
        this.entityLayer.playerY,
      );

      // Handle item pickup with E key (only if no toggleable object is near)
      // Guests can't interact — skip all mutations
      if (!this.isGuest) {
        this.handleCombatInput();
        this.handleHostileAggroTick();
        if (!this.objectLayer.getNearestToggleableId()) {
          this.handleItemPickup();
        } else {
          this.handleObjectToggle();
        }
      }
    }

    // In build mode, still update world items for visual feedback (but no pickup)
    if (this.mode === "build") {
      this.worldItemLayer.update(dt, -9999, -9999); // no proximity in build mode
    }

    // Update spatial audio (ambient sounds fade by distance from player)
    this.objectLayer.updateAmbientVolumes(
      this.entityLayer.playerX,
      this.entityLayer.playerY,
    );

    // Apply camera transform
    this.camera.update();
    this.app.stage.x = -this.camera.x + this.camera.viewportW / 2;
    this.app.stage.y = -this.camera.y + this.camera.viewportH / 2;
    if (this.currentMapData) {
      this.applyWeatherFromMap(this.currentMapData);
    }
    this.weatherLayer.update(
      dt,
      this.camera.x,
      this.camera.y,
      this.camera.viewportW,
      this.camera.viewportH,
    );

    // In build mode, allow panning with keyboard
    if (this.mode === "build") {
      const panSpeed = 300;
      if (this.input.isDown("ArrowLeft") || this.input.isDown("a")) {
        this.camera.x -= panSpeed * dt;
      }
      if (this.input.isDown("ArrowRight") || this.input.isDown("d")) {
        this.camera.x += panSpeed * dt;
      }
      if (this.input.isDown("ArrowUp") || this.input.isDown("w")) {
        this.camera.y -= panSpeed * dt;
      }
      if (this.input.isDown("ArrowDown") || this.input.isDown("s")) {
        this.camera.y += panSpeed * dt;
      }
    }

    // Clear just-pressed keys at the very end of the frame, so all systems
    // (entity movement, NPC dialogue, toggle, pickup) can read them first.
    this.input.endFrame();
  }

  private applyWeatherFromMap(mapData: MapData) {
    const configuredMode = mapData.weatherMode ?? "clear";
    const mode: WeatherMode =
      configuredMode === "rainy"
        ? "rainy"
        : configuredMode === "scattered_rain"
          ? (this.globalRainyNow ? "rainy" : "clear")
          : "clear";
    this.weatherLayer?.setMode(mode);
    this.weatherLayer?.setConfig({
      intensity: mapData.weatherIntensity ?? "medium",
      lightningEnabled: !!mapData.weatherLightningEnabled,
      lightningChancePerSec: mapData.weatherLightningChancePerSec ?? 0.03,
    });
    this.updateWeatherAudioFromMap(mapData, mode);
  }

  private updateWeatherAudioFromMap(mapData: MapData, mode: WeatherMode) {
    const intensity = mapData.weatherIntensity ?? "medium";
    const intensityBase = intensity === "light" ? 0.22 : intensity === "heavy" ? 0.55 : 0.38;
    const wantsRainSfx = mode === "rainy" && !!mapData.weatherRainSfx;
    const targetVolume = wantsRainSfx ? intensityBase : 0;

    if (wantsRainSfx && !this.weatherRainHandle && this.audio.isStarted) {
      if (!this.weatherRainLoading) {
        this.weatherRainLoading = true;
        void this.audio.playAmbient("/assets/audio/rain.mp3", 0).then((handle) => {
          this.weatherRainLoading = false;
          if (!handle) return;
          this.weatherRainHandle = handle;
          this.weatherRainVolume = 0;
        }).catch(() => {
          this.weatherRainLoading = false;
        });
      }
    }

    if (this.weatherRainHandle) {
      const lerp = 0.08;
      this.weatherRainVolume += (targetVolume - this.weatherRainVolume) * lerp;
      this.weatherRainHandle.setVolume(Math.max(0, Math.min(1, this.weatherRainVolume)));
      if (!wantsRainSfx && this.weatherRainVolume < 0.01) {
        this.weatherRainHandle.stop();
        this.weatherRainHandle = null;
        this.weatherRainVolume = 0;
      }
    }
  }

  /** Check if the player is standing in a portal zone and trigger map change */
  private checkPortals() {
    if (this.changingMap) {
      // Uncomment below for verbose debugging:
      // console.log("[Portal:check] skipped — changingMap is true");
      return;
    }
    if (this.currentPortals.length === 0) {
      // Only log once per map to avoid spam
      if (!(this as any)._portalEmptyWarned) {
        console.warn("[Portal:check] No portals on current map:", this.currentMapName);
        (this as any)._portalEmptyWarned = true;
      }
      return;
    }
    if (!this.currentMapData) return;

    const px = this.entityLayer.playerX;
    const py = this.entityLayer.playerY;
    const tw = this.currentMapData.tileWidth;
    const th = this.currentMapData.tileHeight;

    // Convert player position to tile coordinates
    const ptx = px / tw;
    const pty = py / th;

    for (const portal of this.currentPortals) {
      if (
        ptx >= portal.x &&
        ptx < portal.x + portal.width &&
        pty >= portal.y &&
        pty < portal.y + portal.height
      ) {
        // Player entered the portal zone!
        console.log(`[Portal] HIT "${portal.name}" -> map "${portal.targetMap}" spawn "${portal.targetSpawn}" | isGuest=${this.isGuest}`);
        this.changeMap(portal.targetMap, portal.targetSpawn, portal.direction);
        return; // only trigger one portal per frame
      }
    }
  }

  setMode(mode: AppMode) {
    const wasBuild = this.mode === "build";
    this.mode = mode;
    if (mode === "build") {
      this.camera.stopFollowing();
      // Show portal zones so the editor can see them
      this.mapRenderer.setPortalOverlayVisible(true);
    } else {
      this.mapRenderer.setPortalOverlayVisible(false);
      this.mapRenderer.setCollisionOverlayVisible(false);
      this.mapRenderer.highlightLayer(-1); // restore all layers to full opacity
      this.mapRenderer.hidePortalGhost();
      this.mapRenderer.hideLabelGhost();
      this.mapRenderer.hideTileGhost();

      // When leaving build mode, if objects changed (editor saved), re-subscribe
      // so we pick up new Convex _ids for freshly placed objects.
      // Existing objects keep their IDs (bulkSave patches in place) so toggle
      // state is preserved.
      if (wasBuild && this.mapObjectsDirty) {
        this.subscribeToMapObjects(this.currentMapName, /* skipFirst */ false);
      }

      // Also reload world items so freshly placed items get their Convex _ids
      // (needed for pickup to work — pickup sends the _id to the mutation).
      if (wasBuild) {
        this.loadWorldItems(this.currentMapName);
        this.subscribeToWorldItems(this.currentMapName);
      }
    }
  }

  // ===========================================================================
  // Multiplayer presence
  // ===========================================================================

  private startPresence() {
    this.presenceManager.start();
  }

  private stopPresence() {
    this.presenceManager.stop();
  }

  // ===========================================================================
  // Placed objects
  // ===========================================================================

  /** Load sprite definitions from Convex (cached for NPC creation) */
  private async loadSpriteDefs() {
    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.spriteDefinitions.list, {});
      this.spriteDefCache = new Map(defs.map((d) => [d.name, d]));
    } catch (err) {
      console.warn("Failed to load sprite definitions:", err);
    }
  }

  private async loadPlacedObjects(mapName: string) {
    try {
      const convex = getConvexClient();

      const defs = await convex.query(api.spriteDefinitions.list, {});
      const objs = await convex.query(api.mapObjects.listByMap, { mapName });
      this.refreshMapObjectInstanceCache(objs as any[]);

      if (objs.length === 0 || defs.length === 0) return;

      console.log(`Loading ${objs.length} placed objects for map "${mapName}"`);

      const defByName = new Map(defs.map((d) => [d.name, d]));

      // Only load static (non-NPC) objects here.
      // NPCs are managed by the npcState subscription.
      const staticObjs: {
        id: string;
        spriteDefName: string;
        x: number;
        y: number;
        layer: number;
        isOn?: boolean;
      }[] = [];
      const staticDefs: import("./ObjectLayer.ts").SpriteDefInfo[] = [];
      const defsSeen = new Set<string>();

      for (const o of objs) {
        const def = defByName.get(o.spriteDefName);
        if (!def) continue;

        // Skip NPCs — they're handled by npcState subscription
        if (def.category === "npc") continue;

        staticObjs.push({
          id: o._id,
          spriteDefName: o.spriteDefName,
          x: o.x,
          y: o.y,
          layer: o.layer ?? 0,
          isOn: (o as any).isOn,
        });
        if (!defsSeen.has(def.name)) {
          defsSeen.add(def.name);
          staticDefs.push({
            name: def.name,
            spriteSheetUrl: def.spriteSheetUrl,
            defaultAnimation: def.defaultAnimation,
            animationSpeed: def.animationSpeed,
            scale: def.scale,
            frameWidth: def.frameWidth,
            frameHeight: def.frameHeight,
            ambientSoundUrl: def.ambientSoundUrl ?? undefined,
            ambientSoundRadius: def.ambientSoundRadius ?? undefined,
            ambientSoundVolume: def.ambientSoundVolume ?? undefined,
            interactSoundUrl: def.interactSoundUrl ?? undefined,
            toggleable: def.toggleable ?? undefined,
            onAnimation: def.onAnimation ?? undefined,
            offAnimation: def.offAnimation ?? undefined,
            onSoundUrl: def.onSoundUrl ?? undefined,
            isDoor: def.isDoor ?? undefined,
            doorClosedAnimation: def.doorClosedAnimation ?? undefined,
            doorOpeningAnimation: def.doorOpeningAnimation ?? undefined,
            doorOpenAnimation: def.doorOpenAnimation ?? undefined,
            doorClosingAnimation: def.doorClosingAnimation ?? undefined,
            doorOpenSoundUrl: def.doorOpenSoundUrl ?? undefined,
            doorCloseSoundUrl: def.doorCloseSoundUrl ?? undefined,
          });
        }
      }

      if (staticObjs.length > 0) {
        await this.objectLayer.loadAll(staticObjs, staticDefs);
      }
    } catch (err) {
      console.warn("Failed to load placed objects:", err);
    }
  }

  // ===========================================================================
  // Live map-object subscription
  // ===========================================================================

  private subscribeToMapObjects(mapName: string, skipFirst = true) {
    this.mapObjectsUnsub?.();

    const convex = getConvexClient();

    // Subscribe to mapObjects table — fires whenever objects are added/removed/moved
    this.mapObjectsFirstCallback = skipFirst;
    this.mapObjectsDirty = false;
    this.mapObjectsUnsub = convex.onUpdate(
      api.mapObjects.listByMap,
      { mapName },
      (objs) => {
        this.refreshMapObjectInstanceCache(objs as any[]);
        // Skip the initial callback when we already loaded objects above
        if (this.mapObjectsFirstCallback) {
          this.mapObjectsFirstCallback = false;
          return;
        }
        // Skip if we're already processing (prevent re-entrant loads)
        if (this.mapObjectsLoading) return;
        // In build mode, mark dirty so we re-subscribe when returning to play.
        if (this.mode === "build") {
          this.mapObjectsDirty = true;
          return;
        }
        console.log(`[MapObjects] Subscription fired: ${objs.length} objects`);
        this.reloadPlacedObjects(mapName, objs);
      },
      (err) => {
        console.warn("MapObjects subscription error:", err);
      },
    );
  }

  /**
   * Called by the subscription when placed objects change.
   * Clears current static objects, then re-renders from data.
   * NPCs are NOT handled here — they come from the npcState subscription.
   */
  private async reloadPlacedObjects(
    mapName: string,
    objs: { _id: string; spriteDefName: string; x: number; y: number; layer?: number; isOn?: boolean; instanceName?: string }[],
  ) {
    this.mapObjectsLoading = true;
    try {
      const convex = getConvexClient();
      this.refreshMapObjectInstanceCache(objs as any[]);

      // Fetch latest sprite definitions (may have changed too)
      const defs = await convex.query(api.spriteDefinitions.list, {});
      const defByName = new Map(defs.map((d) => [d.name, d]));

      // Update the sprite def cache for NPC rendering
      this.spriteDefCache = new Map(defs.map((d) => [d.name, d]));

      // Clear existing placed static objects only
      this.objectLayer.clear();

      const staticObjs: { id: string; spriteDefName: string; x: number; y: number; layer: number; isOn?: boolean }[] = [];
      const staticDefs: import("./ObjectLayer.ts").SpriteDefInfo[] = [];
      const defsSeen = new Set<string>();

      for (const o of objs) {
        const def = defByName.get(o.spriteDefName);
        if (!def) continue;

        // Skip NPCs — handled by npcState subscription
        if (def.category === "npc") continue;

        staticObjs.push({
          id: o._id, spriteDefName: o.spriteDefName, x: o.x, y: o.y,
          layer: o.layer ?? 0, isOn: (o as any).isOn,
        });
        if (!defsSeen.has(def.name)) {
          defsSeen.add(def.name);
          staticDefs.push({
            name: def.name,
            spriteSheetUrl: def.spriteSheetUrl,
            defaultAnimation: def.defaultAnimation,
            animationSpeed: def.animationSpeed,
            scale: def.scale,
            frameWidth: def.frameWidth,
            frameHeight: def.frameHeight,
            ambientSoundUrl: def.ambientSoundUrl ?? undefined,
            ambientSoundRadius: def.ambientSoundRadius ?? undefined,
            ambientSoundVolume: def.ambientSoundVolume ?? undefined,
            interactSoundUrl: def.interactSoundUrl ?? undefined,
            toggleable: def.toggleable ?? undefined,
            onAnimation: def.onAnimation ?? undefined,
            offAnimation: def.offAnimation ?? undefined,
            onSoundUrl: def.onSoundUrl ?? undefined,
            isDoor: def.isDoor ?? undefined,
            doorClosedAnimation: def.doorClosedAnimation ?? undefined,
            doorOpeningAnimation: def.doorOpeningAnimation ?? undefined,
            doorOpenAnimation: def.doorOpenAnimation ?? undefined,
            doorClosingAnimation: def.doorClosingAnimation ?? undefined,
            doorOpenSoundUrl: def.doorOpenSoundUrl ?? undefined,
            doorCloseSoundUrl: def.doorCloseSoundUrl ?? undefined,
          });
        }
      }

      if (staticObjs.length > 0) {
        // Clear collision overrides before reloading (doors will re-register)
        this.mapRenderer.clearAllCollisionOverrides();
        await this.objectLayer.loadAll(staticObjs, staticDefs);
      }
    } catch (err) {
      console.warn("Failed to reload placed objects:", err);
    }
    this.mapObjectsLoading = false;
  }

  // ===========================================================================
  // World items (pickups placed on the map)
  // ===========================================================================

  /** Map Convex worldItem docs (with _id) to WorldItemInstance (with id) */
  private mapWorldItems(items: any[]) {
    return items.map((i: any) => ({
      id: i._id ?? i.id,
      itemDefName: i.itemDefName,
      x: i.x,
      y: i.y,
      quantity: i.quantity,
      respawn: i.respawn,
      pickedUpAt: i.pickedUpAt,
    }));
  }

  private async loadWorldItems(mapName: string) {
    try {
      const convex = getConvexClient();
      const result = await convex.query(api.worldItems.listByMap, { mapName });
      this.worldItemLayer.clear();
      await this.worldItemLayer.loadAll(this.mapWorldItems(result.items), result.defs);
      console.log(`[WorldItems] Loaded ${result.items.length} items on "${mapName}"`);
    } catch (err) {
      console.warn("Failed to load world items:", err);
    }
  }

  private subscribeToWorldItems(mapName: string) {
    this.worldItemsUnsub?.();
    const convex = getConvexClient();
    let firstFire = true;
    this.worldItemsUnsub = convex.onUpdate(
      api.worldItems.listByMap,
      { mapName },
      async (result: any) => {
        if (firstFire) { firstFire = false; return; }
        // In build mode, preserve the editor's unsaved draft state.
        if (this.mode === "build") return;
        console.log(`[WorldItems] Subscription fired: ${result.items.length} items`);
        this.worldItemLayer.clear();
        await this.worldItemLayer.loadAll(this.mapWorldItems(result.items), result.defs);
      },
      (err: any) => {
        console.warn("WorldItems subscription error:", err);
      },
    );
  }

  // ===========================================================================
  // Toggleable object interaction
  // ===========================================================================

  private toggling = false;
  private async handleObjectToggle() {
    if (this.toggling) return;
    const nearestId = this.objectLayer.getNearestToggleableId();
    if (!nearestId) return;
    const ePressed = this.input.wasJustPressed("e") || this.input.wasJustPressed("E");
    if (!ePressed) return;
    if (this.entityLayer.inDialogue) return;

    this.toggling = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(api.mapObjects.toggle, {
        id: nearestId as any,
      });
      if (result.success && typeof result.isOn === "boolean") {
        // Optimistically update the visual
        this.objectLayer.applyToggle(nearestId, result.isOn);
      }
    } catch (err) {
      console.warn("Toggle failed:", err);
    }
    this.toggling = false;
  }

  private pickingUp = false;
  private async handleItemPickup() {
    if (this.pickingUp) return;
    const nearestId = this.worldItemLayer.getNearestItemId();
    if (!nearestId) return;
    if (!(this.input.wasJustPressed("e") || this.input.wasJustPressed("E"))) return;

    // Don't pick up if in dialogue
    if (this.entityLayer.inDialogue) return;

    this.pickingUp = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(api.worldItems.pickup, {
        profileId: this.profile._id as any,
        worldItemId: nearestId as any,
      });
      if (result.success && result.itemName && typeof result.quantity === "number") {
        const name = this.worldItemLayer.getNearestItemName() ?? result.itemName;
        console.log(`[Pickup] Got ${result.quantity}x ${name}`);
        const pickupSfx =
          this.worldItemLayer.getNearestItemPickupSoundUrl() ||
          result.pickupSoundUrl ||
          DEFAULT_ITEM_PICKUP_SFX;
        this.audio.playOneShot(pickupSfx, 0.7);
        // Show a brief pickup notification
        this.showPickupNotification(`+${result.quantity} ${name}`);
        // Optimistically update: fade if respawning, remove if not
        this.worldItemLayer.markPickedUp(nearestId, !!result.respawns);
        // Update the local profile inventory so CharacterPanel reflects the change
        const existing = this.profile.items.find((i) => i.name === result.itemName);
        if (existing) {
          existing.quantity += result.quantity;
        } else {
          this.profile.items.push({ name: result.itemName, quantity: result.quantity });
        }
      } else {
        console.log(`[Pickup] Failed: ${result.reason}`);
      }
    } catch (err) {
      console.warn("Pickup failed:", err);
    }
    this.pickingUp = false;
  }

  private attacking = false;
  private lastAttackAt = 0;
  private aggroResolving = false;
  private lastAggroTickAt = 0;
  private activeCombatNotifications: HTMLDivElement[] = [];
  private async handleCombatInput() {
    if (this.attacking) return;
    if (!this.currentMapData?.combatEnabled) return;
    if (this.entityLayer.inDialogue) return;

    const attackPressed =
      this.input.wasJustPressed(COMBAT_ATTACK_KEY) ||
      this.input.wasJustPressed(COMBAT_ATTACK_KEY_ALT);
    if (!attackPressed) return;
    if (COMBAT_DEBUG) console.log("[CombatDebug:client] F pressed", {
      mapName: this.currentMapName,
      combatEnabled: !!this.currentMapData?.combatEnabled,
      playerX: Math.round(this.entityLayer.playerX),
      playerY: Math.round(this.entityLayer.playerY),
      inDialogue: this.entityLayer.inDialogue,
      isGuest: this.isGuest,
      settings: this.currentMapData?.combatSettings ?? null,
    });
    const now = Date.now();
    const playerCooldownMs =
      this.currentMapData?.combatSettings?.playerAttackCooldownMs ??
      COMBAT_PLAYER_ATTACK_COOLDOWN_MS;
    const npcHitCooldownMs =
      this.currentMapData?.combatSettings?.npcHitCooldownMs ??
      COMBAT_NPC_HIT_COOLDOWN_MS;
    const effectiveCooldownMs = Math.max(
      COMBAT_CLIENT_MIN_INPUT_COOLDOWN_MS,
      Math.round(playerCooldownMs),
      Math.round(npcHitCooldownMs),
    );
    if (now - this.lastAttackAt < effectiveCooldownMs) {
      if (COMBAT_DEBUG) console.log("[CombatDebug:client] blocked by local cooldown", {
        elapsedMs: now - this.lastAttackAt,
        cooldownMs: effectiveCooldownMs,
      });
      return;
    }
    this.lastAttackAt = now;

    this.attacking = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation((api as any).mechanics.combat.attackNearestHostile, {
        profileId: this.profile._id as any,
        mapName: this.currentMapName,
        x: this.entityLayer.playerX,
        y: this.entityLayer.playerY,
      });

      if (!result?.success) {
        if (COMBAT_DEBUG) console.log("[CombatDebug:client] attack rejected", result);
        this.showCombatNotification(result?.reason ?? "No target in range.", "#ffcc66");
        return;
      }
      if (COMBAT_DEBUG) console.log("[CombatDebug:client] attack accepted", result);

      const dealt = Number(result.dealt ?? 0);
      const took = Number(result.took ?? 0);
      const targetName = String(result.targetName ?? "Enemy");
      this.showCombatNotification(`You hit ${targetName} for ${dealt}`, "#ff6666");

      // Flash the hostile NPC that was hit and play hit sound
      if (result.targetInstanceName) {
        const hitNpc = this.entityLayer.getNpcByInstanceName(String(result.targetInstanceName));
        hitNpc?.playHitEffect();
        this.audio.playOneShot("/assets/audio/hit.mp3", 0.7);
      }

      if (took > 0) {
        this.showCombatNotification(`${targetName} hits you for ${took}`, "#ff9b66");
        this.entityLayer.playPlayerHitEffect();
      }
      if (result.defeated) {
        const xp = Number(result.xpGained ?? 0);
        this.showCombatNotification(`${targetName} defeated! +${xp} XP`, "#66ff99");
      } else {
        const hp = Number(result.targetHp ?? 0);
        const max = Number(result.targetMaxHp ?? 0);
        this.showCombatNotification(`${targetName} HP ${hp}/${max}`, "#ffb3b3");
      }
      if (Array.isArray(result.droppedLoot) && result.droppedLoot.length > 0) {
        const first = result.droppedLoot[0];
        this.showCombatNotification(`Loot dropped: ${first.itemDefName}`, "#99e6ff");
      }
      // Keep local profile HUD in sync with server patches from combat exchange.
      if (typeof took === "number" && took >= 0) {
        this.profile.stats.hp = Math.max(0, this.profile.stats.hp - took);
      }
      if (result.defeated && typeof result.xpGained === "number") {
        this.profile.stats.xp += result.xpGained;
      }
    } catch (err) {
      console.warn("Combat attack failed:", err);
      if (COMBAT_DEBUG) console.log("[CombatDebug:client] attack exception", {
        message: (err as any)?.message ?? String(err),
      });
      const range = this.currentMapData?.combatSettings?.attackRangePx ?? COMBAT_ATTACK_RANGE_PX;
      this.showCombatNotification(
        `Attack failed (range ${range}px)`,
        "#ffcc66",
      );
    } finally {
      this.attacking = false;
    }
  }

  private async handleHostileAggroTick() {
    if (this.aggroResolving) return;
    if (!this.currentMapData?.combatEnabled) return;
    if (this.entityLayer.inDialogue) return;

    const now = Date.now();
    if (now - this.lastAggroTickAt < COMBAT_AGGRO_TICK_INTERVAL_MS) return;
    this.lastAggroTickAt = now;

    this.aggroResolving = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(
        (api as any).mechanics.combat.resolveAggroAttack,
        {
          profileId: this.profile._id as any,
          mapName: this.currentMapName,
          x: this.entityLayer.playerX,
          y: this.entityLayer.playerY,
        },
      );
      if (!result?.success) return;
      const attacker = String(result.attackerName ?? "Hostile");
      const took = Number(result.took ?? 0);
      if (took > 0) {
        this.showCombatNotification(`${attacker} attacks you for ${took}`, "#ff9966");
        this.entityLayer.playPlayerHitEffect();
      }
      if (typeof result.playerHp === "number") {
        this.profile.stats.hp = Math.max(0, Number(result.playerHp));
      }
    } catch (err) {
      console.warn("Aggro combat tick failed:", err);
    } finally {
      this.aggroResolving = false;
    }
  }

  /** Show a brief floating text notification for item pickup */
  private showPickupNotification(text: string) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #44ff88;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-family: Inter, sans-serif;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      animation: pickupFadeUp 1.5s ease-out forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1600);
  }

  /** Show a brief floating text notification for combat events */
  private showCombatNotification(text: string, color = "#ff6666") {
    const div = document.createElement("div");
    div.textContent = text;
    this.activeCombatNotifications.push(div);
    const idx = this.activeCombatNotifications.length - 1;
    const topPx =
      COMBAT_NOTIFICATION_TOP_PX +
      idx * COMBAT_NOTIFICATION_STACK_SPACING_PX;
    div.style.cssText = `
      position: fixed;
      top: ${topPx}px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.82);
      color: ${color};
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: Inter, sans-serif;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      animation: pickupFadeUp ${COMBAT_NOTIFICATION_ANIMATION_SECONDS}s ease-out forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => {
      const i = this.activeCombatNotifications.indexOf(div);
      if (i >= 0) this.activeCombatNotifications.splice(i, 1);
      div.remove();
      // Re-pack remaining notifications to avoid overlap gaps.
      this.activeCombatNotifications.forEach((el, n) => {
        el.style.top = `${COMBAT_NOTIFICATION_TOP_PX + n * COMBAT_NOTIFICATION_STACK_SPACING_PX}px`;
      });
    }, COMBAT_NOTIFICATION_DURATION_MS);
  }

  // ===========================================================================
  // Server-authoritative NPC state subscription
  // ===========================================================================

  private refreshMapObjectInstanceCache(
    objs: Array<{ _id: string; instanceName?: string | null }>,
  ) {
    this.mapObjectInstanceNameById.clear();
    for (const o of objs) {
      if (typeof o.instanceName === "string" && o.instanceName.length > 0) {
        this.mapObjectInstanceNameById.set(String(o._id), o.instanceName);
      }
    }
  }

  private subscribeToNpcState(mapName: string) {
    this.npcStateUnsub?.();

    const convex = getConvexClient();

    this.npcStateUnsub = convex.onUpdate(
      api.npcEngine.listByMap,
      { mapName },
      (states) => {
        // Pass server NPC states + sprite defs to EntityLayer
        this.entityLayer.updateNpcStates(
          states.map((s) => ({
            _id: s._id,
            mapObjectId: s.mapObjectId as string,
            spriteDefName: s.spriteDefName,
            instanceName:
              s.instanceName ??
              this.mapObjectInstanceNameById.get(String(s.mapObjectId)) ??
              undefined,
            currentHp: (s as any).currentHp,
            maxHp: (s as any).maxHp,
            x: s.x,
            y: s.y,
            vx: s.vx,
            vy: s.vy,
            direction: s.direction,
            speed: s.speed,
            wanderRadius: s.wanderRadius,
          })),
          this.spriteDefCache,
        );
      },
      (err) => {
        console.warn("NPC state subscription error:", err);
      },
    );
  }

  private subscribeToGlobalWeather() {
    this.globalWeatherUnsub?.();
    const convex = getConvexClient();
    this.globalWeatherUnsub = convex.onUpdate(
      api.weather.getGlobal,
      {},
      (state) => {
        this.globalRainyNow = !!(state as any)?.rainyNow;
      },
      (err) => {
        console.warn("Global weather subscription error:", err);
      },
    );
  }

  async loadMap(mapData: MapData) {
    if (this.mapRenderer) {
      await this.mapRenderer.loadMap(mapData);
    }
  }

  destroy() {
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
