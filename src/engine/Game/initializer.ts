import type { Game } from "./index.ts";
import { MapRenderer } from "../MapRenderer.ts";
import { EntityLayer } from "../EntityLayer.ts";
import { ObjectLayer } from "../ObjectLayer.ts";
import { WorldItemLayer } from "../WorldItemLayer.ts";
import { WeatherLayer } from "../WeatherLayer.ts";
import { GAME_BACKGROUND } from "../../constants/colors.ts";
import type { IGame } from "./types.ts";
import { seedStaticMaps } from "./seedStaticMaps.ts";
import { loadDefaultMap } from "./loadDefaultMap.ts";
import { setupLayers } from "./setupLayers.ts";
import { setupResizeObserver } from "./setupResizeObserver.ts";
import { setupAudioUnlock } from "./setupAudioUnlock.ts";
import { setupMuteKey } from "./setupMuteKey.ts";
import { setupPostInitMutations } from "./setupPostInitMutations.ts";
import { update as updateLoop } from "./update.ts";

/**
 * Initialize the game: app, layers, event listeners, map load, and presence.
 */
export async function initialize(game: IGame): Promise<void> {
  const parent = game.canvas.parentElement!;
  await game.app.init({
    canvas: game.canvas,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: GAME_BACKGROUND,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: false,
  });

  game.mapRenderer = new MapRenderer(game as Game);
  game.objectLayer = new ObjectLayer();
  game.objectLayer.setAudio(game.audio);
  game.worldItemLayer = new WorldItemLayer();
  game.entityLayer = new EntityLayer(game as Game);
  game.weatherLayer = new WeatherLayer();

  setupLayers(game);
  setupResizeObserver(game);
  game.app.ticker.add(() => updateLoop(game));
  setupAudioUnlock(game);
  setupMuteKey(game);

  game.initialized = true;

  if (!game.isGuest) {
    await seedStaticMaps(game);
  }

  await loadDefaultMap(game);
  await setupPostInitMutations(game);
  game.startPresence();
}
