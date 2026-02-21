import type { IGame } from "./types.ts";
import { checkPortals } from "./checkPortals.ts";
import { applyWeatherFromMap } from "./applyWeatherFromMap.ts";
import { handleCombatInput } from "./handleCombatInput.ts";
import { handleHostileAggroTick } from "./handleHostileAggroTick.ts";
import { handleItemPickup } from "./handleItemPickup.ts";
import { handleObjectToggle } from "./handleObjectToggle.ts";

type GameForUpdate = IGame & {
  initialized: boolean;
  toggling: boolean;
  pickingUp: boolean;
  attacking: boolean;
  lastAttackAt: number;
  aggroResolving: boolean;
  lastAggroTickAt: number;
  activeCombatNotifications: HTMLDivElement[];
};

/**
 * Main game loop update. Called every frame.
 */
export function update(game: GameForUpdate): void {
  if (!game.initialized) return;

  const dt = game.app.ticker.deltaMS / 1000;

  if (game.mode === "play") {
    game.entityLayer.update(dt, game.input);
    checkPortals(game);

    game.worldItemLayer.update(dt, game.entityLayer.playerX, game.entityLayer.playerY);

    game.objectLayer.updateToggleInteraction(
      dt,
      game.entityLayer.playerX,
      game.entityLayer.playerY,
    );

    if (!game.isGuest) {
      void handleCombatInput(game);
      void handleHostileAggroTick(game);
      if (!game.objectLayer.getNearestToggleableId()) {
        void handleItemPickup(game);
      } else {
        void handleObjectToggle(game);
      }
    }
  }

  if (game.mode === "build") {
    game.worldItemLayer.update(dt, -9999, -9999);
  }

  game.objectLayer.updateAmbientVolumes(
    game.entityLayer.playerX,
    game.entityLayer.playerY,
  );

  (game.camera as { update: () => void }).update();
  game.app.stage.x = -game.camera.x + game.camera.viewportW / 2;
  game.app.stage.y = -game.camera.y + game.camera.viewportH / 2;

  if (game.currentMapData) {
    applyWeatherFromMap(game, game.currentMapData);
  }

  (game.weatherLayer as { update: (dt: number, x: number, y: number, w: number, h: number) => void }).update(
    dt,
    game.camera.x,
    game.camera.y,
    game.camera.viewportW,
    game.camera.viewportH,
  );

  if (game.mode === "build") {
    const panSpeed = 300;
    if (game.input.isDown("ArrowLeft") || game.input.isDown("a")) {
      (game.camera as { x: number }).x -= panSpeed * dt;
    }
    if (game.input.isDown("ArrowRight") || game.input.isDown("d")) {
      (game.camera as { x: number }).x += panSpeed * dt;
    }
    if (game.input.isDown("ArrowUp") || game.input.isDown("w")) {
      (game.camera as { y: number }).y -= panSpeed * dt;
    }
    if (game.input.isDown("ArrowDown") || game.input.isDown("s")) {
      (game.camera as { y: number }).y += panSpeed * dt;
    }
  }

  (game.input as { endFrame: () => void }).endFrame();
}
