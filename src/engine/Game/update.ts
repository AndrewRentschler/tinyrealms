import type { IGame } from "./types.ts";
import { BUILD_PAN_SPEED, OFFSCREEN_POS } from "./constants.ts";
import { checkPortals } from "./checkPortals.ts";
import { applyWeatherFromMap } from "./applyWeatherFromMap.ts";
import { handleCombatInput } from "./handleCombatInput.ts";
import { handleHostileAggroTick } from "./handleHostileAggroTick.ts";
import { handleItemPickup } from "./handleItemPickup.ts";
import { handleObjectToggle } from "./handleObjectToggle.ts";
import { handleStorageInteraction } from "./handleStorageInteraction.ts";

/**
 * Main game loop update. Called every frame.
 */
export function update(game: IGame): void {
  if (!game.initialized) return;

  const dt = game.app.ticker.deltaMS / 1000;
  const px = game.entityLayer.playerX;
  const py = game.entityLayer.playerY;

  if (game.mode === "play") {
    game.entityLayer.update(dt, game.input);
    checkPortals(game);

    game.worldItemLayer.update(dt, px, py);

    game.objectLayer.updateToggleAndAmbient(dt, px, py);

    if (!game.isGuest) {
      void handleCombatInput(game);
      void handleHostileAggroTick(game);
      if (!game.objectLayer.getNearestToggleableId()) {
        // Check for storage interaction first (more specific than item pickup)
        handleStorageInteraction(game);
        // Only allow item pickup if not accessing storage
        if (!(game as IGame & { accessingStorage?: boolean }).accessingStorage) {
          void handleItemPickup(game);
        }
      } else {
        void handleObjectToggle(game);
      }
    }
  }

  if (game.mode === "build") {
    game.worldItemLayer.update(dt, OFFSCREEN_POS, OFFSCREEN_POS);
    game.objectLayer.updateAmbientVolumes(px, py);
  }

  game.camera.update();
  game.app.stage.x = -game.camera.x + game.camera.viewportW / 2;
  game.app.stage.y = -game.camera.y + game.camera.viewportH / 2;

  if (game.currentMapName === "global") {
    game.mapRenderer.container.visible = false;
    game.mapRenderer.overlayLayerContainer.visible = false;
    game.globalChunkRenderer.container.visible = true;
    game.globalChunkRenderer.overlayContainer.visible = true;
    void game.globalChunkRenderer.updateWindow({
      centerX: game.camera.x,
      centerY: game.camera.y,
      visibleRadius: 1000,
      prefetchRadius: 1500,
    });
  } else {
    game.mapRenderer.container.visible = true;
    game.mapRenderer.overlayLayerContainer.visible = true;
    game.globalChunkRenderer.container.visible = false;
    game.globalChunkRenderer.overlayContainer.visible = false;
  }

  if (game.currentMapData) {
    applyWeatherFromMap(game, game.currentMapData);
  }

  game.weatherLayer.update(
    dt,
    game.camera.x,
    game.camera.y,
    game.camera.viewportW,
    game.camera.viewportH,
  );

  game.dayNightLayer.update(game.worldTime?.currentTime ?? 12, {
    width: game.camera.viewportW,
    height: game.camera.viewportH,
    cameraX: game.camera.x,
    cameraY: game.camera.y,
  });

  if (game.mode === "build") {
    const pan = BUILD_PAN_SPEED * dt;
    if (game.input.isDown("ArrowLeft") || game.input.isDown("a")) game.camera.x -= pan;
    if (game.input.isDown("ArrowRight") || game.input.isDown("d")) game.camera.x += pan;
    if (game.input.isDown("ArrowUp") || game.input.isDown("w")) game.camera.y -= pan;
    if (game.input.isDown("ArrowDown") || game.input.isDown("s")) game.camera.y += pan;
  }

  game.input.endFrame();
}
