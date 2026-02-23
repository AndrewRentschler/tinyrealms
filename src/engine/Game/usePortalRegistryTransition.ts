import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../lib/convexClient.ts";
import type { IGame } from "./types.ts";

const DEFAULT_CHUNK_WIDTH_TILES = 64;
const DEFAULT_CHUNK_HEIGHT_TILES = 64;
const DEFAULT_TILE_SIZE = 32;

function resolveChunkWorldSize(tileSize: number | undefined, chunkTiles: number): number {
  if (!Number.isFinite(tileSize) || (tileSize ?? 0) <= 0) {
    return DEFAULT_TILE_SIZE * chunkTiles;
  }
  const resolvedTileSize = tileSize ?? DEFAULT_TILE_SIZE;
  return resolvedTileSize * chunkTiles;
}

export async function usePortalRegistryTransition(game: IGame, portalId: string) {
  const profileId = game.profile._id as Id<"profiles">;
  const chunkWorldWidth = resolveChunkWorldSize(
    game.currentMapData?.tileWidth,
    DEFAULT_CHUNK_WIDTH_TILES,
  );
  const chunkWorldHeight = resolveChunkWorldSize(
    game.currentMapData?.tileHeight,
    DEFAULT_CHUNK_HEIGHT_TILES,
  );

  const convex = getConvexClient();
  return convex.mutation(api.mechanics.dimensionTransition.usePortal, {
    profileId,
    portalId,
    chunkWorldWidth,
    chunkWorldHeight,
  });
}
