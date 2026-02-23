import { Container, Graphics } from "pixi.js";

export type WeatherMode = "clear" | "rainy" | "scattered_rain";
export type WeatherIntensity = "light" | "medium" | "heavy";

export class WeatherLayer {
  container: Container;
  private mode: WeatherMode = "clear";
  private intensity: WeatherIntensity = "medium";
  private lightningEnabled = false;
  private lightningChancePerSec = 0;
  private readonly rainGraphics: Graphics;
  private readonly tintOverlay: Graphics;
  private readonly lightningOverlay: Graphics;
  private viewportW = 0;
  private viewportH = 0;
  private rainStreaks: RainStreak[] = [];
  private lightningTimer = 0;
  private lightningDuration = 0;

  constructor() {
    this.container = new Container();
    this.container.label = "weather-layer";

    this.tintOverlay = new Graphics();
    this.rainGraphics = new Graphics();
    this.lightningOverlay = new Graphics();

    this.container.addChild(this.tintOverlay);
    this.container.addChild(this.rainGraphics);
    this.container.addChild(this.lightningOverlay);

    this.setOverlaysVisible(false);
  }

  setMode(mode: WeatherMode): void {
    this.mode = mode;
    const isRainy = this.mode === "rainy";
    this.setOverlaysVisible(isRainy);
    if (!isRainy) {
      this.lightningTimer = 0;
      this.lightningDuration = 0;
      this.lightningOverlay.visible = false;
    }
  }

  setIntensity(intensity: WeatherIntensity): void {
    this.intensity = intensity;
  }

  setLightningEnabled(enabled: boolean): void {
    this.lightningEnabled = enabled;
  }

  setLightningChancePerSec(chance: number): void {
    this.lightningChancePerSec = Math.max(0, chance);
  }

  update(dt: number, camX?: number, camY?: number, vpW?: number, vpH?: number): void {
    if (typeof vpW === "number" && typeof vpH === "number") {
      this.resize(vpW, vpH);
    }

    if (
      typeof camX === "number"
      && typeof camY === "number"
      && this.viewportW > 0
      && this.viewportH > 0
    ) {
      this.container.x = camX - this.viewportW / 2;
      this.container.y = camY - this.viewportH / 2;
    }

    if (this.mode !== "rainy") {
      return;
    }

    const profile = INTENSITY_PROFILE[this.intensity];
    this.setOverlaysVisible(true);
    this.tintOverlay.alpha = profile.tintAlpha;

    const clampedDt = Math.max(0.001, Math.min(dt, 0.05));
    this.syncRainStreakCount(profile.density);
    this.stepRainStreaks(clampedDt, profile);
    this.renderRain(profile);
    this.stepLightning(clampedDt, profile.lightningAlpha);
  }

  setConfig(config: { intensity?: WeatherIntensity; lightningEnabled?: boolean; lightningChancePerSec?: number }): void {
    if (config.intensity) this.setIntensity(config.intensity);
    if (config.lightningEnabled !== undefined) this.setLightningEnabled(config.lightningEnabled);
    if (config.lightningChancePerSec !== undefined) {
      this.setLightningChancePerSec(config.lightningChancePerSec);
    }
  }

  resize(_width: number, _height: number): void {
    const width = Math.max(1, Math.floor(_width));
    const height = Math.max(1, Math.floor(_height));
    if (width === this.viewportW && height === this.viewportH) return;

    this.viewportW = width;
    this.viewportH = height;

    this.tintOverlay.clear();
    this.tintOverlay.rect(0, 0, width, height);
    this.tintOverlay.fill({ color: 0x385b73, alpha: 1 });

    this.lightningOverlay.clear();
    this.lightningOverlay.rect(0, 0, width, height);
    this.lightningOverlay.fill({ color: 0xe9f5ff, alpha: 1 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private setOverlaysVisible(visible: boolean): void {
    this.tintOverlay.visible = visible;
    this.rainGraphics.visible = visible;
    if (!visible) this.lightningOverlay.visible = false;
  }

  private syncRainStreakCount(target: number): void {
    if (this.viewportW <= 0 || this.viewportH <= 0) return;

    while (this.rainStreaks.length < target) {
      this.rainStreaks.push(this.createStreak(Math.random() * this.viewportH));
    }

    if (this.rainStreaks.length > target) {
      this.rainStreaks.length = target;
    }
  }

  private createStreak(startY = 0): RainStreak {
    const w = Math.max(1, this.viewportW);
    return {
      x: Math.random() * w,
      y: startY,
      speedJitter: 0.8 + Math.random() * 0.45,
      lengthJitter: 0.85 + Math.random() * 0.45,
    };
  }

  private resetStreak(streak: RainStreak): void {
    streak.x = Math.random() * Math.max(1, this.viewportW);
    streak.y = -Math.random() * 80;
    streak.speedJitter = 0.8 + Math.random() * 0.45;
    streak.lengthJitter = 0.85 + Math.random() * 0.45;
  }

  private stepRainStreaks(dt: number, profile: IntensityProfile): void {
    const resetY = this.viewportH + 30;
    const wind = profile.wind;

    for (let i = 0; i < this.rainStreaks.length; i += 1) {
      const streak = this.rainStreaks[i];
      streak.x += wind * dt;
      streak.y += profile.speed * streak.speedJitter * dt;

      if (streak.y > resetY || streak.x < -40 || streak.x > this.viewportW + 40) {
        this.resetStreak(streak);
      }
    }
  }

  private renderRain(profile: IntensityProfile): void {
    this.rainGraphics.clear();
    const tiltX = profile.tilt;
    const baseLength = profile.length;

    for (let i = 0; i < this.rainStreaks.length; i += 1) {
      const streak = this.rainStreaks[i];
      const length = baseLength * streak.lengthJitter;
      this.rainGraphics.moveTo(streak.x, streak.y);
      this.rainGraphics.lineTo(streak.x + tiltX, streak.y + length);
    }

    this.rainGraphics.stroke({
      color: 0xbfd9ef,
      alpha: profile.rainAlpha,
      width: profile.lineWidth,
    });
  }

  private stepLightning(dt: number, flashAlpha: number): void {
    if (!this.lightningEnabled || this.lightningChancePerSec <= 0) {
      this.lightningOverlay.visible = false;
      this.lightningTimer = 0;
      this.lightningDuration = 0;
      return;
    }

    if (this.lightningTimer <= 0) {
      if (Math.random() < this.lightningChancePerSec * dt) {
        this.lightningDuration = 0.06 + Math.random() * 0.08;
        this.lightningTimer = this.lightningDuration;
      }
    }

    if (this.lightningTimer > 0) {
      this.lightningTimer = Math.max(0, this.lightningTimer - dt);
      const progress = this.lightningDuration > 0
        ? this.lightningTimer / this.lightningDuration
        : 0;
      this.lightningOverlay.visible = true;
      this.lightningOverlay.alpha = flashAlpha * progress;
      return;
    }

    this.lightningOverlay.visible = false;
  }
}

interface RainStreak {
  x: number;
  y: number;
  speedJitter: number;
  lengthJitter: number;
}

interface IntensityProfile {
  density: number;
  speed: number;
  length: number;
  lineWidth: number;
  wind: number;
  tilt: number;
  rainAlpha: number;
  tintAlpha: number;
  lightningAlpha: number;
}

const INTENSITY_PROFILE: Record<WeatherIntensity, IntensityProfile> = {
  light: {
    density: 70,
    speed: 430,
    length: 14,
    lineWidth: 1,
    wind: -18,
    tilt: -5,
    rainAlpha: 0.28,
    tintAlpha: 0.05,
    lightningAlpha: 0.45,
  },
  medium: {
    density: 120,
    speed: 560,
    length: 17,
    lineWidth: 1.1,
    wind: -25,
    tilt: -6,
    rainAlpha: 0.36,
    tintAlpha: 0.08,
    lightningAlpha: 0.5,
  },
  heavy: {
    density: 190,
    speed: 700,
    length: 20,
    lineWidth: 1.25,
    wind: -36,
    tilt: -7,
    rainAlpha: 0.45,
    tintAlpha: 0.12,
    lightningAlpha: 0.58,
  },
};
