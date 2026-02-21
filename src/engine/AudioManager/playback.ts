/**
 * Playback control for AudioManager music. Extracted for separation of concerns.
 */

export interface IAudioManagerPlayback {
  readonly audioContext: AudioContext | null;
  readonly gainNode: GainNode | null;
  readonly currentBuffer: AudioBuffer | null;
  currentSource: AudioBufferSourceNode | null;
}

export function startPlayback(manager: IAudioManagerPlayback): void {
  if (!manager.audioContext || !manager.gainNode || !manager.currentBuffer) return;

  stopPlayback(manager);

  const source = manager.audioContext.createBufferSource();
  source.buffer = manager.currentBuffer;
  source.loop = true;
  source.connect(manager.gainNode);
  source.start(0);
  manager.currentSource = source;
}

export function stopPlayback(manager: IAudioManagerPlayback): void {
  const source = manager.currentSource;
  if (!source) return;

  try {
    source.stop();
  } catch {
    // Already stopped (e.g. ended naturally)
  }
  source.disconnect();
  manager.currentSource = null;
}
