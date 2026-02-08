import { Application } from "pixi.js";
import { Camera } from "./Camera.ts";
import { MapRenderer } from "./MapRenderer.ts";
import { EntityLayer } from "./EntityLayer.ts";
import { ObjectLayer } from "./ObjectLayer.ts";
import { WorldItemLayer } from "./WorldItemLayer.ts";
import { InputManager } from "./InputManager.ts";
import { AudioManager } from "./AudioManager.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { AppMode, MapData, Portal, ProfileData, PresenceData } from "./types.ts";
import type { Id } from "../../convex/_generated/dataModel";

const PRESENCE_INTERVAL_MS = 200;  // how often to push position to Convex
const SAVE_INTERVAL_MS = 10_000;   // how often to persist position to profile

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
  input: InputManager;
  audio: AudioManager;
  mode: AppMode = "play";

  /** The current player profile (from Convex) */
  profile: ProfileData;
  currentMapName = "cozy-cabin";

  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private initialized = false;
  private unlockHandler: (() => void) | null = null;

  // Multiplayer
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private presenceUnsub: (() => void) | null = null;

  // Live map-object subscription (static objects)
  private mapObjectsUnsub: (() => void) | null = null;
  private mapObjectsLoading = false;
  private mapObjectsFirstCallback = true;  // skip the initial fire (already loaded)

  // Live world items subscription
  private worldItemsUnsub: (() => void) | null = null;

  // Live NPC state subscription
  private npcStateUnsub: (() => void) | null = null;
  /** Cached sprite definitions for NPC rendering */
  private spriteDefCache: Map<string, any> = new Map();

  constructor(canvas: HTMLCanvasElement, profile: ProfileData) {
    this.canvas = canvas;
    this.profile = profile;
    this.app = new Application();
    this.camera = new Camera();
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
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

    // Add layers to stage
    // Order: map base -> worldItems -> objects -> entities -> map overlays (above entities)
    this.app.stage.addChild(this.mapRenderer.container);        // base map tiles
    this.app.stage.addChild(this.worldItemLayer.container);      // pickups
    this.app.stage.addChild(this.objectLayer.container);         // placed objects
    this.app.stage.addChild(this.entityLayer.container);         // player + NPCs
    this.app.stage.addChild(this.mapRenderer.overlayLayerContainer); // overlay tiles (above entities)
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

    // Seed any static JSON maps that aren't yet in Convex
    await this.seedStaticMaps();

    // Auto-load the default map
    await this.loadDefaultMap();

    // Clean up any stale presence rows, then start broadcasting
    try {
      const convex = getConvexClient();
      await convex.mutation(api.presence.cleanup, { staleThresholdMs: 5000 });
    } catch (e) {
      console.warn("Presence cleanup failed (OK on first run):", e);
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
   * or if the static JSON disagrees with the stored version (e.g. dimensions
   * changed after a conversion fix), re-seed from the JSON source of truth.
   */
  private async seedStaticMaps() {
    const convex = getConvexClient();
    for (const name of Game.STATIC_MAPS) {
      try {
        const resp = await fetch(`/assets/maps/${name}.json`);
        if (!resp.ok) continue;

        const mapData = (await resp.json()) as MapData;
        mapData.portals = mapData.portals ?? [];

        const existing = await convex.query(api.maps.getByName, { name: mapData.name });
        if (existing) {
          // Re-seed if dimensions, tileset, or animationUrl changed
          const needsUpdate =
            existing.width !== mapData.width ||
            existing.height !== mapData.height ||
            existing.tilesetUrl !== mapData.tilesetUrl ||
            (existing as any).animationUrl !== mapData.animationUrl;
          if (!needsUpdate) continue;
          console.log(
            `Static map "${name}" dimensions changed ` +
            `(${existing.width}x${existing.height} → ${mapData.width}x${mapData.height}), re-seeding...`,
          );
        } else {
          console.log(`Seeding static map "${name}" into Convex...`);
        }

        await this.seedMapToConvex(mapData);
      } catch (err) {
        console.warn(`Failed to seed static map "${name}":`, err);
      }
    }
  }

  private async loadDefaultMap() {
    try {
      let mapData: MapData | null = null;

      // Determine which map to load — use the profile's saved map, or default to cozy-cabin
      const targetMap = this.profile.mapName || "cozy-cabin";
      console.log(`Loading map: "${targetMap}" (profile.mapName=${this.profile.mapName})`);

      // 1) Try to load from Convex first (saved edits)
      try {
        const convex = getConvexClient();
        const saved = await convex.query(api.maps.getByName, { name: targetMap });
        if (saved) {
          console.log(`Loading map "${targetMap}" from Convex (saved version)`);
          mapData = this.convexMapToMapData(saved);
        }
      } catch (convexErr) {
        console.warn("Could not load map from Convex, falling back to JSON:", convexErr);
      }

      // 2) Fall back to static JSON file
      if (!mapData) {
        const resp = await fetch(`/assets/maps/${targetMap}.json`);
        if (resp.ok) {
          mapData = (await resp.json()) as MapData;
          mapData.portals = mapData.portals ?? [];
          console.log(`Loaded map "${targetMap}" from static JSON`);
          // Auto-seed to Convex
          this.seedMapToConvex(mapData).catch((e) =>
            console.warn("Failed to seed map to Convex:", e),
          );
        }
      }

      // 3) Ultimate fallback: cozy-cabin static JSON
      if (!mapData && targetMap !== "cozy-cabin") {
        const resp = await fetch("/assets/maps/cozy-cabin.json");
        if (resp.ok) {
          mapData = (await resp.json()) as MapData;
          console.log("Fell back to cozy-cabin static JSON");
        }
      }

      if (!mapData) {
        console.warn("No map could be loaded");
        return;
      }

      await this.loadMap(mapData!);
      this.currentMapName = mapData!.name || "cozy-cabin";
      this.currentMapData = mapData!;
      this.currentPortals = mapData!.portals ?? [];

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
        const startLabel = mapData!.labels?.find(
          (l: { name: string }) => l.name === "start1",
        );
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

      // Ensure the NPC tick loop is running on the server
      try {
        const convex = getConvexClient();
        await convex.mutation(api.npcEngine.ensureLoop, {});
      } catch (e) {
        console.warn("NPC ensureLoop failed (OK on first run):", e);
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
      })),
      collisionMask: JSON.parse(saved.collisionMask),
      labels: saved.labels,
      animatedTiles: [],
      animationUrl: saved.animationUrl,
      portals: saved.portals ?? [],
      musicUrl: saved.musicUrl,
      ambientSoundUrl: saved.ambientSoundUrl,
      combatEnabled: saved.combatEnabled,
      status: saved.status,
      isHub: saved.isHub,
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

    console.log(`[MapChange] ${this.currentMapName} -> ${targetMapName} (spawn: ${spawnLabel})`);

    try {
      // 1) Fade out
      await this.fadeOverlay(true);

      // 2) Save current position before leaving
      const convex = getConvexClient();
      const profileId = this.profile._id as Id<"profiles">;
      const pos = this.entityLayer.getPlayerPosition();
      await convex.mutation(api.profiles.savePosition, {
        id: profileId,
        mapName: this.currentMapName,
        x: pos.x,
        y: pos.y,
        direction: pos.direction,
      }).catch(() => {});

      // 3) Unsubscribe from current map's data
      this.mapObjectsUnsub?.();
      this.mapObjectsUnsub = null;
      this.worldItemsUnsub?.();
      this.worldItemsUnsub = null;
      this.npcStateUnsub?.();
      this.npcStateUnsub = null;

      // 4) Clear rendering layers
      this.worldItemLayer.clear();
      this.objectLayer.clear();
      this.entityLayer.removeAllPlacedNPCs();

      // 5) Load new map from Convex (or fallback to static JSON)
      let mapData: MapData | null = null;
      const saved = await convex.query(api.maps.getByName, { name: targetMapName });
      if (saved) {
        mapData = this.convexMapToMapData(saved);
      } else {
        // Try static JSON fallback and seed it into Convex
        try {
          const resp = await fetch(`/assets/maps/${targetMapName}.json`);
          if (resp.ok) {
            mapData = (await resp.json()) as MapData;
            mapData.portals = mapData.portals ?? [];
            console.log(`Loaded map "${targetMapName}" from static JSON, seeding to Convex...`);
            // Auto-seed to Convex so future loads come from there
            this.seedMapToConvex(mapData).catch((e) =>
              console.warn("Failed to seed map to Convex:", e),
            );
          }
        } catch { /* ignore */ }
      }

      if (!mapData) {
        console.warn(`Map "${targetMapName}" not found`);
        await this.fadeOverlay(false);
        this.changingMap = false;
        return;
      }
      await this.loadMap(mapData);
      this.currentMapName = mapData.name;
      this.currentMapData = mapData;
      this.currentPortals = mapData.portals ?? [];

      // 6) Position player at spawn label
      const spawn = mapData.labels?.find((l) => l.name === spawnLabel) ?? mapData.labels?.[0];
      if (spawn) {
        this.entityLayer.playerX = spawn.x * mapData.tileWidth + mapData.tileWidth / 2;
        this.entityLayer.playerY = spawn.y * mapData.tileHeight + mapData.tileHeight / 2;
      }
      if (direction) {
        this.entityLayer.playerDirection = direction as any;
      }

      // 7) Reload objects and subscribe
      await this.loadPlacedObjects(this.currentMapName);
      this.subscribeToMapObjects(this.currentMapName);

      await this.loadWorldItems(this.currentMapName);
      this.subscribeToWorldItems(this.currentMapName);

      await this.loadSpriteDefs();
      this.subscribeToNpcState(this.currentMapName);

      // 8) Restart presence on new map
      this.stopPresence();
      this.startPresence();

      // 9) Start NPC loop
      await convex.mutation(api.npcEngine.ensureLoop, {}).catch(() => {});

      // 10) Switch music if the new map has a different track
      const newMusic = mapData.musicUrl ?? "/assets/audio/cozy.m4a";
      this.audio.loadAndPlay(newMusic);

      // 11) Notify editor / chat of map change
      this.onMapChanged?.(this.currentMapName);

      // 12) Fade in
      await this.fadeOverlay(false);
    } catch (err) {
      console.warn("Failed to change map:", err);
      await this.fadeOverlay(false);
    }

    this.changingMap = false;
  }

  /** Callback for UI panels to know when the map changes */
  onMapChanged: ((mapName: string) => void) | null = null;

  /** Seed a static JSON map into Convex (so future loads come from there) */
  private async seedMapToConvex(mapData: MapData) {
    const convex = getConvexClient();
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
      combatEnabled: mapData.combatEnabled,
      status: mapData.status ?? "published",
    });
    console.log(`Map "${mapData.name}" seeded to Convex`);
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
      if (!this.objectLayer.getNearestToggleableId()) {
        this.handleItemPickup();
      } else {
        this.handleObjectToggle();
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

  /** Check if the player is standing in a portal zone and trigger map change */
  private checkPortals() {
    if (this.changingMap || this.currentPortals.length === 0) return;
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
        console.log(`[Portal] "${portal.name}" -> map "${portal.targetMap}" spawn "${portal.targetSpawn}"`);
        this.changeMap(portal.targetMap, portal.targetSpawn, portal.direction);
        return; // only trigger one portal per frame
      }
    }
  }

  setMode(mode: AppMode) {
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
    }
  }

  // ===========================================================================
  // Multiplayer presence
  // ===========================================================================

  private startPresence() {
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    console.log(`[Presence] Starting for profile "${this.profile.name}" (${profileId}) on map "${this.currentMapName}"`);

    // 1) Push local position + velocity periodically
    this.presenceTimer = setInterval(() => {
      const pos = this.entityLayer.getPlayerPosition();
      convex
        .mutation(api.presence.update, {
          profileId,
          mapName: this.currentMapName,
          x: pos.x,
          y: pos.y,
          vx: pos.vx,
          vy: pos.vy,
          direction: pos.direction,
          animation: this.entityLayer.isPlayerMoving() ? "walk" : "idle",
          spriteUrl: this.profile.spriteUrl,
          name: this.profile.name,
        })
        .catch((err) => console.warn("Presence update failed:", err));
    }, PRESENCE_INTERVAL_MS);

    // 2) Subscribe to presence of others on this map
    this.presenceUnsub = convex.onUpdate(
      api.presence.listByMap,
      { mapName: this.currentMapName },
      (presenceList) => {
        console.log(`[Presence] Received ${presenceList.length} entries`);
        const mapped: PresenceData[] = presenceList.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          spriteUrl: p.spriteUrl,
          x: p.x,
          y: p.y,
          vx: p.vx ?? 0,
          vy: p.vy ?? 0,
          direction: p.direction,
          animation: p.animation,
          lastSeen: p.lastSeen,
        }));
        this.entityLayer.updatePresence(mapped, profileId);
      },
      (err) => {
        console.warn("Presence subscription error:", err);
      },
    );

    // 3) Save position to profile periodically (for resume on reload)
    //    Also heartbeat the profile claim so it doesn't go stale
    this.saveTimer = setInterval(() => {
      const pos = this.entityLayer.getPlayerPosition();
      convex
        .mutation(api.profiles.savePosition, {
          id: profileId,
          mapName: this.currentMapName,
          x: pos.x,
          y: pos.y,
          direction: pos.direction,
        })
        .catch((err) => console.warn("Position save failed:", err));
      convex
        .mutation(api.profiles.heartbeat, { id: profileId })
        .catch(() => {});
    }, SAVE_INTERVAL_MS);

    // 4) Clean up presence on tab close
    window.addEventListener("beforeunload", this.handleUnload);
  }

  private handleUnload = () => {
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    // Best-effort: fire-and-forget cleanup
    convex.mutation(api.presence.remove, { profileId }).catch(() => {});
    convex.mutation(api.profiles.release, { id: profileId }).catch(() => {});
  };

  private stopPresence() {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.presenceUnsub) {
      this.presenceUnsub();
      this.presenceUnsub = null;
    }
    window.removeEventListener("beforeunload", this.handleUnload);

    // Remove presence row and release profile
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    convex.mutation(api.presence.remove, { profileId }).catch(() => {});
    convex.mutation(api.profiles.release, { id: profileId }).catch(() => {});
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

  private subscribeToMapObjects(mapName: string) {
    this.mapObjectsUnsub?.();

    const convex = getConvexClient();

    // Subscribe to mapObjects table — fires whenever objects are added/removed/moved
    this.mapObjectsFirstCallback = true;
    this.mapObjectsUnsub = convex.onUpdate(
      api.mapObjects.listByMap,
      { mapName },
      (objs) => {
        // Skip the initial callback — we already loaded objects above
        if (this.mapObjectsFirstCallback) {
          this.mapObjectsFirstCallback = false;
          return;
        }
        // Skip if we're already processing (prevent re-entrant loads)
        if (this.mapObjectsLoading) return;
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
    objs: { _id: string; spriteDefName: string; x: number; y: number; layer?: number; isOn?: boolean }[],
  ) {
    this.mapObjectsLoading = true;
    try {
      const convex = getConvexClient();

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
          });
        }
      }

      if (staticObjs.length > 0) {
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
      if (result.success) {
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
      if (result.success) {
        const name = this.worldItemLayer.getNearestItemName() ?? result.itemName;
        console.log(`[Pickup] Got ${result.quantity}x ${name}`);
        // Show a brief pickup notification
        this.showPickupNotification(`+${result.quantity} ${name}`);
        // The subscription will update the layer, but we can also optimistically hide it
        this.worldItemLayer.markPickedUp(nearestId, false);
      } else {
        console.log(`[Pickup] Failed: ${result.reason}`);
      }
    } catch (err) {
      console.warn("Pickup failed:", err);
    }
    this.pickingUp = false;
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

  // ===========================================================================
  // Server-authoritative NPC state subscription
  // ===========================================================================

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
            instanceName: s.instanceName ?? undefined,
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
    if (this.unlockHandler) {
      document.removeEventListener("click", this.unlockHandler);
      document.removeEventListener("keydown", this.unlockHandler);
    }
    this.audio.destroy();
    this.resizeObserver?.disconnect();
    this.input.destroy();
    this.app.destroy(true);
  }
}
