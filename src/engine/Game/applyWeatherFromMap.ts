import type { WeatherMode } from "../WeatherLayer.ts";
import type { MapData } from "../types.ts";
import type { IGame } from "./types.ts";

/** Game with mutable weather audio state (internal use) */
type GameWithWeather = IGame & {
  weatherRainHandle: import("../AudioManager.ts").SfxHandle | null;
  weatherRainVolume: number;
  weatherRainLoading: boolean;
};

/**
 * Apply weather mode and config from map data to the weather layer.
 * Skips setMode/setConfig when inputs unchanged (throttled).
 */
export function applyWeatherFromMap(game: IGame, mapData: MapData): void {
  const configuredMode = mapData.weatherMode ?? "clear";
  const mode: WeatherMode =
    configuredMode === "rainy"
      ? "rainy"
      : configuredMode === "scattered_rain"
        ? (game.globalRainyNow ? "rainy" : "clear")
        : "clear";
  const intensity = mapData.weatherIntensity ?? "medium";
  const lightningEnabled = !!mapData.weatherLightningEnabled;
  const lightningChancePerSec = mapData.weatherLightningChancePerSec ?? 0.03;
  const key = `${mode}|${intensity}|${lightningEnabled}|${lightningChancePerSec}`;

  if (game.lastAppliedWeatherKey !== key) {
    game.lastAppliedWeatherKey = key;
    game.weatherLayer?.setMode(mode);
    game.weatherLayer?.setConfig({
      intensity,
      lightningEnabled,
      lightningChancePerSec,
    });
  }
  updateWeatherAudioFromMap(game as GameWithWeather, mapData, mode);
}

/**
 * Update rain SFX volume based on map weather config.
 */
export function updateWeatherAudioFromMap(
  game: GameWithWeather,
  mapData: MapData,
  mode: WeatherMode,
): void {
  const intensity = mapData.weatherIntensity ?? "medium";
  const intensityBase = intensity === "light" ? 0.22 : intensity === "heavy" ? 0.55 : 0.38;
  const wantsRainSfx = mode === "rainy" && !!mapData.weatherRainSfx;
  const targetVolume = wantsRainSfx ? intensityBase : 0;

  if (wantsRainSfx && !game.weatherRainHandle && game.audio.isStarted) {
    if (!game.weatherRainLoading) {
      game.weatherRainLoading = true;
      void game.audio.playAmbient("/assets/audio/rain.mp3", 0).then((handle) => {
        game.weatherRainLoading = false;
        if (!handle) return;
        game.weatherRainHandle = handle;
        game.weatherRainVolume = 0;
      }).catch(() => {
        game.weatherRainLoading = false;
      });
    }
  }

  if (game.weatherRainHandle) {
    const lerp = 0.08;
    game.weatherRainVolume += (targetVolume - game.weatherRainVolume) * lerp;
    game.weatherRainHandle.setVolume(Math.max(0, Math.min(1, game.weatherRainVolume)));
    if (!wantsRainSfx && game.weatherRainVolume < 0.01) {
      game.weatherRainHandle.stop();
      game.weatherRainHandle = null;
      game.weatherRainVolume = 0;
    }
  }
}
