/**
 * Destroys the AudioManager: stops music, cleans up all SFX, and closes the audio context.
 */

import { stopPlayback } from "./playback.ts";
import type { IAudioManagerPlayback } from "./playback.ts";
import type { ActiveSfxEntry } from "./types.ts";

/** Minimal interface for destroy — activeSfx, audioContext, playback adapter. */
export interface IAudioManagerDestroy {
  activeSfx: Set<ActiveSfxEntry>;
  audioContext: AudioContext | null;
  getPlaybackAdapter: () => IAudioManagerPlayback;
  onDestroyed: () => void;
}

export function destroy(manager: IAudioManagerDestroy): void {
  stopPlayback(manager.getPlaybackAdapter());

  for (const entry of manager.activeSfx) {
    try {
      entry.source.stop();
    } catch {
      /* Already stopped */
    }
    entry.source.disconnect();
    entry.gain.disconnect();
  }
  manager.activeSfx.clear();

  if (manager.audioContext) {
    manager.audioContext.close();
  }

  manager.onDestroyed();
}
