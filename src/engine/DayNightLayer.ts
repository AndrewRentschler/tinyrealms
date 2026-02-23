import { Container, Graphics } from "pixi.js";
import { getDayPhase, normalizeHour } from "./dayPhase.ts";

export interface DayNightViewport {
  width: number;
  height: number;
  cameraX: number;
  cameraY: number;
}

interface OverlayTone {
  color: number;
  alpha: number;
}

const NIGHT_TONE: OverlayTone = {
  color: 0x10223f,
  alpha: 0.44,
};

const DAY_TONE: OverlayTone = {
  color: 0xfff1c7,
  alpha: 0.045,
};

export class DayNightLayer {
  container: Container;
  private readonly overlay: Graphics;
  private viewportW = 1;
  private viewportH = 1;
  private toneColor = DAY_TONE.color;
  private toneAlpha = DAY_TONE.alpha;

  constructor() {
    this.container = new Container();
    this.container.label = "day-night-layer";
    this.overlay = new Graphics();
    this.container.addChild(this.overlay);
    this.redrawOverlay();
  }

  update(hour: number, viewport: DayNightViewport): void {
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    if (width !== this.viewportW || height !== this.viewportH) {
      this.viewportW = width;
      this.viewportH = height;
      this.redrawOverlay();
    }

    this.container.x = viewport.cameraX - width / 2;
    this.container.y = viewport.cameraY - height / 2;

    const normalizedHour = normalizeHour(hour);
    const tone = this.getTone(normalizedHour);
    if (tone.color !== this.toneColor || Math.abs(tone.alpha - this.toneAlpha) > 0.001) {
      this.toneColor = tone.color;
      this.toneAlpha = tone.alpha;
      this.redrawOverlay();
    }
  }

  resize(width: number, height: number): void {
    const nextW = Math.max(1, Math.floor(width));
    const nextH = Math.max(1, Math.floor(height));
    if (nextW === this.viewportW && nextH === this.viewportH) return;

    this.viewportW = nextW;
    this.viewportH = nextH;
    this.redrawOverlay();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private redrawOverlay(): void {
    this.overlay.clear();
    this.overlay.rect(0, 0, this.viewportW, this.viewportH);
    this.overlay.fill({ color: this.toneColor, alpha: this.toneAlpha });
  }

  private getTone(hour: number): OverlayTone {
    const phase = getDayPhase(hour);

    if (phase === "dawn") {
      const t = clamp01((hour - 5) / 2);
      return blendTone(NIGHT_TONE, DAY_TONE, t);
    }

    if (phase === "dusk") {
      const t = clamp01((hour - 18) / 2);
      return blendTone(DAY_TONE, NIGHT_TONE, t);
    }

    if (phase === "day") {
      const daylightT = clamp01((hour - 7) / 11);
      const middayDip = 1 - Math.sin(daylightT * Math.PI);
      return {
        color: DAY_TONE.color,
        alpha: DAY_TONE.alpha + middayDip * 0.02,
      };
    }

    return NIGHT_TONE;
  }
}

function blendTone(from: OverlayTone, to: OverlayTone, t: number): OverlayTone {
  return {
    color: lerpColor(from.color, to.color, t),
    alpha: lerp(from.alpha, to.alpha, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;

  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  const rr = Math.round(lerp(ar, br, t));
  const rg = Math.round(lerp(ag, bg, t));
  const rb = Math.round(lerp(ab, bb, t));

  return (rr << 16) | (rg << 8) | rb;
}
