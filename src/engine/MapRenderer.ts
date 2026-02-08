import { Container, Sprite, Texture, Rectangle, Assets, Graphics, Text, TextStyle } from "pixi.js";
import type { Game } from "./Game.ts";
import type { MapData, MapLayer, Portal, MapLabel } from "./types.ts";
import { TileAnimator } from "./animations/TileAnimator.ts";

/**
 * Renders a multi-layer tile map using PixiJS.
 * Supports configurable tile sizes and multiple layers (bg, obj, overlay).
 */
export class MapRenderer {
  container: Container;
  private game: Game;
  private mapData: MapData | null = null;
  private layerContainers: Container[] = [];
  private tilesetTexture: Texture | null = null;
  /** Container for overlay-type map layers (renders above entities) */
  overlayLayerContainer: Container;
  private portalOverlay: Container;
  private labelOverlay: Container;
  private collisionOverlay: Graphics | null = null;
  private collisionOverlayVisible = false;
  private overlaysVisible = false;
  private tileAnimator: TileAnimator | null = null;

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.label = "map";
    this.overlayLayerContainer = new Container();
    this.overlayLayerContainer.label = "map-overlays";
    this.overlayLayerContainer.zIndex = 60; // above entities (50) so characters walk "under" overlay tiles
    this.overlayLayerContainer.sortableChildren = true;
    this.portalOverlay = new Container();
    this.portalOverlay.label = "portal-overlay";
    this.portalOverlay.zIndex = 150;
    this.portalOverlay.visible = false;
    this.labelOverlay = new Container();
    this.labelOverlay.label = "label-overlay";
    this.labelOverlay.zIndex = 149;
    this.labelOverlay.visible = false;
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
    this.tileGhostContainer = null;
    this.tileCursorOutline = null;
    this.portalGhost = null;
    this.labelGhost = null;
    this.gridOverlay = null;
    this.mapData = mapData;

    // Load tileset texture
    this.tilesetTexture = await Assets.load(mapData.tilesetUrl);

    // Render each layer
    this.overlayLayerContainer.removeChildren();
    for (const layer of mapData.layers) {
      const layerContainer = new Container();
      layerContainer.label = layer.name;
      layerContainer.visible = layer.visible;

      this.renderLayer(layerContainer, layer, mapData);
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

  private renderLayer(
    container: Container,
    layer: MapLayer,
    mapData: MapData
  ) {
    if (!this.tilesetTexture) return;

    const tilesPerRow = Math.floor(mapData.tilesetPxW / mapData.tileWidth);

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tileIndex = layer.tiles[y * mapData.width + x];
        if (tileIndex < 0) continue;

        const srcX = (tileIndex % tilesPerRow) * mapData.tileWidth;
        const srcY = Math.floor(tileIndex / tilesPerRow) * mapData.tileHeight;

        const frame = new Rectangle(
          srcX,
          srcY,
          mapData.tileWidth,
          mapData.tileHeight
        );
        const texture = new Texture({
          source: this.tilesetTexture!.source,
          frame,
        });

        const sprite = new Sprite(texture);
        sprite.x = x * mapData.tileWidth;
        sprite.y = y * mapData.tileHeight;
        container.addChild(sprite);
      }
    }
  }

  /** Update a single tile in a layer (for editor) */
  setTile(layerIndex: number, x: number, y: number, tileIndex: number) {
    if (!this.mapData || !this.tilesetTexture) return;

    const layer = this.mapData.layers[layerIndex];
    const idx = y * this.mapData.width + x;
    layer.tiles[idx] = tileIndex;

    // Re-render this layer
    const container = this.layerContainers[layerIndex];
    if (container) {
      container.removeChildren();
      this.renderLayer(container, layer, this.mapData);
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
      this.layerContainers[i].alpha = (activeIndex < 0 || i === activeIndex) ? 1.0 : 0.25;
    }
  }

  /** Check collision at a tile coordinate */
  isCollision(tileX: number, tileY: number): boolean {
    if (!this.mapData) return false;
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= this.mapData.width ||
      tileY >= this.mapData.height
    ) {
      return true;
    }
    return this.mapData.collisionMask[tileY * this.mapData.width + tileX];
  }

  /** Convert world position to tile coordinates */
  worldToTile(worldX: number, worldY: number) {
    if (!this.mapData) return { tileX: 0, tileY: 0 };
    return {
      tileX: Math.floor(worldX / this.mapData.tileWidth),
      tileY: Math.floor(worldY / this.mapData.tileHeight),
    };
  }

  /** Convert tile coordinates to world position (center of tile) */
  tileToWorld(tileX: number, tileY: number) {
    if (!this.mapData) return { x: 0, y: 0 };
    return {
      x: tileX * this.mapData.tileWidth + this.mapData.tileWidth / 2,
      y: tileY * this.mapData.tileHeight + this.mapData.tileHeight / 2,
    };
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

  /** Redraw the collision overlay from current collisionMask */
  renderCollisionOverlay() {
    if (!this.mapData) return;
    const { width, height, tileWidth, tileHeight, collisionMask } = this.mapData;

    if (!this.collisionOverlay) {
      this.collisionOverlay = new Graphics();
      this.collisionOverlay.label = "collision-overlay";
      this.collisionOverlay.zIndex = 148; // below portal/label overlays
      this.container.addChild(this.collisionOverlay);
    }

    this.collisionOverlay.clear();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (collisionMask[y * width + x]) {
          this.collisionOverlay.rect(
            x * tileWidth,
            y * tileHeight,
            tileWidth,
            tileHeight,
          );
        }
      }
    }
    this.collisionOverlay.fill({ color: 0xff2222, alpha: 0.25 });
    this.collisionOverlay.visible = true;
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

  private portalGhost: Graphics | null = null;

  /**
   * Show a semi-transparent green rectangle spanning from (startTile) to (cursorTile).
   * Call with null to hide the ghost.
   */
  showPortalGhost(start: { tx: number; ty: number } | null, cursor: { tx: number; ty: number } | null) {
    if (!start || !cursor || !this.mapData) {
      if (this.portalGhost) {
        this.portalGhost.clear();
        this.portalGhost.visible = false;
      }
      return;
    }

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const x = Math.min(start.tx, cursor.tx) * tw;
    const y = Math.min(start.ty, cursor.ty) * th;
    const w = (Math.abs(cursor.tx - start.tx) + 1) * tw;
    const h = (Math.abs(cursor.ty - start.ty) + 1) * th;

    if (!this.portalGhost) {
      this.portalGhost = new Graphics();
      this.portalGhost.zIndex = 160;
      this.container.addChild(this.portalGhost);
    }

    this.portalGhost.clear();
    this.portalGhost.rect(x, y, w, h);
    this.portalGhost.fill({ color: 0x00ff88, alpha: 0.3 });
    this.portalGhost.stroke({ color: 0x00ff88, alpha: 0.9, width: 2 });
    this.portalGhost.visible = true;
  }

  /**
   * Show a single-tile cursor ghost at the given tile position (before first click).
   */
  showPortalCursor(tx: number, ty: number) {
    if (!this.mapData) return;
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    if (!this.portalGhost) {
      this.portalGhost = new Graphics();
      this.portalGhost.zIndex = 160;
      this.container.addChild(this.portalGhost);
    }

    this.portalGhost.clear();
    this.portalGhost.rect(tx * tw, ty * th, tw, th);
    this.portalGhost.fill({ color: 0x00ff88, alpha: 0.25 });
    this.portalGhost.stroke({ color: 0x00ff88, alpha: 0.7, width: 2 });
    this.portalGhost.visible = true;
  }

  hidePortalGhost() {
    if (this.portalGhost) {
      this.portalGhost.clear();
      this.portalGhost.visible = false;
    }
  }

  /** Re-render portal zones (call after adding/removing portals) */
  renderPortalOverlay() {
    this.portalOverlay.removeChildren();
    if (!this.mapData) return;

    const portals: Portal[] = this.mapData.portals ?? [];
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const labelStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: Math.max(10, Math.min(tw * 0.6, 14)),
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 2 },
      align: "center",
    });

    for (const p of portals) {
      const px = p.x * tw;
      const py = p.y * th;
      const pw = p.width * tw;
      const ph = p.height * th;

      // Semi-transparent rectangle
      const rect = new Graphics();
      rect.rect(px, py, pw, ph);
      rect.fill({ color: 0x00ccff, alpha: 0.3 });
      rect.stroke({ color: 0x00ccff, alpha: 0.8, width: 2 });
      this.portalOverlay.addChild(rect);

      // Label
      const label = new Text({
        text: `🚪 ${p.name}\n→ ${p.targetMap}`,
        style: labelStyle,
      });
      label.anchor.set(0.5, 0.5);
      label.x = px + pw / 2;
      label.y = py + ph / 2;
      this.portalOverlay.addChild(label);
    }
  }

  // =========================================================================
  // Label overlay
  // =========================================================================

  /** Re-render label zones (call after adding/removing labels) */
  renderLabelOverlay() {
    this.labelOverlay.removeChildren();
    if (!this.mapData) return;

    const labels: MapLabel[] = this.mapData.labels ?? [];
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const labelStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: Math.max(10, Math.min(tw * 0.6, 14)),
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 2 },
      align: "center",
    });

    for (const l of labels) {
      const px = l.x * tw;
      const py = l.y * th;
      const pw = (l.width ?? 1) * tw;
      const ph = (l.height ?? 1) * th;

      // Semi-transparent yellow rectangle
      const rect = new Graphics();
      rect.rect(px, py, pw, ph);
      rect.fill({ color: 0xffcc00, alpha: 0.2 });
      rect.stroke({ color: 0xffcc00, alpha: 0.7, width: 1.5 });
      this.labelOverlay.addChild(rect);

      // Label text
      const text = new Text({
        text: `🏷 ${l.name}`,
        style: labelStyle,
      });
      text.anchor.set(0.5, 0.5);
      text.x = px + pw / 2;
      text.y = py + ph / 2;
      this.labelOverlay.addChild(text);
    }
  }

  // ---- Label ghost (editor preview during placement) ----

  private labelGhost: Graphics | null = null;

  /** Show a ghost rectangle for label placement (from start to cursor) */
  showLabelGhost(start: { tx: number; ty: number }, cursor: { tx: number; ty: number }, name?: string) {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const x = Math.min(start.tx, cursor.tx) * tw;
    const y = Math.min(start.ty, cursor.ty) * th;
    const w = (Math.abs(cursor.tx - start.tx) + 1) * tw;
    const h = (Math.abs(cursor.ty - start.ty) + 1) * th;

    if (!this.labelGhost) {
      this.labelGhost = new Graphics();
      this.labelGhost.zIndex = 160;
      this.container.addChild(this.labelGhost);
    }

    this.labelGhost.clear();
    this.labelGhost.rect(x, y, w, h);
    this.labelGhost.fill({ color: 0xffcc00, alpha: 0.25 });
    this.labelGhost.stroke({ color: 0xffcc00, alpha: 0.9, width: 2 });
    this.labelGhost.visible = true;
  }

  /** Show a single-tile yellow cursor for label placement */
  showLabelCursor(tx: number, ty: number) {
    if (!this.mapData) return;
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    if (!this.labelGhost) {
      this.labelGhost = new Graphics();
      this.labelGhost.zIndex = 160;
      this.container.addChild(this.labelGhost);
    }

    this.labelGhost.clear();
    this.labelGhost.rect(tx * tw, ty * th, tw, th);
    this.labelGhost.fill({ color: 0xffcc00, alpha: 0.2 });
    this.labelGhost.stroke({ color: 0xffcc00, alpha: 0.7, width: 2 });
    this.labelGhost.visible = true;
  }

  hideLabelGhost() {
    if (this.labelGhost) {
      this.labelGhost.clear();
      this.labelGhost.visible = false;
    }
  }

  // =========================================================================
  // Tile ghost (paint tool hover preview)
  // =========================================================================

  private tileGhostContainer: Container | null = null;
  private tileCursorOutline: Graphics | null = null;

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
  ) {
    if (!this.mapData) return;
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    if (!region) {
      // Erase / collision — show an outline cursor
      if (this.tileGhostContainer) this.tileGhostContainer.visible = false;
      if (!this.tileCursorOutline) {
        this.tileCursorOutline = new Graphics();
        this.tileCursorOutline.zIndex = 155;
        this.container.addChild(this.tileCursorOutline);
      }
      this.tileCursorOutline.clear();
      this.tileCursorOutline.rect(tx * tw, ty * th, tw, th);
      this.tileCursorOutline.fill({ color: 0xff4444, alpha: 0.15 });
      this.tileCursorOutline.stroke({ color: 0xff4444, alpha: 0.7, width: 2 });
      this.tileCursorOutline.visible = true;
      return;
    }

    // Hide outline cursor
    if (this.tileCursorOutline) this.tileCursorOutline.visible = false;

    if (!this.tilesetTexture) return;

    // Rebuild the ghost container with the correct tiles
    if (!this.tileGhostContainer) {
      this.tileGhostContainer = new Container();
      this.tileGhostContainer.alpha = 0.55;
      this.tileGhostContainer.zIndex = 155;
      this.container.addChild(this.tileGhostContainer);
    }

    // Only rebuild sprites when the region or position changes
    const key = `${region.col},${region.row},${region.w},${region.h}`;
    if ((this.tileGhostContainer as any).__regionKey !== key) {
      this.tileGhostContainer.removeChildren();
      for (let dy = 0; dy < region.h; dy++) {
        for (let dx = 0; dx < region.w; dx++) {
          const tileIdx = (region.row + dy) * tsCols + (region.col + dx);
          const srcX = (tileIdx % tsCols) * tw;
          const srcY = Math.floor(tileIdx / tsCols) * th;
          const frame = new Rectangle(srcX, srcY, tw, th);
          const tex = new Texture({ source: this.tilesetTexture!.source, frame });
          const s = new Sprite(tex);
          s.x = dx * tw;
          s.y = dy * th;
          this.tileGhostContainer.addChild(s);
        }
      }
      (this.tileGhostContainer as any).__regionKey = key;
    }

    this.tileGhostContainer.x = tx * tw;
    this.tileGhostContainer.y = ty * th;
    this.tileGhostContainer.visible = true;
  }

  hideTileGhost() {
    if (this.tileGhostContainer) {
      this.tileGhostContainer.visible = false;
    }
    if (this.tileCursorOutline) {
      this.tileCursorOutline.visible = false;
    }
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
    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;
    const w = this.mapData.width * tw;
    const h = this.mapData.height * th;

    if (!this.gridOverlay) {
      this.gridOverlay = new Graphics();
      this.gridOverlay.label = "grid-overlay";
      this.gridOverlay.zIndex = 145;
      this.container.addChild(this.gridOverlay);
    }

    this.gridOverlay.clear();

    // Draw vertical lines
    for (let x = 0; x <= this.mapData.width; x++) {
      this.gridOverlay.moveTo(x * tw, 0);
      this.gridOverlay.lineTo(x * tw, h);
    }
    // Draw horizontal lines
    for (let y = 0; y <= this.mapData.height; y++) {
      this.gridOverlay.moveTo(0, y * th);
      this.gridOverlay.lineTo(w, y * th);
    }

    this.gridOverlay.stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
    this.gridOverlay.visible = true;
  }
}
