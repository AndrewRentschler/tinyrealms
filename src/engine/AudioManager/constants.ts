/**
 * AudioManager engine constants. Volume defaults live in config/audio-config.ts.
 */

/** Gain value when muted */
export const GAIN_MUTED = 0;

/** SFX gain value when unmuted */
export const GAIN_SFX_UNMUTED = 1;

/** Max entries in buffer cache before LRU eviction */
export const BUFFER_CACHE_MAX_SIZE = 64;

/** OfflineAudioContext params for decoding without user gesture */
export const AUDIO_CHANNELS = 2;
export const AUDIO_SAMPLE_RATE = 44100;
export const AUDIO_LENGTH = 44100;

/** Re-export volume defaults from central config for convenience */
export {
  DEFAULT_AMBIENT_INITIAL_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_ONE_SHOT_VOLUME,
} from "../../config/audio-config.ts";
