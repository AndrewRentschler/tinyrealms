import {
  PLAYER_MOVE_SPEED,
  PLAYER_SPRINT_MULTIPLIER,
} from "../../config/multiplayer-config.ts";
import type { InputManager } from "../InputManager.ts";
import type { IEntityLayer } from "./types.ts";
import { PLAYER_FRAME_IDLE } from "./constants.ts";
import { isBlocked } from "./isBlocked.ts";
import { setDirection } from "./setDirection.ts";

export function updatePlayerMovement(
  layer: IEntityLayer,
  dt: number,
  input: InputManager,
  isMoving: boolean,
  setMoving: (v: boolean) => void,
): void {
  let dx = 0;
  let dy = 0;

  if (input.isDown("ArrowLeft") || input.isDown("a")) dx -= 1;
  if (input.isDown("ArrowRight") || input.isDown("d")) dx += 1;
  if (input.isDown("ArrowUp") || input.isDown("w")) dy -= 1;
  if (input.isDown("ArrowDown") || input.isDown("s")) dy += 1;

  const wasMoving = isMoving;
  setMoving(dx !== 0 || dy !== 0);

  if (dy < 0) setDirection(layer, "up", dx !== 0 || dy !== 0);
  else if (dy > 0) setDirection(layer, "down", dx !== 0 || dy !== 0);
  else if (dx < 0) setDirection(layer, "left", dx !== 0 || dy !== 0);
  else if (dx > 0) setDirection(layer, "right", dx !== 0 || dy !== 0);

  if (!(dx !== 0 || dy !== 0) && wasMoving && layer.playerSprite) {
    layer.playerSprite.gotoAndStop(PLAYER_FRAME_IDLE);
  }
  if ((dx !== 0 || dy !== 0) && !wasMoving && layer.playerSprite) {
    layer.playerSprite.play();
  }

  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }

  const isSprinting = input.isDown("Shift");
  const speed = PLAYER_MOVE_SPEED * (isSprinting ? PLAYER_SPRINT_MULTIPLIER : 1);
  const newX = layer.playerX + dx * speed * dt;
  const newY = layer.playerY + dy * speed * dt;

  const canMoveXY = !isBlocked(layer, newX, newY);
  if (canMoveXY) {
    layer.playerX = newX;
    layer.playerY = newY;
  } else {
    if (!isBlocked(layer, newX, layer.playerY)) layer.playerX = newX;
    if (!isBlocked(layer, layer.playerX, newY)) layer.playerY = newY;
  }

  layer.playerVX = dx * speed;
  layer.playerVY = dy * speed;
}
