/**
 * Audio manager using Web Audio API.
 * Supports looping background music, ambient sound effects (with distance-based
 * volume), and one-shot sound effects.
 */

import {
  DEFAULT_AMBIENT_INITIAL_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_ONE_SHOT_VOLUME,
  GAIN_MUTED,
  GAIN_SFX_UNMUTED,
} from "./AudioManager/constants.ts";
import { clampVolume } from "./AudioManager/createSfxSource.ts";
import { loadBuffer } from "./AudioManager/loadBuffer.ts";
import {
  startQueuedPlaybackIfNeeded,
  unlock,
} from "./AudioManager/unlock.ts";
import { startPlayback, stopPlayback } from "./AudioManager/playback.ts";
import { destroy as destroyAudio } from "./AudioManager/destroy.ts";
import { loadAndPlay as loadAndPlayFn } from "./AudioManager/loadAndPlay.ts";
import { playAmbient as playAmbientFn } from "./AudioManager/playAmbient.ts";
import { playOneShot as playOneShotFn } from "./AudioManager/playOneShot.ts";
import type { ActiveSfxEntry, IAudioManagerUnlock, SfxHandle } from "./AudioManager/types.ts";

export type { SfxHandle } from "./AudioManager/types.ts";

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;      // master music gain
  private sfxGainNode: GainNode | null = null;    // master SFX gain
  private currentSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private _volume = DEFAULT_MUSIC_VOLUME;
  private _muted = false;
  private _playing = false;
  private _started = false;

  /** Cache of decoded audio buffers by URL */
  private bufferCache = new Map<string, AudioBuffer>();

  /** Active ambient SFX handles for cleanup */
  private activeSfx: Set<ActiveSfxEntry> = new Set();

  /** Must be called after a user gesture to satisfy autoplay policy */
  unlock() {
    const result = unlock(this as unknown as IAudioManagerUnlock);
    if (!result) return;
    this.audioContext = result.audioContext;
    this.gainNode = result.gainNode;
    this.sfxGainNode = result.sfxGainNode;
    this._started = true;
    startQueuedPlaybackIfNeeded(this as unknown as IAudioManagerUnlock);
  }

  async loadAndPlay(url: string) {
    await loadAndPlayFn(this.toLoadAndPlayAdapter(), url);
  }

  private toPlaybackAdapter() {
    const m = this;
    return {
      get audioContext() {
        return m.audioContext;
      },
      get gainNode() {
        return m.gainNode;
      },
      get currentBuffer() {
        return m.currentBuffer;
      },
      get currentSource() {
        return m.currentSource;
      },
      set currentSource(v: AudioBufferSourceNode | null) {
        m.currentSource = v;
      },
    };
  }

  private toLoadAndPlayAdapter() {
    const m = this;
    return {
      get audioContext() {
        return m.audioContext;
      },
      get gainNode() {
        return m.gainNode;
      },
      get bufferCache() {
        return m.bufferCache;
      },
      get currentBuffer() {
        return m.currentBuffer;
      },
      set currentBuffer(v: AudioBuffer | null) {
        m.currentBuffer = v;
      },
      get currentSource() {
        return m.currentSource;
      },
      set currentSource(v: AudioBufferSourceNode | null) {
        m.currentSource = v;
      },
      get _playing() {
        return m._playing;
      },
      set _playing(v: boolean) {
        m._playing = v;
      },
    };
  }

  private startPlayback() {
    startPlayback(this.toPlaybackAdapter());
  }

  private stopPlayback() {
    stopPlayback(this.toPlaybackAdapter());
  }

  stop() {
    this._playing = false;
    this.stopPlayback();
  }

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = clampVolume(v);
    if (this.gainNode && !this._muted) {
      this.gainNode.gain.value = this._volume;
    }
  }

  get muted() {
    return this._muted;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this.gainNode) {
      this.gainNode.gain.value = this._muted ? GAIN_MUTED : this._volume;
    }
    if (this.sfxGainNode) {
      this.sfxGainNode.gain.value = this._muted ? GAIN_MUTED : GAIN_SFX_UNMUTED;
    }
    return this._muted;
  }

  get isStarted() {
    return this._started;
  }

  // =========================================================================
  // SFX: Ambient loops + one-shots
  // =========================================================================

  /** Load and decode an audio buffer (cached) */
  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    return loadBuffer(
      { audioContext: this.audioContext, bufferCache: this.bufferCache },
      url
    );
  }

  /**
   * Play a looping ambient sound. Returns a handle to control volume / stop.
   * Volume should be set externally based on distance from listener.
   */
  async playAmbient(
    url: string,
    initialVolume = DEFAULT_AMBIENT_INITIAL_VOLUME,
  ): Promise<SfxHandle | null> {
    return playAmbientFn(
      {
        audioContext: this.audioContext,
        sfxGainNode: this.sfxGainNode,
        activeSfx: this.activeSfx,
      },
      (u) => this.loadBuffer(u),
      url,
      initialVolume,
    );
  }

  /** Play a one-shot sound effect (not looped) */
  async playOneShot(url: string, volume = DEFAULT_ONE_SHOT_VOLUME): Promise<void> {
    return playOneShotFn(
      {
        audioContext: this.audioContext,
        sfxGainNode: this.sfxGainNode,
      },
      (u) => this.loadBuffer(u),
      url,
      volume,
    );
  }

  destroy() {
    destroyAudio({
      activeSfx: this.activeSfx,
      audioContext: this.audioContext,
      getPlaybackAdapter: () => this.toPlaybackAdapter(),
      onDestroyed: () => {
        this._playing = false;
        this.audioContext = null;
        this.gainNode = null;
        this.sfxGainNode = null;
        this.currentSource = null;
        this.currentBuffer = null;
      },
    });
  }
}
