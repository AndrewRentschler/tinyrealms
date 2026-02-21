import type { RenderedWorldItem, WorldItemLayerUpdateState } from "./types.ts";
import {
  BOB_AMPLITUDE,
  BOB_SPEED,
  GLOW_PULSE_AMPLITUDE,
  GLOW_PULSE_BASE_ALPHA,
  GLOW_PULSE_SPEED,
  ITEM_INTERACT_RADIUS_SQ,
} from "./constants.ts";

/**
 * Update bob animation, find nearest item within interact radius, update glow/prompt visibility.
 * Single pass over rendered items; uses squared distance to avoid sqrt. Mutates state.elapsed and
 * state.nearestItem; returns the nearest RenderedWorldItem or null.
 */
export function update(
  dt: number,
  playerX: number,
  playerY: number,
  state: WorldItemLayerUpdateState,
): RenderedWorldItem | null {
  state.elapsed += dt;

  let nearest: RenderedWorldItem | null = null;
  let nearestDistSq = ITEM_INTERACT_RADIUS_SQ;

  for (const r of state.rendered) {
    if (!r.available) continue;
    const bob = Math.sin(state.elapsed * BOB_SPEED + r.bobPhase) * BOB_AMPLITUDE;
    r.sprite.y = bob;

    const dx = r.baseX - playerX;
    const dy = r.baseY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearest = r;
      nearestDistSq = distSq;
    }
  }

  if (state.nearestItem && state.nearestItem !== nearest) {
    state.nearestItem.glow.visible = false;
    state.nearestItem.prompt.visible = false;
  }

  state.nearestItem = nearest;
  if (nearest) {
    nearest.glow.visible = true;
    nearest.prompt.visible = true;
    const pulse =
      GLOW_PULSE_BASE_ALPHA +
      GLOW_PULSE_AMPLITUDE * Math.sin(state.elapsed * GLOW_PULSE_SPEED);
    nearest.glow.alpha = pulse;
  }

  return nearest;
}
