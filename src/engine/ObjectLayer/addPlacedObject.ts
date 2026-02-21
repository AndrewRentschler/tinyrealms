/**
 * Full object creation logic for placed sprites.
 * Loads sprite sheet, resolves animations (case-insensitive), creates RenderedObject,
 * computes door collision tiles, starts ambient sounds, adds glow+prompt for interactables.
 */
import { Container, AnimatedSprite, Graphics, Text, TextStyle } from "pixi.js";
import type { Spritesheet, Texture } from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import type {
  ObjectLayerContext,
  PlacedObjectInput,
  RenderedObject,
  SpriteDefInfo,
  DoorState,
} from "./types.ts";
import {
  ANIMATION_FIRST_FRAME,
  DEFAULT_AMBIENT_RADIUS,
  DEFAULT_AMBIENT_VOLUME,
  DEFAULT_LAYER_INDEX,
  GLOW_ALPHA,
  GLOW_CENTER_X,
  GLOW_COLOR,
  GLOW_RADIUS,
  GLOW_Y_HALF_HEIGHT_FACTOR,
  AMBIENT_INITIAL_VOLUME,
  PROMPT_ANCHOR_X,
  PROMPT_ANCHOR_Y,
  PROMPT_CLOSE,
  PROMPT_FILL_COLOR,
  PROMPT_FONT_FAMILY,
  PROMPT_FONT_SIZE,
  PROMPT_OPEN,
  PROMPT_STROKE_COLOR,
  PROMPT_STROKE_WIDTH,
  PROMPT_TURN_OFF,
  PROMPT_TURN_ON,
  PROMPT_Y_OFFSET,
  SPRITE_ANCHOR_X,
  SPRITE_ANCHOR_Y,
} from "./constants.ts";
import { parentForLayer } from "./parentForLayer.ts";
import { computeDoorCollisionTiles } from "./computeDoorCollisionTiles.ts";

/**
 * Add a placed object and render it immediately.
 * Uses loadSpriteSheet, findAnim (case-insensitive), creates RenderedObject,
 * calls computeDoorCollisionTiles for doors, starts ambient sounds.
 */
export async function addPlacedObject(
  layer: ObjectLayerContext,
  obj: PlacedObjectInput,
  defInfo?: SpriteDefInfo,
): Promise<void> {
  const def = defInfo ?? layer.defCache.get(obj.spriteDefName);
  if (!def) {
    console.warn(`[ObjectLayer] No sprite def found for "${obj.spriteDefName}"`);
    return;
  }

  try {
    let sheet = layer.sheetCache.get(def.spriteSheetUrl);
    if (!sheet) {
      sheet = await loadSpriteSheet(def.spriteSheetUrl);
      layer.sheetCache.set(def.spriteSheetUrl, sheet);
    }

    const isToggleable = !!def.toggleable;
    const isDoor = !!def.isDoor;
    const isOn = obj.isOn ?? ((isToggleable || isDoor) ? false : true);

    if (isDoor) {
      console.log(
        `[ObjectLayer] Door "${obj.spriteDefName}" at (${obj.x}, ${obj.y}) isOn=${isOn}`,
      );
    }

    const animKeys = Object.keys(sheet.animations);
    const findAnim = (name?: string): Texture[] | undefined => {
      if (!name) return undefined;
      if (sheet!.animations[name]) return sheet!.animations[name];
      const lower = name.toLowerCase();
      const key = animKeys.find((k) => k.toLowerCase() === lower);
      return key ? sheet!.animations[key] : undefined;
    };

    // ── Door: resolve 4 animations ──
    let doorClosedFrames: Texture[] | undefined;
    let doorOpeningFrames: Texture[] | undefined;
    let doorOpenFrames: Texture[] | undefined;
    let doorClosingFrames: Texture[] | undefined;
    let doorState: DoorState = "closed";

    if (isDoor) {
      doorClosedFrames = findAnim(def.doorClosedAnimation || def.defaultAnimation);
      doorOpeningFrames = findAnim(def.doorOpeningAnimation);
      doorOpenFrames = findAnim(def.doorOpenAnimation);
      doorClosingFrames = findAnim(def.doorClosingAnimation);
      doorState = isOn ? "open" : "closed";
    }

    // ── Toggle: resolve on/off animations ──
    const onAnimName = def.onAnimation || def.defaultAnimation;
    const onFrames = findAnim(onAnimName);
    const offFrames =
      isToggleable && !def.offAnimation
        ? undefined
        : findAnim(def.offAnimation || def.defaultAnimation);

    // ── Pick initial frames ──
    let activeFrames: Texture[] | undefined;
    if (isDoor) {
      activeFrames = doorState === "open" ? doorOpenFrames : doorClosedFrames;
    } else {
      activeFrames = isOn ? onFrames : offFrames;
    }

    if (
      !isToggleable &&
      !isDoor &&
      (!activeFrames || activeFrames.length === 0)
    ) {
      console.warn(
        `[ObjectLayer] No frames for animation in ${def.spriteSheetUrl}`,
      );
      return;
    }

    if (isToggleable && !onFrames && !offFrames) {
      console.warn(
        `[ObjectLayer] No on or off frames for toggleable "${obj.spriteDefName}" in ${def.spriteSheetUrl}`,
      );
      return;
    }

    if (isDoor && !doorClosedFrames) {
      console.warn(
        `[ObjectLayer] No closed animation for door "${obj.spriteDefName}"`,
      );
      return;
    }

    const objContainer = new Container();
    objContainer.x = obj.x;
    objContainer.y = obj.y;
    objContainer.zIndex = Math.round(obj.y);
    const layerIndex = obj.layer ?? DEFAULT_LAYER_INDEX;

    const initFrames =
      activeFrames || onFrames || offFrames || doorClosedFrames;
    const sprite = new AnimatedSprite(initFrames!);
    sprite.anchor.set(SPRITE_ANCHOR_X, SPRITE_ANCHOR_Y);
    sprite.scale.set(def.scale);
    sprite.animationSpeed = def.animationSpeed;
    if (!activeFrames) {
      sprite.visible = false;
      sprite.gotoAndStop(ANIMATION_FIRST_FRAME);
    } else if (isDoor) {
      sprite.gotoAndStop(ANIMATION_FIRST_FRAME);
    } else if (isOn || !isToggleable) {
      sprite.play();
    } else {
      sprite.gotoAndStop(ANIMATION_FIRST_FRAME);
    }
    objContainer.addChild(sprite);

    const entry: RenderedObject = {
      id: obj.id,
      defName: obj.spriteDefName,
      animationSpeed: def.animationSpeed,
      layer: layerIndex,
      container: objContainer,
      sprite,
      x: obj.x,
      y: obj.y,
      toggleable: isToggleable,
      isOn,
      onFrames: onFrames ?? undefined,
      offFrames: offFrames ?? undefined,
      onSoundUrl: def.onSoundUrl,
      interactSoundUrl: def.interactSoundUrl,
      isDoor,
      doorState,
      doorClosedFrames,
      doorOpeningFrames,
      doorOpenFrames,
      doorClosingFrames,
      doorOpenSoundUrl: def.doorOpenSoundUrl,
      doorCloseSoundUrl: def.doorCloseSoundUrl,
    };

    if (isDoor) {
      entry.doorCollisionTiles = computeDoorCollisionTiles(
        obj.x,
        obj.y,
        def.frameWidth,
        def.frameHeight,
        def.scale,
        layer.tileWidth,
        layer.tileHeight,
      );
      if (
        doorState === "closed" &&
        entry.doorCollisionTiles &&
        entry.doorCollisionTiles.length > 0
      ) {
        layer.onDoorCollisionChange?.(entry.doorCollisionTiles, true);
      }
      if (
        doorState === "open" &&
        entry.doorCollisionTiles &&
        entry.doorCollisionTiles.length > 0
      ) {
        layer.onDoorCollisionChange?.(entry.doorCollisionTiles, false);
      }
    }

    if (isToggleable || isDoor) {
      const glow = new Graphics();
      glow.circle(
        GLOW_CENTER_X,
        -(def.frameHeight * def.scale) * GLOW_Y_HALF_HEIGHT_FACTOR,
        GLOW_RADIUS,
      );
      glow.fill({ color: GLOW_COLOR, alpha: GLOW_ALPHA });
      glow.visible = false;
      objContainer.addChildAt(glow, 0);
      entry.glow = glow;

      let promptText: string;
      if (isDoor) {
        promptText = doorState === "open" ? PROMPT_CLOSE : PROMPT_OPEN;
      } else {
        promptText = isOn ? PROMPT_TURN_OFF : PROMPT_TURN_ON;
      }
      const prompt = new Text({
        text: promptText,
        style: new TextStyle({
          fontSize: PROMPT_FONT_SIZE,
          fill: PROMPT_FILL_COLOR,
          fontFamily: PROMPT_FONT_FAMILY,
          stroke: { color: PROMPT_STROKE_COLOR, width: PROMPT_STROKE_WIDTH },
        }),
      });
      prompt.anchor.set(PROMPT_ANCHOR_X, PROMPT_ANCHOR_Y);
      prompt.y = -(def.frameHeight * def.scale) - PROMPT_Y_OFFSET;
      prompt.visible = false;
      objContainer.addChild(prompt);
      entry.prompt = prompt;
    }

    parentForLayer(layer, layerIndex).addChild(objContainer);

    if (def.ambientSoundUrl && layer.audio) {
      entry.ambientRadius = def.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
      entry.ambientBaseVolume = def.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME;
      if (!isToggleable || isOn) {
        layer.audio.playAmbient(def.ambientSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
          if (handle) entry.sfxHandle = handle;
        });
      }
    }

    if (isToggleable && isOn && def.onSoundUrl && layer.audio) {
      entry.ambientRadius = entry.ambientRadius ?? (def.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS);
      entry.ambientBaseVolume =
        entry.ambientBaseVolume ?? (def.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME);
      layer.audio.playAmbient(def.onSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
        if (handle) entry.onSfxHandle = handle;
      });
    }

    layer.rendered.push(entry);
  } catch (err) {
    console.warn(`Failed to render object "${obj.spriteDefName}":`, err);
  }
}
