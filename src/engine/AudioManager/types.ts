/**
 * Types for AudioManager module composition.
 * IAudioManagerUnlock is the minimal interface passed to extracted modules to avoid circular imports.
 */

/** Handle returned when creating an ambient/looping SFX */
export interface SfxHandle {
  /** Set volume (0–1). Will be further scaled by distance. */
  setVolume(v: number): void;
  /** Stop and clean up */
  stop(): void;
}

/** Entry in activeSfx set */
export interface ActiveSfxEntry {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export interface IAudioManagerUnlock {
  audioContext: AudioContext | null;
  gainNode: GainNode | null;
  sfxGainNode: GainNode | null;
  currentSource: AudioBufferSourceNode | null;
  currentBuffer: AudioBuffer | null;
  _muted: boolean;
  _volume: number;
  _playing: boolean;
  _started: boolean;
}
