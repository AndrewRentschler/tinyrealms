/**
 * Spatial audio manager using the Web Audio API.
 * Provides distance-based attenuation and stereo panning for sound sources
 * positioned in the 2D world.
 */

interface AudioSource {
  id: string;
  panner: PannerNode;
  source: AudioBufferSourceNode | MediaElementAudioSourceNode | null;
  worldX: number;
  worldY: number;
  loop: boolean;
}

export class SpatialAudio {
  private ctx: AudioContext | null = null;
  private sources: Map<string, AudioSource> = new Map();
  private bufferCache: Map<string, AudioBuffer> = new Map();

  async init() {
    this.ctx = new AudioContext();
    // Resume on user interaction if needed
    if (this.ctx.state === "suspended") {
      const resume = () => {
        this.ctx?.resume();
        document.removeEventListener("click", resume);
        document.removeEventListener("keydown", resume);
      };
      document.addEventListener("click", resume);
      document.addEventListener("keydown", resume);
    }
  }

  /** Update listener position (call each frame with player/camera position) */
  updateListener(x: number, y: number) {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = 0;
    }
  }

  /** Load an audio buffer from URL */
  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error("Failed to load audio:", url, e);
      return null;
    }
  }

  /** Play a sound at a world position */
  async playAt(
    id: string,
    url: string,
    worldX: number,
    worldY: number,
    options?: { loop?: boolean; refDistance?: number; rolloffFactor?: number }
  ) {
    if (!this.ctx) return;

    const buffer = await this.loadBuffer(url);
    if (!buffer) return;

    // Clean up existing source with same id
    this.stop(id);

    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = options?.refDistance ?? 100;
    panner.rolloffFactor = options?.rolloffFactor ?? 1;
    panner.positionX.value = worldX;
    panner.positionY.value = worldY;
    panner.positionZ.value = 0;
    panner.connect(this.ctx.destination);

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
  stop(id: string) {
    const entry = this.sources.get(id);
    if (entry?.source) {
      try {
        (entry.source as AudioBufferSourceNode).stop();
      } catch {
        // already stopped
      }
      this.sources.delete(id);
    }
  }

  /** Stop all sounds */
  stopAll() {
    for (const [id] of this.sources) {
      this.stop(id);
    }
  }

  destroy() {
    this.stopAll();
    this.ctx?.close();
    this.ctx = null;
  }
}
