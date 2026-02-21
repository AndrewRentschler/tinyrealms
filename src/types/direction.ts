/**
 * Direction and position types used across the game.
 */

export type Direction = "up" | "down" | "left" | "right";

export interface TilePosition {
  tileX: number;
  tileY: number;
}

export interface WorldPosition {
  x: number;
  y: number;
}
