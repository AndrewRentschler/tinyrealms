import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  REMOTE_INTERP_DELAY_MS,
  REMOTE_INTERP_MAX_SNAPSHOTS,
  REMOTE_SNAP_DISTANCE_PX,
} from "../../config/multiplayer-config.ts";
import type { PresenceData } from "../types.ts";
import type { IEntityLayer, RemotePlayerEntry } from "./types.ts";
import {
  REMOTE_FALLBACK_X,
  REMOTE_FALLBACK_Y,
  REMOTE_FALLBACK_W,
  REMOTE_FALLBACK_H,
  REMOTE_FALLBACK_FILL,
  PLAYER_LABEL_FONT_SIZE,
  PLAYER_LABEL_FILL,
  PLAYER_LABEL_FONT_FAMILY,
  PLAYER_LABEL_ANCHOR_X,
  PLAYER_LABEL_ANCHOR_Y,
  SPRITE_LABEL_Y_OFFSET,
} from "./constants.ts";
import { loadRemotePlayerSprite } from "./loadRemotePlayerSprite.ts";

export function updatePresence(
  layer: IEntityLayer,
  presenceList: PresenceData[],
  localProfileId: string,
): void {
  const activeIds = new Set<string>();
  const now = performance.now();

  for (const p of presenceList) {
    if (p.profileId === localProfileId) continue;
    activeIds.add(p.profileId);

    let remote = layer.remotePlayers.get(p.profileId);
    if (!remote) {
      const remoteContainer = new Container();
      remoteContainer.x = p.x;
      remoteContainer.y = p.y;

      const graphic = new Graphics();
      graphic.rect(REMOTE_FALLBACK_X, REMOTE_FALLBACK_Y, REMOTE_FALLBACK_W, REMOTE_FALLBACK_H);
      graphic.fill(REMOTE_FALLBACK_FILL);
      remoteContainer.addChild(graphic);

      const label = new Text({
        text: p.name || "Player",
        style: new TextStyle({
          fontSize: PLAYER_LABEL_FONT_SIZE,
          fill: PLAYER_LABEL_FILL,
          fontFamily: PLAYER_LABEL_FONT_FAMILY,
        }),
      });
      label.anchor.set(PLAYER_LABEL_ANCHOR_X, PLAYER_LABEL_ANCHOR_Y);
      label.y = -SPRITE_LABEL_Y_OFFSET;
      remoteContainer.addChild(label);

      layer.container.addChild(remoteContainer);

      remote = {
        container: remoteContainer,
        sprite: null,
        spritesheet: null,
        spriteUrl: p.spriteUrl,
        label,
        snapshots: [],
        renderX: p.x,
        renderY: p.y,
        direction: p.direction,
        animation: p.animation,
        directionHoldFrames: 0,
      };
      layer.remotePlayers.set(p.profileId, remote);

      loadRemotePlayerSprite(layer, p.profileId, p.spriteUrl);
    }

    remote.snapshots.push({
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      direction: p.direction,
      animation: p.animation,
      time: now,
    });
    while (remote.snapshots.length > REMOTE_INTERP_MAX_SNAPSHOTS) {
      remote.snapshots.shift();
    }

    remote.label.text = p.name || "Player";
  }

  for (const [id, remote] of layer.remotePlayers) {
    if (!activeIds.has(id)) {
      layer.container.removeChild(remote.container);
      remote.sprite?.destroy();
      layer.remotePlayers.delete(id);
    }
  }
}
