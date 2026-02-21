import { DEFAULT_AMBIENT_VOLUME } from "./constants.ts";
import type { AmbientToggleContext } from "./types.ts";

/**
 * Call each frame with the player's world position to update ambient volumes.
 * Loops rendered, updates sfxHandle/onSfxHandle volume based on distance.
 */
export function updateAmbientVolumes(
  layer: AmbientToggleContext,
  listenerX: number,
  listenerY: number,
): void {
  for (const r of layer.rendered) {
    if (!r.ambientRadius) continue;

    const dx = r.x - listenerX;
    const dy = r.y - listenerY;
    const distSq = dx * dx + dy * dy;
    const radiusSq = r.ambientRadius * r.ambientRadius;
    if (distSq >= radiusSq) {
      if (r.sfxHandle) r.sfxHandle.setVolume(0);
      if (r.onSfxHandle) r.onSfxHandle.setVolume(0);
      continue;
    }
    const dist = Math.sqrt(distSq);
    const vol = (1 - dist / r.ambientRadius) * (r.ambientBaseVolume ?? DEFAULT_AMBIENT_VOLUME);
    if (r.sfxHandle) r.sfxHandle.setVolume(vol);
    if (r.onSfxHandle) r.onSfxHandle.setVolume(vol);
  }
}
