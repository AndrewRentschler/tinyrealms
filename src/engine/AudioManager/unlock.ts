import type { IAudioManagerUnlock } from "./types.ts";
import { startPlayback } from "./playback.ts";
import { GAIN_MUTED, GAIN_SFX_UNMUTED } from "./constants.ts";

export interface UnlockResult {
  audioContext: AudioContext;
  gainNode: GainNode;
  sfxGainNode: GainNode;
}

/**
 * Unlock the audio context after a user gesture (required by autoplay policy).
 * Creates AudioContext and gain nodes. Caller must assign results to manager.
 * Returns null if already unlocked.
 */
export function unlock(manager: IAudioManagerUnlock): UnlockResult | null {
  if (manager.audioContext) return null;

  const audioContext = new AudioContext();

  const gainNode = audioContext.createGain();
  gainNode.gain.value = manager._muted ? GAIN_MUTED : manager._volume;
  gainNode.connect(audioContext.destination);

  const sfxGainNode = audioContext.createGain();
  sfxGainNode.gain.value = manager._muted ? GAIN_MUTED : GAIN_SFX_UNMUTED;
  sfxGainNode.connect(audioContext.destination);

  return { audioContext, gainNode, sfxGainNode };
}

/**
 * Start queued playback after unlock. Call after assigning unlock result to manager.
 */
export function startQueuedPlaybackIfNeeded(manager: IAudioManagerUnlock): void {
  if (manager._playing && manager.currentBuffer) {
    startPlayback(manager);
  }
}
