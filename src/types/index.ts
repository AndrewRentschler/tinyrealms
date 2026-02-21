/**
 * Shared domain types. Re-exports from domain-specific modules.
 */

export type { Direction, TilePosition, WorldPosition } from "./direction.ts";
export type {
  MapLayerType,
  MapLayer,
  Portal,
  MapLabel,
  CombatSettings,
  AnimatedTileEntry,
  MapData,
} from "./map.ts";
export type {
  AnimationDescriptor,
  AnimationTilePlacement,
} from "./animation.ts";
export type { PlayerData, ProfileData } from "./profile.ts";
export type { PresenceData } from "./presence.ts";
export type { AppMode } from "./app.ts";
export type { VisibilityType } from "./visibility.ts";
