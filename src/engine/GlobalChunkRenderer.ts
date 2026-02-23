import { Container, type Texture } from "pixi.js";
import type { MapData, MapLayer } from "./types.ts";
import { renderLayer } from "./MapRenderer/renderLayer.ts";
import { loadTilesetTexture } from "./MapRenderer/loadTileset.ts";
import {
  GlobalChunkCache,
  makeGlobalChunkKey,
  type GlobalChunkCoord,
  type GlobalChunkLoader,
  type GlobalChunkPayload,
} from "./globalChunkCache.ts";

export interface GlobalChunkRendererOptions {
  worldKey: string;
  chunkWorldWidth: number;
  chunkWorldHeight: number;
  tilesetUrl: string;
  tilesetPxW: number;
  tilesetPxH: number;
  loader: GlobalChunkLoader;
}

export interface GlobalChunkWindowRequest {
  centerX: number;
  centerY: number;
  visibleRadius: number;
  prefetchRadius: number;
}

const CHUNK_BG_Z_INDEX = 0;
const CHUNK_OBJ_Z_INDEX = 10;
const CHUNK_OVERLAY_Z_INDEX = 20;

export class GlobalChunkRenderer {
  readonly container: Container;
  readonly overlayContainer: Container;

  private readonly worldKey: string;
  private readonly chunkWorldWidth: number;
  private readonly chunkWorldHeight: number;
  private readonly tilesetUrl: string;
  private readonly tilesetPxW: number;
  private readonly tilesetPxH: number;
  private readonly loader: GlobalChunkLoader;

  private readonly chunkCache = new GlobalChunkCache<GlobalChunkPayload>();
  private readonly renderedChunks = new Map<string, { container: Container; overlayContainer: Container; revision: number }>();
  private readonly tilesetTextures = new Map<string, Texture>();
  private tilesetTexturePromise: Promise<Texture> | null = null;

  constructor(options: GlobalChunkRendererOptions) {
    this.worldKey = options.worldKey;
    this.chunkWorldWidth = options.chunkWorldWidth;
    this.chunkWorldHeight = options.chunkWorldHeight;
    this.tilesetUrl = options.tilesetUrl;
    this.tilesetPxW = options.tilesetPxW;
    this.tilesetPxH = options.tilesetPxH;
    this.loader = options.loader;

    this.container = new Container();
    this.container.label = "global-chunks";
    this.container.sortableChildren = true;

    this.overlayContainer = new Container();
    this.overlayContainer.label = "global-chunks-overlay";
    this.overlayContainer.sortableChildren = true;
  }

  async updateWindow(request: GlobalChunkWindowRequest): Promise<void> {
    const visibleRadius = clampRadius(request.visibleRadius);
    const prefetchRadius = Math.max(visibleRadius, clampRadius(request.prefetchRadius));

    const visibleCoords = chunksForRadius(
      request.centerX,
      request.centerY,
      visibleRadius,
      this.chunkWorldWidth,
      this.chunkWorldHeight,
      this.worldKey,
    );
    const prefetchCoords = chunksForRadius(
      request.centerX,
      request.centerY,
      prefetchRadius,
      this.chunkWorldWidth,
      this.chunkWorldHeight,
      this.worldKey,
    );

    const visibleKeys = new Set(visibleCoords.map((coord) => makeGlobalChunkKey(coord)));
    this.chunkCache.retainWindow(prefetchCoords);
    this.chunkCache.touchMany(prefetchCoords);

    const loadedByKey = new Map<string, GlobalChunkPayload>();
    const loaded = await Promise.all(
      prefetchCoords.map(async (coord) => {
        const chunk = await this.chunkCache.getOrLoad(coord, this.loader);
        if (!chunk) return;
        loadedByKey.set(makeGlobalChunkKey(coord), chunk);
      }),
    );
    void loaded;

    const tilesetTexture = await this.ensureTilesetTexture();
    await Promise.all(
      visibleCoords.map(async (coord) => {
        const key = makeGlobalChunkKey(coord);
        const chunk = this.chunkCache.get(coord) ?? loadedByKey.get(key) ?? null;
        if (!chunk) return;
        await this.renderChunk(chunk, tilesetTexture);
      }),
    );

    this.removeStaleRenderedChunks(visibleKeys);
    this.chunkCache.evictStale();
  }

  destroy(): void {
    this.removeStaleRenderedChunks(new Set<string>());
    this.chunkCache.clear();
    this.tilesetTextures.clear();
    this.tilesetTexturePromise = null;
    this.container.destroy({ children: true });
    this.overlayContainer.destroy({ children: true });
  }

  private async ensureTilesetTexture(): Promise<Texture> {
    if (this.tilesetTexturePromise) {
      return this.tilesetTexturePromise;
    }
    this.tilesetTexturePromise = loadTilesetTexture(this.tilesetTextures, this.tilesetUrl);
    return this.tilesetTexturePromise;
  }

  private async renderChunk(chunk: GlobalChunkPayload, tilesetTexture: Texture): Promise<void> {
    const key = makeGlobalChunkKey(chunk);
    const existing = this.renderedChunks.get(key);
    if (existing && existing.revision === chunk.revision) {
      return;
    }

    if (existing) {
      this.container.removeChild(existing.container);
      existing.container.destroy({ children: true });
      this.overlayContainer.removeChild(existing.overlayContainer);
      existing.overlayContainer.destroy({ children: true });
      this.renderedChunks.delete(key);
    }

    const chunkContainer = new Container();
    chunkContainer.label = `chunk:${chunk.chunkX},${chunk.chunkY}`;
    chunkContainer.sortableChildren = true;
    chunkContainer.x = chunk.chunkX * chunk.chunkWidthTiles * chunk.tileWidth;
    chunkContainer.y = chunk.chunkY * chunk.chunkHeightTiles * chunk.tileHeight;

    const overlayChunkContainer = new Container();
    overlayChunkContainer.label = `chunk-overlay:${chunk.chunkX},${chunk.chunkY}`;
    overlayChunkContainer.sortableChildren = true;
    overlayChunkContainer.x = chunk.chunkX * chunk.chunkWidthTiles * chunk.tileWidth;
    overlayChunkContainer.y = chunk.chunkY * chunk.chunkHeightTiles * chunk.tileHeight;

    const mapData = toChunkMapData(chunk, this.tilesetUrl, this.tilesetPxW, this.tilesetPxH);
    const [bgLayer, objLayer, overlayLayer] = mapData.layers;

    const bgContainer = new Container();
    bgContainer.label = "bg";
    bgContainer.zIndex = CHUNK_BG_Z_INDEX;
    renderLayer(bgContainer, bgLayer, mapData, tilesetTexture);
    chunkContainer.addChild(bgContainer);

    const objContainer = new Container();
    objContainer.label = "obj";
    objContainer.zIndex = CHUNK_OBJ_Z_INDEX;
    renderLayer(objContainer, objLayer, mapData, tilesetTexture);
    chunkContainer.addChild(objContainer);

    const overlayContainer = new Container();
    overlayContainer.label = "overlay";
    overlayContainer.zIndex = CHUNK_OVERLAY_Z_INDEX;
    renderLayer(overlayContainer, overlayLayer, mapData, tilesetTexture);
    overlayChunkContainer.addChild(overlayContainer);

    this.container.addChild(chunkContainer);
    this.overlayContainer.addChild(overlayChunkContainer);
    this.renderedChunks.set(key, { container: chunkContainer, overlayContainer: overlayChunkContainer, revision: chunk.revision });
  }

  private removeStaleRenderedChunks(keepKeys: Set<string>): void {
    for (const [key, rendered] of this.renderedChunks.entries()) {
      if (keepKeys.has(key)) continue;
      this.container.removeChild(rendered.container);
      rendered.container.destroy({ children: true });
      this.overlayContainer.removeChild(rendered.overlayContainer);
      rendered.overlayContainer.destroy({ children: true });
      this.renderedChunks.delete(key);
    }
  }
}

function clampRadius(radius: number): number {
  if (!Number.isFinite(radius) || radius < 0) {
    return 0;
  }
  return radius;
}

function computeChunkCoord(value: number, chunkWorldSize: number): number {
  if (!Number.isFinite(chunkWorldSize) || chunkWorldSize <= 0) {
    throw new Error("chunkWorldSize must be > 0");
  }
  return Math.floor(value / chunkWorldSize);
}

function chunkOriginWorld(
  chunkX: number,
  chunkY: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number,
): { x: number; y: number } {
  return {
    x: chunkX * chunkWorldWidth,
    y: chunkY * chunkWorldHeight,
  };
}

function intersectsRadius(
  x: number,
  y: number,
  radius: number,
  chunkX: number,
  chunkY: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number,
): boolean {
  const origin = chunkOriginWorld(chunkX, chunkY, chunkWorldWidth, chunkWorldHeight);
  const maxX = origin.x + chunkWorldWidth;
  const maxY = origin.y + chunkWorldHeight;

  const nearestX = Math.max(origin.x, Math.min(x, maxX));
  const nearestY = Math.max(origin.y, Math.min(y, maxY));
  const dx = x - nearestX;
  const dy = y - nearestY;

  return dx * dx + dy * dy <= radius * radius;
}

function chunksForRadius(
  x: number,
  y: number,
  radius: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number,
  worldKey: string,
): GlobalChunkCoord[] {
  const minChunkX = computeChunkCoord(x - radius, chunkWorldWidth);
  const maxChunkX = computeChunkCoord(x + radius, chunkWorldWidth);
  const minChunkY = computeChunkCoord(y - radius, chunkWorldHeight);
  const maxChunkY = computeChunkCoord(y + radius, chunkWorldHeight);

  const chunks: GlobalChunkCoord[] = [];
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      if (!intersectsRadius(x, y, radius, chunkX, chunkY, chunkWorldWidth, chunkWorldHeight)) {
        continue;
      }
      chunks.push({ worldKey, chunkX, chunkY });
    }
  }

  return chunks;
}

function toChunkMapData(
  chunk: GlobalChunkPayload,
  tilesetUrl: string,
  tilesetPxW: number,
  tilesetPxH: number,
): MapData {
  const width = chunk.chunkWidthTiles;
  const height = chunk.chunkHeightTiles;
  return {
    id: `global:${chunk.worldKey}:${chunk.chunkX}:${chunk.chunkY}`,
    name: `global:${chunk.chunkX},${chunk.chunkY}`,
    width,
    height,
    tileWidth: chunk.tileWidth,
    tileHeight: chunk.tileHeight,
    tilesetUrl,
    tilesetPxW,
    tilesetPxH,
    layers: [
      toLayer("bg", "bg", chunk.bgTiles, width, height),
      toLayer("obj", "obj", chunk.objTiles, width, height),
      toLayer("overlay", "overlay", chunk.overlayTiles, width, height),
    ],
    collisionMask: parseCollisionMask(chunk.collisionMask, width, height),
    labels: [],
    animatedTiles: [],
    portals: [],
  };
}

function toLayer(
  name: string,
  type: "bg" | "obj" | "overlay",
  payload: string,
  width: number,
  height: number,
): MapLayer {
  return {
    name,
    type,
    visible: true,
    tiles: parseTilePayload(payload, width, height),
  };
}

function parseTilePayload(payload: string, width: number, height: number): number[] {
  const expectedSize = width * height;
  const fallback = new Array<number>(expectedSize).fill(-1);
  if (!payload) return fallback;

  const parsed = parseJson(payload);
  if (parsed === null) {
    const csvValues = payload
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value));
    if (csvValues.length === expectedSize) return csvValues;
    return fallback;
  }

  if (Array.isArray(parsed) && parsed.length === expectedSize) {
    return parsed.map((value) => (typeof value === "number" ? Math.trunc(value) : -1));
  }

  if (Array.isArray(parsed) && parsed.every((row) => Array.isArray(row))) {
    const flat = (parsed as unknown[][]).flat();
    if (flat.length !== expectedSize) return fallback;
    return flat.map((value) => (typeof value === "number" ? Math.trunc(value) : -1));
  }

  return fallback;
}

function parseCollisionMask(mask: string, width: number, height: number): boolean[] {
  const expectedSize = width * height;
  const fallback = new Array<boolean>(expectedSize).fill(false);
  if (!mask) return fallback;

  const parsed = parseJson(mask);
  if (parsed === null) return fallback;

  if (Array.isArray(parsed) && parsed.length === expectedSize) {
    return parsed.map((value) => value === true);
  }

  if (Array.isArray(parsed) && parsed.every((row) => Array.isArray(row))) {
    const flat = (parsed as unknown[][]).flat();
    if (flat.length !== expectedSize) return fallback;
    return flat.map((value) => value === true);
  }

  return fallback;
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
