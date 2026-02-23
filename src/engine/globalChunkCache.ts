export interface GlobalChunkCoord {
  worldKey: string;
  chunkX: number;
  chunkY: number;
}

export interface GlobalChunkPayload {
  worldKey: string;
  chunkX: number;
  chunkY: number;
  chunkWidthTiles: number;
  chunkHeightTiles: number;
  tileWidth: number;
  tileHeight: number;
  bgTiles: string;
  objTiles: string;
  overlayTiles: string;
  collisionMask: string;
  revision: number;
  generatedAt: number;
  updatedAt: number;
}

export type GlobalChunkLoader = (
  coord: GlobalChunkCoord,
) => Promise<GlobalChunkPayload | null>;

interface CacheEntry<T> {
  value: T;
  touchedAt: number;
}

export function makeGlobalChunkKey(coord: GlobalChunkCoord): string {
  return `${coord.worldKey}:${coord.chunkX}:${coord.chunkY}`;
}

export class GlobalChunkCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T | null>>();
  private retainedKeys = new Set<string>();

  get(coord: GlobalChunkCoord): T | null {
    const key = makeGlobalChunkKey(coord);
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.touchedAt = Date.now();
    return entry.value;
  }

  touch(coord: GlobalChunkCoord): void {
    const key = makeGlobalChunkKey(coord);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.touchedAt = Date.now();
  }

  touchMany(coords: Iterable<GlobalChunkCoord>): void {
    for (const coord of coords) {
      this.touch(coord);
    }
  }

  retainWindow(coords: Iterable<GlobalChunkCoord>): Set<string> {
    const nextRetained = new Set<string>();
    for (const coord of coords) {
      const key = makeGlobalChunkKey(coord);
      nextRetained.add(key);
      const entry = this.entries.get(key);
      if (entry) {
        entry.touchedAt = Date.now();
      }
    }
    this.retainedKeys = nextRetained;
    return nextRetained;
  }

  async getOrLoad(
    coord: GlobalChunkCoord,
    loader: (coord: GlobalChunkCoord) => Promise<T | null>,
  ): Promise<T | null> {
    const key = makeGlobalChunkKey(coord);
    const cached = this.entries.get(key);
    if (cached) {
      cached.touchedAt = Date.now();
      return cached.value;
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const request = loader(coord)
      .then((value) => {
        if (value !== null && this.retainedKeys.has(key)) {
          this.entries.set(key, {
            value,
            touchedAt: Date.now(),
          });
        }
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, request);
    return request;
  }

  evictStale(): number {
    let evicted = 0;
    for (const key of this.entries.keys()) {
      if (this.retainedKeys.has(key)) continue;
      this.entries.delete(key);
      evicted += 1;
    }
    return evicted;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.retainedKeys.clear();
  }
}
