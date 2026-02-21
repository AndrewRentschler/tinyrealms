import {
  REMOTE_INTERP_DELAY_MS,
  REMOTE_SNAP_DISTANCE_PX,
} from "../../config/multiplayer-config.ts";
import type { IEntityLayer } from "./types.ts";
import {
  parseDirection,
  REMOTE_DIR_HOLD_FRAMES_THRESHOLD,
  REMOTE_FRAME_IDLE,
  REMOTE_INTERP_LERP_THRESHOLD,
  REMOTE_MIN_SNAPSHOTS_FOR_INTERP,
} from "./constants.ts";
import { applyRemoteDirection } from "./applyRemoteDirection.ts";

export function updateRemotePlayers(layer: IEntityLayer): void {
  const now = performance.now();
  const renderTime = now - REMOTE_INTERP_DELAY_MS;

  for (const [, remote] of layer.remotePlayers) {
    const snaps = remote.snapshots;
    let targetX: number;
    let targetY: number;
    let interpDir: string = remote.direction;
    let interpAnim: string = remote.animation;

    if (snaps.length >= REMOTE_MIN_SNAPSHOTS_FOR_INTERP) {
      let i = snaps.length - 1;
      while (i > 0 && snaps[i].time > renderTime) i--;
      const a = snaps[i];
      const b = snaps[Math.min(i + 1, snaps.length - 1)];

      if (a === b || a.time === b.time) {
        targetX = a.x;
        targetY = a.y;
        interpDir = a.direction;
        interpAnim = a.animation;
      } else {
        const t = Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
        targetX = a.x + (b.x - a.x) * t;
        targetY = a.y + (b.y - a.y) * t;
        interpDir = t < REMOTE_INTERP_LERP_THRESHOLD ? a.direction : b.direction;
        interpAnim = t < REMOTE_INTERP_LERP_THRESHOLD ? a.animation : b.animation;
      }
    } else if (snaps.length === 1) {
      targetX = snaps[0].x;
      targetY = snaps[0].y;
      interpDir = snaps[0].direction;
      interpAnim = snaps[0].animation;
    } else {
      continue;
    }

    const cdx = targetX - remote.renderX;
    const cdy = targetY - remote.renderY;
    if (cdx * cdx + cdy * cdy > REMOTE_SNAP_DISTANCE_PX * REMOTE_SNAP_DISTANCE_PX) {
      remote.renderX = targetX;
      remote.renderY = targetY;
    } else {
      remote.renderX = targetX;
      remote.renderY = targetY;
    }

    remote.container.x = remote.renderX;
    remote.container.y = remote.renderY;

    if (interpDir !== remote.direction) {
      remote.directionHoldFrames++;
      if (remote.directionHoldFrames >= REMOTE_DIR_HOLD_FRAMES_THRESHOLD) {
        applyRemoteDirection(remote.sprite, remote.spritesheet, remote.animation, parseDirection(interpDir));
        remote.direction = interpDir;
        remote.directionHoldFrames = 0;
      }
    } else {
      remote.directionHoldFrames = 0;
    }

    if (interpAnim !== remote.animation) {
      if (remote.sprite) {
        if (interpAnim === "walk" && !remote.sprite.playing) {
          remote.sprite.play();
        } else if (interpAnim === "idle" && remote.sprite.playing) {
          remote.sprite.gotoAndStop(REMOTE_FRAME_IDLE);
        }
      }
      remote.animation = interpAnim;
    }
  }
}
