import { Container, Sprite, Texture, Rectangle, Graphics } from "pixi.js";
import type { Game } from "./Game.ts";
import type { MapData, MapLayer } from "./types.ts";
import { TileAnimator } from "./animations/TileAnimator.ts";
import { renderLayer } from "./MapRenderer/renderLayer.ts";
import { loadTilesetTexture } from "./MapRenderer/loadTileset.ts";
import { renderGrid } from "./MapRenderer/grid.ts";
import {
  isCollision as isCollisionAt,
  setCollisionOverride as setCollisionOverrideAt,
  clearCollisionOverride as clearCollisionOverrideAt,
  clearAllCollisionOverrides as clearAllCollisionOverridesAt,
  worldToTile as worldToTileAt,
  tileToWorld as tileToWorldAt,
} from "./MapRenderer/collision.ts";
import {
  COLLISION_OVERLAY_Z_INDEX,
  HIGHLIGHT_LAYER_ACTIVE_ALPHA,
  HIGHLIGHT_LAYER_INACTIVE_ALPHA,
  LABEL_OVERLAY_Z_INDEX,
  OVERLAY_LAYER_Z_INDEX,
  PORTAL_OVERLAY_Z_INDEX,
} from "./MapRenderer/constants.ts";
import {
  renderCollisionOverlay as renderCollisionOverlayFn,
  renderPortalOverlay as renderPortalOverlayFn,
  renderLabelOverlay as renderLabelOverlayFn,
} from "./MapRenderer/overlays.ts";
import { GhostManager } from "./MapRenderer/ghosts.ts";

/**
 * Renders a multi-layer tile map using PixiJS.
 * Supports configurable tile sizes and multiple layers (bg, obj, overlay).
 */
export class MapRenderer {
  container: Container;
  private game: Game;
  private mapData: MapData | null = null;
  private layerContainers: Container[] = [];
  private tilesetTextures = new Map<string, Texture>();
  /** Container for overlay-type map layers (renders above entities) */
  overlayLayerContainer: Container;
  private portalOverlay: Container;
  private labelOverlay: Container;
  private collisionOverlay: Graphics | null = null;
  private collisionOverlayVisible = false;
  /** Runtime collision overrides (e.g. open doors). Key = "tileX,tileY" */
  private collisionOverrides = new Map<string, boolean>();
  private overlaysVisible = false;
  private tileAnimator: TileAnimator | null = null;
  private ghostManager: GhostManager;

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.label = "map";
    this.overlayLayerContainer = new Container();
    this.overlayLayerContainer.label = "map-overlays";
    this.overlayLayerContainer.zIndex = OVERLAY_LAYER_Z_INDEX;
    this.overlayLayerContainer.sortableChildren = true;
    this.portalOverlay = new Container();
    this.portalOverlay.label = "portal-overlay";
    this.portalOverlay.zIndex = PORTAL_OVERLAY_Z_INDEX;
    this.portalOverlay.visible = false;
    this.labelOverlay = new Container();
    this.labelOverlay.label = "label-overlay";
    this.labelOverlay.zIndex = LABEL_OVERLAY_Z_INDEX;
    this.labelOverlay.visible = false;
    this.ghostManager = new GhostManager({
      mapData: null,
      container: this.container,
      tilesetTextures: this.tilesetTextures,
    });
  }

  async loadMap(mapData: MapData) {
    // Tear down previous animated tiles
    if (this.tileAnimator) {
      this.tileAnimator.destroy();
      this.tileAnimator = null;
    }

    // Clear existing — null out overlay/ghost refs so they're recreated on demand
    this.container.removeChildren();
    this.layerContainers = [];
    this.ghostManager.reset();
    this.ghostManager.setMapData(mapData);
    this.gridOverlay = null;
    this.mapData = mapData;

    // Load all tilesets referenced by map + per-layer overrides
    const urls = new Set<string>();
    urls.add(mapData.tilesetUrl);
    for (const layer of mapData.layers) {
      urls.add(layer.tilesetUrl ?? mapData.tilesetUrl);
    }
    await Promise.all([...urls].map((url) => loadTilesetTexture(this.tilesetTextures, url)));

    // Render each layer
    this.overlayLayerContainer.removeChildren();
    for (const layer of mapData.layers) {
      const layerContainer = new Container();
      layerContainer.label = layer.name;
      layerContainer.visible = layer.visible;
      const layerTilesetUrl = layer.tilesetUrl ?? mapData.tilesetUrl;
      const layerTilesetTexture = this.tilesetTextures.get(layerTilesetUrl);

      renderLayer(layerContainer, layer, mapData, layerTilesetTexture);
      this.layerContainers.push(layerContainer);

      if (layer.type === "overlay") {
        // Overlay layers go in a separate container that sits above entities
        this.overlayLayerContainer.addChild(layerContainer);
      } else {
        this.container.addChild(layerContainer);
      }
    }

    // Load animated tiles if the map has an animation descriptor
    if (mapData.animationUrl) {
      this.tileAnimator = new TileAnimator();
      this.container.addChild(this.tileAnimator.container);
      // Load async — tiles render progressively after static tiles are visible
      this.tileAnimator.load(mapData.animationUrl).catch((err) =>
        console.warn("Failed to load animated tiles:", err),
      );
    }

    // Add overlays (always in tree, toggled via setPortalOverlayVisible)
    this.portalOverlay.removeChildren();
    this.labelOverlay.removeChildren();
    this.container.addChild(this.labelOverlay);
    this.container.addChild(this.portalOverlay);
    this.portalOverlay.visible = this.overlaysVisible;
    this.labelOverlay.visible = this.overlaysVisible;
    this.renderPortalOverlay();
    this.renderLabelOverlay();

    // Collision overlay (lazy — rendered on demand)
    this.collisionOverlay = null;

    this.container.sortableChildren = true;

    // Re-show grid if it was active before reload
    if (this.gridVisible) {
      this.renderGrid();
    }

    // Re-show collision overlay if it was active before reload
    if (this.collisionOverlayVisible) {
      this.renderCollisionOverlay();
    }
  }

  /** Update a single tile in a layer (for editor) */
  setTile(layerIndex: number, x: number, y: number, tileIndex: number) {
    if (!this.mapData) return;

    const layer = this.mapData.layers[layerIndex];
    const idx = y * this.mapData.width + x;
    layer.tiles[idx] = tileIndex;

    // Re-render this layer
    const container = this.layerContainers[layerIndex];
    const tilesetUrl = layer.tilesetUrl ?? this.mapData.tilesetUrl;
    const tilesetTexture = this.tilesetTextures.get(tilesetUrl);
    if (container) {
      container.removeChildren();
      renderLayer(container, layer, this.mapData, tilesetTexture);
    }
  }

  /** Toggle layer visibility */
  setLayerVisible(layerIndex: number, visible: boolean) {
    const container = this.layerContainers[layerIndex];
    if (container) {
      container.visible = visible;
    }
  }

  /**
   * Highlight a specific layer by dimming all others.
   * Pass -1 to reset all layers to full opacity.
   */
  highlightLayer(activeIndex: number) {
    for (let i = 0; i < this.layerContainers.length; i++) {
      this.layerContainers[i].alpha = (activeIndex < 0 || i === activeIndex) ? HIGHLIGHT_LAYER_ACTIVE_ALPHA : HIGHLIGHT_LAYER_INACTIVE_ALPHA;
    }
  }

  /** Check collision at a tile coordinate */
  isCollision(tileX: number, tileY: number): boolean {
    return isCollisionAt(this.mapData, this.collisionOverrides, tileX, tileY);
  }

  /** Set a runtime collision override for a tile (used by doors) */
  setCollisionOverride(tileX: number, tileY: number, blocked: boolean) {
    setCollisionOverrideAt(this.collisionOverrides, tileX, tileY, blocked);
  }

  /** Remove a runtime collision override (reverts to base collision mask) */
  clearCollisionOverride(tileX: number, tileY: number) {
    clearCollisionOverrideAt(this.collisionOverrides, tileX, tileY);
  }

  /** Remove all runtime collision overrides */
  clearAllCollisionOverrides() {
    clearAllCollisionOverridesAt(this.collisionOverrides);
  }

  /** Convert world position to tile coordinates */
  worldToTile(worldX: number, worldY: number) {
    return worldToTileAt(this.mapData, worldX, worldY);
  }

  /** Convert tile coordinates to world position (center of tile) */
  tileToWorld(tileX: number, tileY: number) {
    return tileToWorldAt(this.mapData, tileX, tileY);
  }

  getMapData() {
    return this.mapData;
  }

  // =========================================================================
  // Collision overlay
  // =========================================================================

  /** Show or hide the collision tile overlay */
  setCollisionOverlayVisible(visible: boolean) {
    this.collisionOverlayVisible = visible;
    if (visible) {
      this.renderCollisionOverlay();
    } else if (this.collisionOverlay) {
      this.collisionOverlay.visible = false;
    }
  }

  /** Redraw the collision overlay from current collisionMask and overrides */
  renderCollisionOverlay() {
    if (!this.mapData) return;
    const prev = this.collisionOverlay;
    this.collisionOverlay = renderCollisionOverlayFn(
      this.collisionOverlay,
      this.mapData,
      this.collisionOverrides
    );
    if (prev === null && this.collisionOverlay) {
      this.collisionOverlay.label = "collision-overlay";
      this.collisionOverlay.zIndex = COLLISION_OVERLAY_Z_INDEX;
      this.container.addChild(this.collisionOverlay);
    }
  }

  // =========================================================================
  // Portal overlay
  // =========================================================================

  /** Show or hide portal and label zones on the map */
  setPortalOverlayVisible(visible: boolean) {
    this.overlaysVisible = visible;
    this.portalOverlay.visible = visible;
    this.labelOverlay.visible = visible;
  }

  // ---- Portal ghost (editor preview during placement) ----

  /**
   * Show a semi-transparent green rectangle spanning from (startTile) to (cursorTile).
   * Call with null to hide the ghost.
   */
  showPortalGhost(start: { tx: number; ty: number } | null, cursor: { tx: number; ty: number } | null) {
    this.ghostManager.showPortalGhost(start, cursor);
  }

  /** Show a single-tile cursor ghost at the given tile position (before first click). */
  showPortalCursor(tx: number, ty: number) {
    this.ghostManager.showPortalCursor(tx, ty);
  }

  hidePortalGhost() {
    this.ghostManager.hidePortalGhost();
  }

  /** Re-render portal zones (call after adding/removing portals) */
  renderPortalOverlay() {
    if (!this.mapData) return;
    renderPortalOverlayFn(
      this.portalOverlay,
      this.mapData,
      this.mapData.tileWidth,
      this.mapData.tileHeight
    );
  }

  // =========================================================================
  // Label overlay
  // =========================================================================

  /** Re-render label zones (call after adding/removing labels) */
  renderLabelOverlay() {
    if (!this.mapData) return;
    renderLabelOverlayFn(
      this.labelOverlay,
      this.mapData,
      this.mapData.tileWidth,
      this.mapData.tileHeight
    );
  }

  // ---- Label ghost (editor preview during placement) ----

  /** Show a ghost rectangle for label placement (from start to cursor) */
  showLabelGhost(start: { tx: number; ty: number }, cursor: { tx: number; ty: number }, name?: string) {
    this.ghostManager.showLabelGhost(start, cursor, name);
  }

  /** Show a single-tile yellow cursor for label placement */
  showLabelCursor(tx: number, ty: number) {
    this.ghostManager.showLabelCursor(tx, ty);
  }

  hideLabelGhost() {
    this.ghostManager.hideLabelGhost();
  }

  // =========================================================================
  // Tile ghost (paint tool hover preview)
  // =========================================================================

  /**
   * Show a semi-transparent preview of the selected tile region at the cursor position.
   *
   * @param tx        Map tile X where the top-left of the stamp goes
   * @param ty        Map tile Y
   * @param region    The selected tileset region (col/row/w/h in tileset grid)
   *                  Pass null for erase/collision tools (shows outline cursor).
   * @param tsCols    Number of tile columns in the tileset (imageWidth / tileWidth)
   */
  showTileGhost(
    tx: number,
    ty: number,
    region: { col: number; row: number; w: number; h: number } | null,
    tsCols: number,
    tilesetUrl?: string,
  ) {
    this.ghostManager.showTileGhost(tx, ty, region, tsCols, tilesetUrl);
  }

  /**
   * Show an irregular (non-rectangular) tile ghost preview.
   * @param tx       Map tile X for the bounding-box origin
   * @param ty       Map tile Y
   * @param tiles    Array of {dx, dy, tileIdx} offsets from the origin
   * @param tsCols   Number of tile columns in the tileset
   */
  showIrregularTileGhost(
    tx: number,
    ty: number,
    tiles: { dx: number; dy: number; tileIdx: number }[],
    tsCols: number,
    tilesetUrl?: string,
  ) {
    this.ghostManager.showIrregularTileGhost(tx, ty, tiles, tsCols, tilesetUrl);
  }

  hideTileGhost() {
    this.ghostManager.hideTileGhost();
  }

  // =========================================================================
  // Grid overlay (toggle on/off in build mode)
  // =========================================================================

  private gridOverlay: Graphics | null = null;
  private gridVisible = false;

  /** Toggle the tile grid lines on the map */
  toggleGrid(): boolean {
    this.gridVisible = !this.gridVisible;
    if (this.gridVisible) {
      this.renderGrid();
    } else if (this.gridOverlay) {
      this.gridOverlay.visible = false;
    }
    return this.gridVisible;
  }

  /** Returns whether grid is currently shown */
  isGridVisible(): boolean {
    return this.gridVisible;
  }

  private renderGrid() {
    if (!this.mapData) return;
    this.gridOverlay = renderGrid(this.mapData, this.container, this.gridOverlay);
  }
}
