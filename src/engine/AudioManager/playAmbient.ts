/**
 * Play a looping ambient sound. Returns a handle to control volume / stop.
 */

import type { ActiveSfxEntry, SfxHandle } from "./types.ts";
import { clampVolume, createSfxSource } from "./createSfxSource.ts";

export interface IAudioManagerPlayAmbient {
  audioContext: AudioContext | null;
  sfxGainNode: GainNode | null;
  activeSfx: Set<ActiveSfxEntry>;
}

export async function playAmbient(
  manager: IAudioManagerPlayAmbient,
  loadBuffer: (url: string) => Promise<AudioBuffer | null>,
  url: string,
  initialVolume: number,
): Promise<SfxHandle | null> {
  const buffer = await loadBuffer(url);
  if (!buffer || !manager.audioContext || !manager.sfxGainNode) return null;

  const { source, gain } = createSfxSource({
    buffer,
    audioContext: manager.audioContext,
    sfxGainNode: manager.sfxGainNode,
    volume: initialVolume,
    loop: true,
  });

  const entry: ActiveSfxEntry = { source, gain };
  manager.activeSfx.add(entry);

  return {
    setVolume: (v: number) => {
      gain.gain.value = clampVolume(v);
    },
    stop: () => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      gain.disconnect();
      manager.activeSfx.delete(entry);
    },
  };
}
