/**
 * Client-side position interpolation utilities.
 * Used for smooth rendering of remote player positions.
 */

/** Linear interpolation between two values */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Smooth step interpolation (ease-in-out) */
export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Interpolation state for a remote entity */
export interface InterpolationState {
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  lastUpdateTime: number;
  updateInterval: number; // expected ms between server updates
}

/** Create a new interpolation state */
export function createInterpolationState(
  x: number,
  y: number,
  updateInterval = 100
): InterpolationState {
  return {
    prevX: x,
    prevY: y,
    targetX: x,
    targetY: y,
    currentX: x,
    currentY: y,
    lastUpdateTime: Date.now(),
    updateInterval,
  };
}

/** Update interpolation target when new server data arrives */
export function setInterpolationTarget(
  state: InterpolationState,
  x: number,
  y: number
): void {
  state.prevX = state.currentX;
  state.prevY = state.currentY;
  state.targetX = x;
  state.targetY = y;
  state.lastUpdateTime = Date.now();
}

/** Tick the interpolation (call each frame) */
export function tickInterpolation(state: InterpolationState): void {
  const elapsed = Date.now() - state.lastUpdateTime;
  const t = clamp(elapsed / state.updateInterval, 0, 1);
  const smoothT = smoothStep(t);

  state.currentX = lerp(state.prevX, state.targetX, smoothT);
  state.currentY = lerp(state.prevY, state.targetY, smoothT);
}
