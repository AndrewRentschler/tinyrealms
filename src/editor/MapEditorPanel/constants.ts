/**
 * Map editor constants: tools, options, tilesets, display sizes.
 */
import { TILESHEET_CONFIGS } from "../../config/tilesheet-config.ts";
import type { EditorTool, TilesetInfo } from "./types.ts";

export const TOOLS: { key: EditorTool; label: string }[] = [
  { key: "paint", label: "🖌 Paint" },
  { key: "collision", label: "🚧 Collision" },
  { key: "object", label: "📦 Object" },
  { key: "npc", label: "🧑 NPC" },
  { key: "item", label: "⚔️ Item" },
  { key: "map", label: "🗺 Map" },
  { key: "portal", label: "🚪 Portal" },
  { key: "label", label: "🏷 Label" },
];

/** Delete sub-tools shown in the Delete dropdown */
export const DELETE_OPTIONS: { key: EditorTool; label: string }[] = [
  { key: "erase", label: "🧹 Tile" },
  { key: "collision-erase", label: "🚧 Collision" },
  { key: "object-erase", label: "📦 Object" },
  { key: "npc-erase", label: "🧑 NPC" },
  { key: "item-erase", label: "⚔️ Item" },
  { key: "portal-erase", label: "🚪 Portal" },
  { key: "label-erase", label: "🏷 Label" },
];

/** Move sub-tools shown in the Move dropdown */
export const MOVE_OPTIONS: { key: EditorTool; label: string }[] = [
  { key: "object-move", label: "📦 Object" },
  { key: "npc-move", label: "🧑 NPC" },
];

export const TILESETS: TilesetInfo[] = TILESHEET_CONFIGS;
export const MAP_DEFAULT_TILESET_VALUE = "__map_default__";
export const DISPLAY_TILE_SIZE = 32;
