/**
 * Door state machine: transition a door to open or closed with animation sequence.
 */
import type { Text } from "pixi.js";
import {
  DOOR_FRAME_FIRST,
  PROMPT_CLOSE,
  PROMPT_OPEN,
  SOUND_ONE_SHOT_VOLUME,
} from "./constants.ts";
import type { IObjectLayerDoorContext } from "./types.ts";
import type { RenderedObject } from "./types.ts";
import { setDoorOpen } from "./setDoorState.ts";
import { setDoorClosed } from "./setDoorState.ts";

/**
 * Transition a door to open or closed with animation sequence.
 *
 * @param layer - Object layer with audio and onDoorCollisionChange
 * @param r - Rendered door object
 * @param targetOpen - true = open, false = closed
 */
export function applyDoorTransition(
  layer: IObjectLayerDoorContext,
  r: RenderedObject,
  targetOpen: boolean,
): void {
  // Prevent re-triggering while already transitioning
  if (r.doorState === "opening" || r.doorState === "closing") return;

  if (targetOpen) {
    // closed → opening → open
    r.doorState = "opening";
    const frames = r.doorOpeningFrames;

    // Play door-open sound
    if (r.doorOpenSoundUrl && layer.audio) {
      layer.audio.playOneShot(r.doorOpenSoundUrl, SOUND_ONE_SHOT_VOLUME);
    }

    // Remove collision immediately when opening starts
    if (r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
      layer.onDoorCollisionChange?.(r.doorCollisionTiles, false);
    }

    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.animationSpeed = r.animationSpeed;
      r.sprite.loop = false;
      r.sprite.visible = true;
      r.sprite.onComplete = () => {
        r.sprite.onComplete = undefined;
        setDoorOpen(r, layer);
      };
      r.sprite.gotoAndPlay(DOOR_FRAME_FIRST);
    } else {
      // No opening animation — jump straight to open
      setDoorOpen(r, layer);
    }
  } else {
    // open → closing → closed
    r.doorState = "closing";
    const frames = r.doorClosingFrames;

    // Play door-close sound
    if (r.doorCloseSoundUrl && layer.audio) {
      layer.audio.playOneShot(r.doorCloseSoundUrl, SOUND_ONE_SHOT_VOLUME);
    }

    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.animationSpeed = r.animationSpeed;
      r.sprite.loop = false;
      r.sprite.visible = true;
      r.sprite.onComplete = () => {
        r.sprite.onComplete = undefined;
        setDoorClosed(r, layer);
      };
      r.sprite.gotoAndPlay(DOOR_FRAME_FIRST);
    } else {
      // No closing animation — jump straight to closed
      setDoorClosed(r, layer);
    }
  }

  // Update prompt text
  if (r.prompt) {
    (r.prompt as Text).text = targetOpen ? PROMPT_CLOSE : PROMPT_OPEN;
  }
}
