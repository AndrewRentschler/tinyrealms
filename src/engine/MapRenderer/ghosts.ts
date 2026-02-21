import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { MapData } from "../types.ts";
import {
  ERASE_CURSOR_COLOR,
  ERASE_CURSOR_FILL_ALPHA,
  ERASE_CURSOR_STROKE_ALPHA,
  GHOST_Z_INDEX,
  LABEL_CURSOR_FILL_ALPHA,
  LABEL_CURSOR_STROKE_ALPHA,
  LABEL_GHOST_FILL_ALPHA,
  LABEL_GHOST_STROKE_ALPHA,
  LABEL_ZONE_COLOR,
  PORTAL_GHOST_COLOR,
  PORTAL_GHOST_CURSOR_FILL_ALPHA,
  PORTAL_GHOST_CURSOR_STROKE_ALPHA,
  PORTAL_GHOST_FILL_ALPHA,
  PORTAL_GHOST_STROKE_ALPHA,
  STROKE_WIDTH_THICK,
  TILE_GHOST_ALPHA,
  TILE_GHOST_Z_INDEX,
} from "./constants.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface TilePoint {
  tx: number;
  ty: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute world rect from start and cursor tile positions.
 */
export function computeRectFromTiles(
  start: TilePoint,
  cursor: TilePoint,
  tw: number,
  th: number,
): Rect {
  const x = Math.min(start.tx, cursor.tx) * tw;
  const y = Math.min(start.ty, cursor.ty) * th;
  const w = (Math.abs(cursor.tx - start.tx) + 1) * tw;
  const h = (Math.abs(cursor.ty - start.ty) + 1) * th;
  return { x, y, w, h };
}

export interface GhostRef {
  current: Graphics | null;
}

/**
 * Create or get a ghost Graphics. Creates if ref.current is null, adds to container, returns it.
 * Mutates ref.current so the caller's ref stays in sync.
 */
export function createOrGetGhost(
  ghostRef: GhostRef,
  container: Container,
  zIndex: number,
  _color: number,
  label: string,
): Graphics {
  if (ghostRef.current) return ghostRef.current;
  const ghost = new Graphics();
  ghost.label = label;
  ghost.zIndex = zIndex;
  ghostRef.current = ghost;
  container.addChild(ghost);
  return ghost;
}

/**
 * Draw a rectangle ghost: clear, rect, fill, stroke, visible=true.
 */
export function drawRectGhost(
  ghost: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fillAlpha: number,
  strokeAlpha: number,
  strokeWidth: number,
  color: number,
): void {
  ghost.clear();
  ghost.rect(x, y, w, h);
  ghost.fill({ color, alpha: fillAlpha });
  ghost.stroke({ color, alpha: strokeAlpha, width: strokeWidth });
  ghost.visible = true;
}

// ---------------------------------------------------------------------------
// Region cache for tile ghost (typed replacement for __regionKey)
// ---------------------------------------------------------------------------

export interface RegionCache {
  key: string;
}

// ---------------------------------------------------------------------------
// GhostManager
// ---------------------------------------------------------------------------

export interface GhostManagerParams {
  mapData: MapData | null;
  container: Container;
  tilesetTextures: Map<string, Texture>;
}

/**
 * Manages portal, label, and tile ghosts for the map editor.
 * Ghosts are preview overlays shown during placement (portals, labels, paint).
 */
export class GhostManager {
  private mapData: MapData | null;
  private container: Container;
  private tilesetTextures: Map<string, Texture>;

  private portalGhostRef: GhostRef = { current: null };
  private labelGhostRef: GhostRef = { current: null };
  private tileGhostContainer: Container | null = null;
  private tileCursorOutline: Graphics | null = null;
  private tileRegionCache: RegionCache = { key: "" };

  constructor(params: GhostManagerParams) {
    this.mapData = params.mapData;
    this.container = params.container;
    this.tilesetTextures = params.tilesetTextures;
  }

  /** Update mapData when map changes */
  setMapData(mapData: MapData | null): void {
    this.mapData = mapData;
  }

  /** Reset all ghost refs (call when map is reloaded) */
  reset(): void {
    this.portalGhostRef.current = null;
    this.labelGhostRef.current = null;
    this.tileGhostContainer = null;
    this.tileCursorOutline = null;
    this.tileRegionCache = { key: "" };
  }

  // ---- Portal ghost ----

  showPortalGhost(
    start: TilePoint | null,
    cursor: TilePoint | null,
  ): void {
    if (!start || !cursor || !this.mapData) {
      this.hidePortalGhost();
      return;
    }

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;
    const rect = computeRectFromTiles(start, cursor, tw, th);

    const ghost = createOrGetGhost(
      this.portalGhostRef,
      this.container,
      GHOST_Z_INDEX,
      PORTAL_GHOST_COLOR,
      "portal-ghost",
    );

    drawRectGhost(
      ghost,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      PORTAL_GHOST_FILL_ALPHA,
      PORTAL_GHOST_STROKE_ALPHA,
      STROKE_WIDTH_THICK,
      PORTAL_GHOST_COLOR,
    );
  }

  showPortalCursor(tx: number, ty: number): void {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const ghost = createOrGetGhost(
      this.portalGhostRef,
      this.container,
      GHOST_Z_INDEX,
      PORTAL_GHOST_COLOR,
      "portal-ghost",
    );

    drawRectGhost(
      ghost,
      tx * tw,
      ty * th,
      tw,
      th,
      PORTAL_GHOST_CURSOR_FILL_ALPHA,
      PORTAL_GHOST_CURSOR_STROKE_ALPHA,
      STROKE_WIDTH_THICK,
      PORTAL_GHOST_COLOR,
    );
  }

  hidePortalGhost(): void {
    if (this.portalGhostRef.current) {
      this.portalGhostRef.current.clear();
      this.portalGhostRef.current.visible = false;
    }
  }

  // ---- Label ghost ----

  showLabelGhost(start: TilePoint, cursor: TilePoint, _name?: string): void {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;
    const rect = computeRectFromTiles(start, cursor, tw, th);

    const ghost = createOrGetGhost(
      this.labelGhostRef,
      this.container,
      GHOST_Z_INDEX,
      LABEL_ZONE_COLOR,
      "label-ghost",
    );

    drawRectGhost(
      ghost,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      LABEL_GHOST_FILL_ALPHA,
      LABEL_GHOST_STROKE_ALPHA,
      STROKE_WIDTH_THICK,
      LABEL_ZONE_COLOR,
    );
  }

  showLabelCursor(tx: number, ty: number): void {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    const ghost = createOrGetGhost(
      this.labelGhostRef,
      this.container,
      GHOST_Z_INDEX,
      LABEL_ZONE_COLOR,
      "label-ghost",
    );

    drawRectGhost(
      ghost,
      tx * tw,
      ty * th,
      tw,
      th,
      LABEL_CURSOR_FILL_ALPHA,
      LABEL_CURSOR_STROKE_ALPHA,
      STROKE_WIDTH_THICK,
      LABEL_ZONE_COLOR,
    );
  }

  hideLabelGhost(): void {
    if (this.labelGhostRef.current) {
      this.labelGhostRef.current.clear();
      this.labelGhostRef.current.visible = false;
    }
  }

  // ---- Tile ghost ----

  showTileGhost(
    tx: number,
    ty: number,
    region: { col: number; row: number; w: number; h: number } | null,
    tsCols: number,
    tilesetUrl?: string,
  ): void {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;

    if (!region) {
      this.showEraseCursor(tx, ty, tw, th);
      return;
    }

    if (this.tileCursorOutline) this.tileCursorOutline.visible = false;

    const sourceTilesetUrl = tilesetUrl ?? this.mapData.tilesetUrl;
    const tilesetTexture = this.tilesetTextures.get(sourceTilesetUrl);
    if (!tilesetTexture) return;

    const key = `${region.col},${region.row},${region.w},${region.h}`;
    if (this.tileRegionCache.key !== key) {
      if (!this.tileGhostContainer) {
        this.tileGhostContainer = new Container();
        this.tileGhostContainer.alpha = TILE_GHOST_ALPHA;
        this.tileGhostContainer.zIndex = TILE_GHOST_Z_INDEX;
        this.container.addChild(this.tileGhostContainer);
      }
      this.tileGhostContainer.removeChildren();
      for (let dy = 0; dy < region.h; dy++) {
        for (let dx = 0; dx < region.w; dx++) {
          const tileIdx = (region.row + dy) * tsCols + (region.col + dx);
          const srcX = (tileIdx % tsCols) * tw;
          const srcY = Math.floor(tileIdx / tsCols) * th;
          const frame = new Rectangle(srcX, srcY, tw, th);
          const tex = new Texture({ source: tilesetTexture.source, frame });
          const s = new Sprite(tex);
          s.x = dx * tw;
          s.y = dy * th;
          this.tileGhostContainer.addChild(s);
        }
      }
      this.tileRegionCache.key = key;
    }

    if (this.tileGhostContainer) {
      this.tileGhostContainer.x = tx * tw;
      this.tileGhostContainer.y = ty * th;
      this.tileGhostContainer.visible = true;
    }
  }

  showIrregularTileGhost(
    tx: number,
    ty: number,
    tiles: { dx: number; dy: number; tileIdx: number }[],
    tsCols: number,
    tilesetUrl?: string,
  ): void {
    if (!this.mapData) return;

    const tw = this.mapData.tileWidth;
    const th = this.mapData.tileHeight;
    const sourceTilesetUrl = tilesetUrl ?? this.mapData.tilesetUrl;
    const tilesetTexture = this.tilesetTextures.get(sourceTilesetUrl);
    if (!tilesetTexture) return;

    if (this.tileCursorOutline) this.tileCursorOutline.visible = false;

    const key = "irr:" + tiles.map((t) => `${t.dx},${t.dy},${t.tileIdx}`).join(";");
    if (this.tileRegionCache.key !== key) {
      if (!this.tileGhostContainer) {
        this.tileGhostContainer = new Container();
        this.tileGhostContainer.alpha = TILE_GHOST_ALPHA;
        this.tileGhostContainer.zIndex = TILE_GHOST_Z_INDEX;
        this.container.addChild(this.tileGhostContainer);
      }
      this.tileGhostContainer.removeChildren();
      for (const t of tiles) {
        const srcX = (t.tileIdx % tsCols) * tw;
        const srcY = Math.floor(t.tileIdx / tsCols) * th;
        const frame = new Rectangle(srcX, srcY, tw, th);
        const tex = new Texture({ source: tilesetTexture.source, frame });
        const s = new Sprite(tex);
        s.x = t.dx * tw;
        s.y = t.dy * th;
        this.tileGhostContainer.addChild(s);
      }
      this.tileRegionCache.key = key;
    }

    if (this.tileGhostContainer) {
      this.tileGhostContainer.x = tx * tw;
      this.tileGhostContainer.y = ty * th;
      this.tileGhostContainer.visible = true;
    }
  }

  private showEraseCursor(tx: number, ty: number, tw: number, th: number): void {
    if (this.tileGhostContainer) this.tileGhostContainer.visible = false;

    if (!this.tileCursorOutline) {
      this.tileCursorOutline = new Graphics();
      this.tileCursorOutline.label = "tile-cursor-outline";
      this.tileCursorOutline.zIndex = TILE_GHOST_Z_INDEX;
      this.container.addChild(this.tileCursorOutline);
    }

    drawRectGhost(
      this.tileCursorOutline,
      tx * tw,
      ty * th,
      tw,
      th,
      ERASE_CURSOR_FILL_ALPHA,
      ERASE_CURSOR_STROKE_ALPHA,
      STROKE_WIDTH_THICK,
      ERASE_CURSOR_COLOR,
    );
  }

  hideTileGhost(): void {
    if (this.tileGhostContainer) {
      this.tileGhostContainer.visible = false;
    }
    if (this.tileCursorOutline) {
      this.tileCursorOutline.visible = false;
    }
  }
}
