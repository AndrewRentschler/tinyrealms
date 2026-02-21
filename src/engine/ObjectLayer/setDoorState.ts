/**
 * Set door to fully-open or fully-closed resting state.
 * setDoorClosed reports collision change via layer.onDoorCollisionChange.
 */
import { DOOR_FRAME_FIRST, DOOR_FRAME_LAST_OFFSET } from "./constants.ts";
import type { IObjectLayerDoorContext } from "./types.ts";
import type { RenderedObject } from "./types.ts";

/** Set a door to the fully-open resting state */
export function setDoorOpen(r: RenderedObject, _layer: IObjectLayerDoorContext): void {
  r.doorState = "open";
  r.isOn = true;
  const frames = r.doorOpenFrames;
  if (frames && frames.length > 0) {
    r.sprite.textures = frames;
    r.sprite.loop = false;
    r.sprite.visible = true;
    r.sprite.gotoAndStop(DOOR_FRAME_FIRST); // static — hold first frame of "open"
  } else {
    // No open animation — hold last frame of opening
    r.sprite.gotoAndStop(r.sprite.totalFrames - DOOR_FRAME_LAST_OFFSET);
  }
  r.sprite.animationSpeed = r.animationSpeed;
}

/** Set a door to the fully-closed resting state */
export function setDoorClosed(r: RenderedObject, layer: IObjectLayerDoorContext): void {
  r.doorState = "closed";
  r.isOn = false;
  const frames = r.doorClosedFrames;
  if (frames && frames.length > 0) {
    r.sprite.textures = frames;
    r.sprite.loop = false;
    r.sprite.visible = true;
    r.sprite.gotoAndStop(DOOR_FRAME_FIRST);
  } else {
    // No closed animation — hold last frame of closing
    r.sprite.gotoAndStop(r.sprite.totalFrames - DOOR_FRAME_LAST_OFFSET);
  }
  r.sprite.animationSpeed = r.animationSpeed;

  // Add collision back when door finishes closing
  if (r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
    layer.onDoorCollisionChange?.(r.doorCollisionTiles, true);
  }
}
