# Weather System

This document describes the initial weather scaffold for the game and how to extend it.

## Current Scope

Implemented weather modes:

- `clear`
- `rainy`
- `scattered_rain` (map follows global rain on/off state)

Implemented rainy tuning controls:

- `weatherIntensity`: `light` | `medium` | `heavy`
- `weatherRainSfx`: enable/disable rain ambience
- `weatherLightningEnabled`: enable/disable lightning flash hook (default `false`)
- `weatherLightningChancePerSec`: probability hook for lightning events

The system is intentionally lightweight and is meant to be a foundation for future effects (fog, snow, storms, lightning).

## Architecture

### 1) Data model

Map weather is stored as optional metadata:

- `maps.weatherMode`
- `maps.weatherIntensity`
- `maps.weatherRainSfx`
- `maps.weatherLightningEnabled`
- `maps.weatherLightningChancePerSec`
- mirrored in `MapData` on the client

Global scattered-rain control is stored in:

- `weatherGlobal` singleton row (key: `"global"`)
  - `rainyNow`: whether global rain is currently on
  - `rainyPercent`: chance (0..1) that each weather tick is rainy
  - `tickIntervalMs`: how often the global state is re-rolled

If unset, the runtime defaults to `clear`.

### 2) Rendering layer

`src/engine/WeatherLayer.ts` provides a screen-space weather overlay:

- `setMode("clear" | "rainy")`
- `update(dt, cameraX, cameraY, viewportW, viewportH)`

For `rainy`, it renders:

- a subtle cool tint (intensity-scaled)
- procedural rain streaks (pooled drops, recycled as they leave screen)
- optional lightning flash hook (disabled by default)

For `clear`, it hides all weather graphics.

### 3) Game integration

`Game` now owns `weatherLayer` and updates it each frame:

- weather layer is added on top of world rendering
- map weather mode + config are applied from `currentMapData`
- for `scattered_rain`, effective rain mode resolves from global `weatherGlobal.rainyNow`
- map load/map change refreshes weather automatically
- optional rain ambient loop auto-fades based on mode + intensity

### 4) Editor integration

Map Settings in the map editor now includes:

- `Weather: Clear | Rainy | Scattered rain`
- `Rain Intensity: Light | Medium | Heavy`
- `Rain SFX` toggle
- `Lightning` toggle
- `Lightning/sec` numeric chance

This value is saved through `maps.saveFullMap` and loaded back on map load.

Global scattered-rain behavior is configured via Convex weather config:

- `weather:setGlobalConfig` (superuser)
  - `rainyPercent` controls expected rainy share of time
  - `tickIntervalMs` controls how frequently global weather is re-evaluated
- `weather:setGlobalConfigAdmin` (ADMIN_API_KEY-based scripts/admin-run path)

Example:

`node scripts/admin-run.mjs weather:setGlobalConfigAdmin '{"rainyPercent":0.35,"tickIntervalMs":120000}'`

## Why Procedural Rain

Procedural rain is the best baseline for this project because it is:

- easy to tune (density, speed, drift, alpha)
- low asset overhead (no required rain sprite sheets)
- straightforward to adapt per map/quality setting

You can still layer stylized sprite textures later if art direction needs it.

## Extension Plan

Recommended next steps:

1. Add wind presets + directional gust events.
2. Add splash/ripple particles on walkable ground.
3. Add per-device quality limits (max drop count / update cadence).
4. Add additional weather modes (fog, snow, storms).
5. Optionally switch global rain from random-per-tick to duration-based Markov transitions.

## Notes

- This scaffold is visual-only weather; no gameplay stat changes are applied.
- Existing maps without `weatherMode` continue to work and behave as `clear`.
