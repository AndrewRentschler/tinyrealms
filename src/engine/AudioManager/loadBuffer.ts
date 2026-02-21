/**
 * Load and decode audio buffers with caching.
 */

import {
  AUDIO_CHANNELS,
  AUDIO_LENGTH,
  AUDIO_SAMPLE_RATE,
} from "./constants.ts";

export interface IAudioManagerLoadBuffer {
  audioContext: AudioContext | null;
  bufferCache: Map<string, AudioBuffer>;
}

export async function loadBuffer(
  manager: IAudioManagerLoadBuffer,
  url: string
): Promise<AudioBuffer | null> {
  if (manager.bufferCache.has(url)) {
    return manager.bufferCache.get(url)!;
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const ctx =
      manager.audioContext ??
      new OfflineAudioContext(
        AUDIO_CHANNELS,
        AUDIO_LENGTH,
        AUDIO_SAMPLE_RATE
      );
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    manager.bufferCache.set(url, decoded);
    return decoded;
  } catch (err) {
    console.warn("Failed to load audio:", url, err);
    return null;
  }
}
