/**
 * Play a one-shot sound effect (not looped).
 */

import { createSfxSource } from "./createSfxSource.ts";

export interface IAudioManagerPlayOneShot {
  audioContext: AudioContext | null;
  sfxGainNode: GainNode | null;
}

export async function playOneShot(
  manager: IAudioManagerPlayOneShot,
  loadBuffer: (url: string) => Promise<AudioBuffer | null>,
  url: string,
  volume: number,
): Promise<void> {
  const buffer = await loadBuffer(url);
  if (!buffer || !manager.audioContext || !manager.sfxGainNode) return;

  createSfxSource({
    buffer,
    audioContext: manager.audioContext,
    sfxGainNode: manager.sfxGainNode,
    volume,
    loop: false,
    onEnded: () => {},
  });
}
