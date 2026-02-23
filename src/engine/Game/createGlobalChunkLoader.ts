import { api } from "../../../convex/_generated/api";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { GlobalChunkLoader, GlobalChunkPayload } from "../globalChunkCache.ts";

export function createGlobalChunkLoader(): GlobalChunkLoader {
  const convex = getConvexClient();

  return async ({ worldKey, chunkX, chunkY }) => {
    const chunk = await convex.query(api.globalChunks.getChunk, {
      worldKey,
      chunkX,
      chunkY,
    });

    if (!chunk) {
      return null;
    }

    return toGlobalChunkPayload(chunk);
  };
}

function toGlobalChunkPayload(chunk: {
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
}): GlobalChunkPayload {
  return {
    worldKey: chunk.worldKey,
    chunkX: chunk.chunkX,
    chunkY: chunk.chunkY,
    chunkWidthTiles: chunk.chunkWidthTiles,
    chunkHeightTiles: chunk.chunkHeightTiles,
    tileWidth: chunk.tileWidth,
    tileHeight: chunk.tileHeight,
    bgTiles: chunk.bgTiles,
    objTiles: chunk.objTiles,
    overlayTiles: chunk.overlayTiles,
    collisionMask: chunk.collisionMask,
    revision: chunk.revision,
    generatedAt: chunk.generatedAt,
    updatedAt: chunk.updatedAt,
  };
}
