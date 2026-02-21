/**
 * Animation descriptor types (loaded from animationUrl JSON).
 */

export interface AnimationDescriptor {
  spritesheet: string;
  defaultSpeed: number;
  tileWidth: number;
  tileHeight: number;
  tiles: AnimationTilePlacement[];
}

export interface AnimationTilePlacement {
  x: number;
  y: number;
  animation: string;
  speed?: number;
}
