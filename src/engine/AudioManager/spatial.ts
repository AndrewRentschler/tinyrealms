/**
 * Spatial audio using the Web Audio API.
 * Provides distance-based attenuation and stereo panning for sound sources
 * positioned in the 2D world. Composed into AudioManager — uses shared
 * AudioContext, buffer cache, and sfxGainNode so spatial sounds respect mute.
 */

interface AudioSource {
  id: string;
  panner: PannerNode;
  source: AudioBufferSourceNode | null;
  worldX: number;
  worldY: number;
  loop: boolean;
}

export type LoadBufferFn = (url: string) => Promise<AudioBuffer | null>;

export class SpatialAudio {
  private ctx: AudioContext;
  private bufferCache: Map<string, AudioBuffer>;
  private sfxGainNode: GainNode;
  private loadBufferFn: LoadBufferFn;
  private sources: Map<string, AudioSource> = new Map();

  constructor(
    audioContext: AudioContext,
    bufferCache: Map<string, AudioBuffer>,
    sfxGainNode: GainNode,
    loadBufferFn: LoadBufferFn,
  ) {
    this.ctx = audioContext;
    this.bufferCache = bufferCache;
    this.sfxGainNode = sfxGainNode;
    this.loadBufferFn = loadBufferFn;
  }

  /** Update listener position (call each frame with player/camera position) */
  updateListener(x: number, y: number): void {
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = 0;
    }
  }

  /** Play a sound at a world position */
  async playAt(
    id: string,
    url: string,
    worldX: number,
    worldY: number,
    options?: { loop?: boolean; refDistance?: number; rolloffFactor?: number },
  ): Promise<void> {
    const buffer = await this.loadBufferFn(url);
    if (!buffer) return;

    this.stop(id);

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = options?.refDistance ?? 100;
    panner.rolloffFactor = options?.rolloffFactor ?? 1;
    panner.positionX.value = worldX;
    panner.positionY.value = worldY;
    panner.positionZ.value = 0;
    panner.connect(this.sfxGainNode);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options?.loop ?? false;
    source.connect(panner);
    source.start();

    this.sources.set(id, {
      id,
      panner,
      source,
      worldX,
      worldY,
      loop: options?.loop ?? false,
    });

    source.onended = () => {
      if (!options?.loop) {
        this.sources.delete(id);
      }
    };
  }

  /** Stop a sound */
  stop(id: string): void {
    const entry = this.sources.get(id);
    if (entry?.source) {
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
      this.sources.delete(id);
    }
  }

  /** Stop all sounds */
  stopAll(): void {
    for (const [id] of this.sources) {
      this.stop(id);
    }
  }

  /** Clean up; does NOT close the AudioContext (AudioManager owns it) */
  destroy(): void {
    this.stopAll();
  }
}
