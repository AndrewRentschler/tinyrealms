/**
 * Re-exports shared domain types from src/types.
 * Engine modules import from here for backward compatibility.
 */
export type {
  Direction,
  TilePosition,
  WorldPosition,
  MapLayerType,
  MapLayer,
  Portal,
  MapLabel,
  CombatSettings,
  AnimatedTileEntry,
  MapData,
  AnimationDescriptor,
  AnimationTilePlacement,
  PlayerData,
  ProfileData,
  PresenceData,
  AppMode,
} from "../types/index.ts";
