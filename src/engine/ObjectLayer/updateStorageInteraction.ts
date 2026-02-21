import {
  GLOW_BASE_ALPHA,
  GLOW_PULSE_AMPLITUDE,
  GLOW_PULSE_FREQUENCY,
  STORAGE_INTERACT_RADIUS_SQ,
} from "./constants.ts";
import type { ObjectLayerContext } from "./types.ts";

/**
 * Update glow/prompt visibility for storage objects based on player proximity.
 * Shows glow and "[E] Open" prompt when player is near a storage object.
 */
export function updateStorageInteraction(
  layer: ObjectLayerContext,
  playerX: number,
  playerY: number,
): void {
  let nearestStorage: ObjectLayerContext["rendered"][number] | null = null;
  let nearestDistSq = STORAGE_INTERACT_RADIUS_SQ;

  // Find nearest storage object within range
  for (const r of layer.rendered) {
    if (!r.storageId || !r.glow || !r.prompt) continue;

    const dx = r.x - playerX;
    const dy = r.y - playerY;
    const distSq = dx * dx + dy * dy;

    if (distSq < nearestDistSq) {
      nearestStorage = r;
      nearestDistSq = distSq;
    }
  }

  // Hide glow/prompt on previous nearest storage if changed
  for (const r of layer.rendered) {
    if (r.storageId && r !== nearestStorage && r.glow && r.prompt) {
      r.glow.visible = false;
      r.prompt.visible = false;
    }
  }

  // Show glow/prompt on nearest storage
  if (nearestStorage && nearestStorage.glow && nearestStorage.prompt) {
    nearestStorage.glow.visible = true;
    nearestStorage.glow.alpha = GLOW_BASE_ALPHA + GLOW_PULSE_AMPLITUDE * Math.sin(layer.elapsed * GLOW_PULSE_FREQUENCY);
    nearestStorage.prompt.visible = true;
  }
}
