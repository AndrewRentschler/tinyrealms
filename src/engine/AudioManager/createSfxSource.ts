/**
 * Shared logic for creating and playing SFX sources (ambient loops and one-shots).
 * DRY helper used by playAmbient and playOneShot.
 */

/** Clamp volume to 0–1 */
export function clampVolume(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface CreateSfxSourceOptions {
  buffer: AudioBuffer;
  audioContext: AudioContext;
  sfxGainNode: GainNode;
  volume: number;
  loop: boolean;
  onEnded?: () => void;
}

/**
 * Create a buffer source, connect through a gain node to sfxGainNode, and start playback.
 * Returns the gain node (for volume control) and source (for stop/disconnect).
 */
export function createSfxSource(opts: CreateSfxSourceOptions): {
  source: AudioBufferSourceNode;
  gain: GainNode;
} {
  const { buffer, audioContext, sfxGainNode, volume, loop, onEnded } = opts;

  const gain = audioContext.createGain();
  gain.gain.value = clampVolume(volume);
  gain.connect(sfxGainNode);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.connect(gain);
  source.start(0);

  if (onEnded) {
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      onEnded();
    };
  }

  return { source, gain };
}
