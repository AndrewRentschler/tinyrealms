/**
 * Load music from URL and start playback. Handles pre-unlock queueing.
 * Uses loadBuffer for fetch/decode (with caching).
 */

import { loadBuffer } from "./loadBuffer.ts";
import { startPlayback, stopPlayback } from "./playback.ts";

export interface IAudioManagerLoadAndPlay {
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  bufferCache: Map<string, AudioBuffer>;
  currentBuffer: AudioBuffer | null;
  currentSource: AudioBufferSourceNode | null;
  _playing: boolean;
}

export async function loadAndPlay(
  manager: IAudioManagerLoadAndPlay,
  url: string,
): Promise<void> {
  (manager as { _playing: boolean })._playing = true;

  stopPlayback(manager);

  const buffer = await loadBuffer(
    { audioContext: manager.audioContext, bufferCache: manager.bufferCache },
    url,
  );
  if (!buffer) return;

  (manager as { currentBuffer: AudioBuffer | null }).currentBuffer = buffer;

  if (!manager.audioContext) {
    return;
  }

  if ((manager as { _playing: boolean })._playing) {
    startPlayback(manager);
  }
}
