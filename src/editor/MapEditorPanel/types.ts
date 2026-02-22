/**
 * Map editor types: tools, tilesets, placed objects, sprite/item definitions.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import type { MapLayerType } from "../../types/index.ts";
import type { VisibilityType } from "../../types/visibility.ts";

export type { MapLayerType };

export type EditorTool =
  | "paint"
  | "erase"
  | "collision"
  | "collision-erase"
  | "object"
  | "object-erase"
  | "object-move"
  | "npc"
  | "npc-erase"
  | "npc-move"
  | "map"
  | "portal"
  | "portal-erase"
  | "label"
  | "label-erase"
  | "item"
  | "item-erase";

export interface TilesetInfo {
  name: string;
  url: string;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export interface PlacedObject {
  id: string;
  sourceId?: string;
  spriteDefName: string;
  instanceName?: string;
  x: number;
  y: number;
  layer: number;
  isOn?: boolean;
  storageId?: Id<"storages">;
  hasStorage?: boolean;
  storageCapacity?: number;
  storageOwnerType?: "public" | "player";
}

/** Sprite definition row from Convex (subset of fields) */
export interface SpriteDef {
  _id: string;
  name: string;
  category: string;
  visibilityType?: VisibilityType;
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  npcSpeed?: number;
  npcWanderRadius?: number;
  npcDirDown?: string;
  npcDirUp?: string;
  npcDirLeft?: string;
  npcDirRight?: string;
  npcGreeting?: string;
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
  isDoor?: boolean;
  hasStorage?: boolean;
  storageCapacity?: number;
  storageOwnerType?: "public" | "player";
}

export interface ItemDef {
  name: string;
  displayName: string;
  type: string;
  rarity: string;
  iconTilesetUrl?: string;
  iconTileX?: number;
  iconTileY?: number;
  iconTileW?: number;
  iconTileH?: number;
  iconSpriteDefName?: string;
  iconSpriteSheetUrl?: string;
  iconSpriteAnimation?: string;
  iconSpriteAnimationSpeed?: number;
  iconSpriteScale?: number;
  iconSpriteFrameWidth?: number;
  iconSpriteFrameHeight?: number;
}

export interface PlacedItem {
  id: string;
  sourceId?: string;
  itemDefName: string;
  x: number;
  y: number;
  quantity: number;
  respawn?: boolean;
  respawnMs?: number;
  pickedUpAt?: number;
}

/** Minimal context for layer panel helpers (avoids circular imports) */
export interface LayerPanelContext {
  game: {
    mapRenderer: {
      getMapData(): {
        layers: { name?: string; tilesetUrl?: string }[];
        tilesetUrl?: string;
        width?: number;
        height?: number;
      } | null;
      loadMap(d: unknown): void;
    };
  } | null;
  activeLayer: number;
  layerListEl: HTMLElement;
  layerButtons: HTMLButtonElement[];
  setLayer(index: number): void;
  showSaveStatus(text: string, isError?: boolean): void;
  syncTilesetToMapLayer(): void;
  refreshLayerButtonLabels(): void;
  makeLayerName(
    type: MapLayerType,
    layers: { name: string; type: MapLayerType }[],
  ): string;
}

/** Draft state for editing a portal in the map editor */
export interface PortalDraft {
  name: string;
  targetMap: string;
  targetSpawn: string;
  direction: string;
  transition: string;
}
