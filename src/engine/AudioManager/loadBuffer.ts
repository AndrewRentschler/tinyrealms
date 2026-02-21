/**
 * Load and decode audio buffers with caching.
 * Uses LRU eviction when cache exceeds BUFFER_CACHE_MAX_SIZE.
 */

import {
  AUDIO_CHANNELS,
  AUDIO_LENGTH,
  AUDIO_SAMPLE_RATE,
  BUFFER_CACHE_MAX_SIZE,
} from "./constants.ts";

export interface IAudioManagerLoadBuffer {
  audioContext: AudioContext | null;
  bufferCache: Map<string, AudioBuffer>;
}

export async function loadBuffer(
  manager: IAudioManagerLoadBuffer,
  url: string
): Promise<AudioBuffer | null> {
  const cache = manager.bufferCache;
  if (cache.has(url)) {
    const buf = cache.get(url)!;
    cache.delete(url);
    cache.set(url, buf);
    return buf;
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

    while (cache.size >= BUFFER_CACHE_MAX_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      } else {
        break;
      }
    }
    cache.set(url, decoded);
    return decoded;
  } catch (err) {
    console.warn("Failed to load audio:", url, err);
    return null;
  }
}
