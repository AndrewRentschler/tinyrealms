import {
  DEFAULT_AMBIENT_RADIUS,
  DEFAULT_AMBIENT_VOLUME,
  AMBIENT_INITIAL_VOLUME,
} from "./constants.ts";
import type { AmbientToggleContext, ObjectSoundConfig } from "./types.ts";

/**
 * Live-refresh sounds after a sprite definition is updated.
 * Stops old sounds, restarts based on ObjectSoundConfig.
 */
export function refreshSoundsForDef(
  layer: AmbientToggleContext,
  defName: string,
  sounds: ObjectSoundConfig,
): void {
  for (const r of layer.rendered) {
    if (r.defName !== defName) continue;

    // Stop old ambient sound
    if (r.sfxHandle) {
      r.sfxHandle.stop();
      r.sfxHandle = undefined;
    }

    // Stop old on-sound
    if (r.onSfxHandle) {
      r.onSfxHandle.stop();
      r.onSfxHandle = undefined;
    }

    // Update cached URLs
    r.onSoundUrl = sounds.onSoundUrl;
    r.interactSoundUrl = sounds.interactSoundUrl;
    r.ambientRadius = undefined;
    r.ambientBaseVolume = undefined;

    // Restart ambient sound if defined and object is on (or non-toggleable)
    if (sounds.ambientSoundUrl && layer.audio && (!r.toggleable || r.isOn)) {
      r.ambientRadius = sounds.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
      r.ambientBaseVolume = sounds.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME;
      layer.audio.playAmbient(sounds.ambientSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
        if (handle) r.sfxHandle = handle;
      });
    }

    // Restart on-sound if defined and object is currently on
    if (sounds.onSoundUrl && layer.audio && r.toggleable && r.isOn) {
      if (!r.ambientRadius) {
        r.ambientRadius = sounds.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
        r.ambientBaseVolume = sounds.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME;
      }
      layer.audio.playAmbient(sounds.onSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
        if (handle) r.onSfxHandle = handle;
      });
    }
  }
}
