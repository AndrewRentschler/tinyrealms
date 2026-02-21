import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { IGame } from "./types.ts";

/**
 * Load sprite definitions from Convex (cached for NPC creation).
 */
export async function loadSpriteDefs(game: IGame): Promise<void> {
  try {
    const convex = getConvexClient();
    const defs = await convex.query(api.spriteDefinitions.list, {});
    game.spriteDefCache = new Map(
      defs.map((d) => [d.name, d]),
    );
  } catch (err) {
    console.warn("Failed to load sprite definitions:", err);
  }
}
