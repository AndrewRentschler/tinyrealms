export const DEFAULT_CHUNK_WIDTH_TILES = 64;
export const DEFAULT_CHUNK_HEIGHT_TILES = 64;
export const DEFAULT_RENDER_PAGE_TILES = 32;

function assertPositiveSize(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be > 0`);
  }
}

function assertNonNegativeRadius(radius: number): void {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error("radius must be >= 0");
  }
}

/**
 * Converts a world coordinate to a chunk index using floor semantics.
 */
export function computeChunkCoord(value: number, chunkWorldSize: number): number {
  assertPositiveSize("chunkWorldSize", chunkWorldSize);
  return Math.floor(value / chunkWorldSize);
}

/**
 * Computes chunk coordinates for a world-space point.
 */
export function computeChunkXY(
  x: number,
  y: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number
): { chunkX: number; chunkY: number } {
  return {
    chunkX: computeChunkCoord(x, chunkWorldWidth),
    chunkY: computeChunkCoord(y, chunkWorldHeight),
  };
}

/**
 * Returns the world-space origin of a chunk.
 */
export function chunkOriginWorld(
  chunkX: number,
  chunkY: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number
): { x: number; y: number } {
  assertPositiveSize("chunkWorldWidth", chunkWorldWidth);
  assertPositiveSize("chunkWorldHeight", chunkWorldHeight);

  return {
    x: chunkX * chunkWorldWidth,
    y: chunkY * chunkWorldHeight,
  };
}

/**
 * Converts world-space coordinates to chunk coordinates and local chunk-space offsets.
 */
export function worldToChunkLocal(
  x: number,
  y: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number
): { chunkX: number; chunkY: number; localX: number; localY: number } {
  const { chunkX, chunkY } = computeChunkXY(x, y, chunkWorldWidth, chunkWorldHeight);

  return {
    chunkX,
    chunkY,
    localX: x - chunkX * chunkWorldWidth,
    localY: y - chunkY * chunkWorldHeight,
  };
}

/**
 * Tests if a circle intersects with a chunk rectangle using the closest point algorithm.
 * Finds the closest point on the chunk rectangle to the circle center and checks if
 * the distance is within the radius.
 */
function intersectsRadius(
  x: number,
  y: number,
  radius: number,
  chunkX: number,
  chunkY: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number
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

/**
 * Lists chunk coordinates whose bounds intersect a world-space radius.
 */
export function chunksForRadius(
  x: number,
  y: number,
  radius: number,
  chunkWorldWidth: number,
  chunkWorldHeight: number
): Array<{ chunkX: number; chunkY: number }> {
  assertPositiveSize("chunkWorldWidth", chunkWorldWidth);
  assertPositiveSize("chunkWorldHeight", chunkWorldHeight);
  assertNonNegativeRadius(radius);

  const minChunkX = computeChunkCoord(x - radius, chunkWorldWidth);
  const maxChunkX = computeChunkCoord(x + radius, chunkWorldWidth);
  const minChunkY = computeChunkCoord(y - radius, chunkWorldHeight);
  const maxChunkY = computeChunkCoord(y + radius, chunkWorldHeight);

  const chunks: Array<{ chunkX: number; chunkY: number }> = [];

  for (let cy = minChunkY; cy <= maxChunkY; cy += 1) {
    for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
      if (
        intersectsRadius(
          x,
          y,
          radius,
          cx,
          cy,
          chunkWorldWidth,
          chunkWorldHeight
        )
      ) {
        chunks.push({ chunkX: cx, chunkY: cy });
      }
    }
  }

  return chunks;
}
