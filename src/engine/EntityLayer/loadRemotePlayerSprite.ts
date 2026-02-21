import { AnimatedSprite, Graphics } from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import { PLAYER_ANIM_SPEED } from "../../config/multiplayer-config.ts";
import type { IEntityLayer } from "./types.ts";
import {
  parseDirection,
  PLAYER_LABEL_ANCHOR_X,
  PLAYER_LABEL_ANCHOR_Y,
  REMOTE_FRAME_IDLE,
} from "./constants.ts";
import { applyRemoteDirection } from "./applyRemoteDirection.ts";

export async function loadRemotePlayerSprite(
  layer: IEntityLayer,
  profileId: string,
  spriteUrl: string,
): Promise<void> {
  const remote = layer.remotePlayers.get(profileId);
  if (!remote) return;

  try {
    const sheet = await loadSpriteSheet(spriteUrl);
    if (!layer.remotePlayers.has(profileId)) return;

    const downFrames = sheet.animations?.["row0"];
    if (!downFrames || downFrames.length === 0) return;

    const sprite = new AnimatedSprite(downFrames);
    sprite.animationSpeed = PLAYER_ANIM_SPEED;
    sprite.anchor.set(0.5, 1);

    if (remote.animation === "walk") {
      sprite.play();
    } else {
      sprite.gotoAndStop(REMOTE_FRAME_IDLE);
    }

    if (remote.container.children.length > 0) {
      const fallback = remote.container.children[0];
      if (fallback instanceof Graphics) {
        remote.container.removeChild(fallback);
        fallback.destroy();
      }
    }

    remote.container.addChildAt(sprite, 0);
    remote.sprite = sprite;
    remote.spritesheet = sheet;

    applyRemoteDirection(sprite, sheet, remote.animation, parseDirection(remote.direction));
  } catch (err) {
    console.warn(`Failed to load sprite for remote player ${profileId}:`, err);
  }
}
