import { Container } from "pixi.js";

export type WeatherMode = "clear" | "rainy" | "scattered_rain";
export type WeatherIntensity = "light" | "medium" | "heavy";

export class WeatherLayer {
  container: Container;
  private mode: WeatherMode = "clear";
  private intensity: WeatherIntensity = "medium";
  private lightningEnabled = false;
  private lightningChancePerSec = 0;

  constructor() {
    this.container = new Container();
  }

  setMode(mode: WeatherMode): void {
    this.mode = mode;
  }

  setIntensity(intensity: WeatherIntensity): void {
    this.intensity = intensity;
  }

  setLightningEnabled(enabled: boolean): void {
    this.lightningEnabled = enabled;
  }

  setLightningChancePerSec(chance: number): void {
    this.lightningChancePerSec = chance;
  }

  update(_dt: number, _camX?: number, _camY?: number, _vpW?: number, _vpH?: number): void {
    // Stub - no weather effects in local dev
  }

  setConfig(config: { intensity?: WeatherIntensity; lightningEnabled?: boolean; lightningChancePerSec?: number }): void {
    if (config.intensity) this.intensity = config.intensity;
    if (config.lightningEnabled !== undefined) this.lightningEnabled = config.lightningEnabled;
    if (config.lightningChancePerSec !== undefined) this.lightningChancePerSec = config.lightningChancePerSec;
  }

  resize(_width: number, _height: number): void {
    // Stub
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
