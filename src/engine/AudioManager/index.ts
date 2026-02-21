/**
 * AudioManager module. Web Audio API manager for BGM, ambient SFX, and one-shots.
 * Re-exports types, constants, and the AudioManager class.
 */

import {
  DEFAULT_AMBIENT_INITIAL_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_ONE_SHOT_VOLUME,
  GAIN_MUTED,
  GAIN_SFX_UNMUTED,
} from "./constants.ts";
import { clampVolume } from "./createSfxSource.ts";
import { loadBuffer } from "./loadBuffer.ts";
import {
  startQueuedPlaybackIfNeeded,
  unlock,
} from "./unlock.ts";
import {
  startPlayback,
  stopPlayback,
  type IAudioManagerPlayback,
} from "./playback.ts";
import { type IAudioManagerLoadAndPlay } from "./loadAndPlay.ts";
import { destroy as destroyAudio } from "./destroy.ts";
import { loadAndPlay as loadAndPlayFn } from "./loadAndPlay.ts";
import { playAmbient as playAmbientFn } from "./playAmbient.ts";
import { playOneShot as playOneShotFn } from "./playOneShot.ts";
import { SpatialAudio } from "./spatial.ts";
import type { ActiveSfxEntry, IAudioManagerUnlock, SfxHandle } from "./types.ts";

export type { ActiveSfxEntry, SfxHandle } from "./types.ts";
export { SpatialAudio } from "./spatial.ts";
export {
  DEFAULT_AMBIENT_INITIAL_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_ONE_SHOT_VOLUME,
} from "./constants.ts";

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

  /** Spatial audio (created after unlock) */
  private spatialAudio: SpatialAudio | null = null;

  /** Cached adapters to avoid GC pressure */
  private _playbackAdapter: IAudioManagerPlayback | null = null;
  private _loadAndPlayAdapter: IAudioManagerLoadAndPlay | null = null;

  /** Must be called after a user gesture to satisfy autoplay policy */
  unlock() {
    const result = unlock(this as unknown as IAudioManagerUnlock);
    if (!result) return;
    this.audioContext = result.audioContext;
    this.gainNode = result.gainNode;
    this.sfxGainNode = result.sfxGainNode;
    this._started = true;
    this.spatialAudio = new SpatialAudio(
      this.audioContext,
      this.bufferCache,
      this.sfxGainNode,
      (u) => this.loadBuffer(u),
    );
    startQueuedPlaybackIfNeeded(this as unknown as IAudioManagerUnlock);
  }

  /** Get spatial audio for updateListener, playAt, etc. Null until unlock. */
  getSpatialAudio(): SpatialAudio | null {
    return this.spatialAudio;
  }

  async loadAndPlay(url: string) {
    await loadAndPlayFn(this.toLoadAndPlayAdapter(), url);
  }

  private toPlaybackAdapter(): IAudioManagerPlayback {
    if (this._playbackAdapter) return this._playbackAdapter;
    const m = this;
    this._playbackAdapter = {
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
    return this._playbackAdapter;
  }

  private toLoadAndPlayAdapter(): IAudioManagerLoadAndPlay {
    if (this._loadAndPlayAdapter) return this._loadAndPlayAdapter;
    const m = this;
    this._loadAndPlayAdapter = {
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
    return this._loadAndPlayAdapter;
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
    this.spatialAudio?.destroy();
    this.spatialAudio = null;
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
        this._playbackAdapter = null;
        this._loadAndPlayAdapter = null;
      },
    });
  }
}
