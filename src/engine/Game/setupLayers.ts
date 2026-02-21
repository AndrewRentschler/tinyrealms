import { MapRenderer } from "../MapRenderer/index.ts";
import { EntityLayer } from "../EntityLayer.ts";
import { ObjectLayer } from "../ObjectLayer.ts";
import { WorldItemLayer } from "../WorldItemLayer.ts";
import { WeatherLayer } from "../WeatherLayer.ts";
import type { IGame } from "./types.ts";

/**
 * Create layers and add them to the stage in render order.
 */
export function setupLayers(game: IGame): void {
  const { app, mapRenderer, objectLayer, worldItemLayer, entityLayer, weatherLayer } = game;

  app.stage.addChild(mapRenderer.container);
  app.stage.addChild(objectLayer.bgContainer);
  app.stage.addChild(worldItemLayer.container);
  app.stage.addChild(objectLayer.container);
  app.stage.addChild(entityLayer.container);
  app.stage.addChild(objectLayer.overlayContainer);
  app.stage.addChild(mapRenderer.overlayLayerContainer);
  app.stage.addChild(weatherLayer.container);
  app.stage.sortableChildren = true;
}
