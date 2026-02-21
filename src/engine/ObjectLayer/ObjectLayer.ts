/**
 * ObjectLayer — renders placed sprite objects on the map.
 * These are static or animated sprites placed via the editor's object tool.
 * Supports toggleable on/off state (e.g. fireplaces, lamps) with glow + prompt.
 */
import { Container, AnimatedSprite, Text } from "pixi.js";
import type { Spritesheet } from "pixi.js";
import type { AudioManager } from "../AudioManager/index.ts";
import type {
  ObjectLayerContext,
  SpriteDefInfo,
  RenderedObject,
  PlacedObjectInput,
  ObjectSoundConfig,
} from "./types.ts";
import {
  AMBIENT_INITIAL_VOLUME,
  ANIMATION_FIRST_FRAME,
  BG_CONTAINER_Z_INDEX,
  CONTAINER_LABEL_BG,
  CONTAINER_LABEL_OBJ,
  CONTAINER_LABEL_OVERLAY,
  DEFAULT_AMBIENT_RADIUS,
  DEFAULT_AMBIENT_VOLUME,
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_WIDTH,
  OBJ_CONTAINER_Z_INDEX,
  OVERLAY_CONTAINER_Z_INDEX,
  PROMPT_TURN_OFF,
  PROMPT_TURN_ON,
  SOUND_ONE_SHOT_VOLUME,
} from "./constants.ts";
import { addPlacedObject as addPlacedObjectFn } from "./addPlacedObject.ts";
import { showGhost as showGhostFn, updateGhost as updateGhostFn, hideGhost as hideGhostFn } from "./ghost.ts";
import { applyDoorTransition } from "./applyDoorTransition.ts";
import { parentForLayer } from "./parentForLayer.ts";
import { updateAmbientVolumes as updateAmbientVolumesFn } from "./updateAmbientVolumes.ts";
import { refreshSoundsForDef as refreshSoundsForDefFn } from "./refreshSoundsForDef.ts";
import { updateToggleAndAmbient as updateToggleAndAmbientFn } from "./updateToggleAndAmbient.ts";

export class ObjectLayer {
  /** Main container for obj-layer objects (y-sorted, same tier as entities) */
  container: Container;
  /** Container for background-layer objects (renders behind entities) */
  bgContainer: Container;
  /** Container for overlay-layer objects (renders above entities) */
  overlayContainer: Container;

  private rendered: RenderedObject[] = [];
  private sheetCache = new Map<string, Spritesheet>();
  private defCache = new Map<string, SpriteDefInfo>();
  private audio: AudioManager | null = null;

  private ghostSprite: AnimatedSprite | null = null;
  private ghostDefName: string | null = null;

  private nearestToggleable: RenderedObject | null = null;
  private elapsed = 0;

  tileWidth = DEFAULT_TILE_WIDTH;
  tileHeight = DEFAULT_TILE_HEIGHT;

  onDoorCollisionChange:
    | ((tiles: { x: number; y: number }[], blocked: boolean) => void)
    | null = null;

  /** Context for door modules (avoids exposing private audio) */
  private get doorContext(): import("./types.ts").IObjectLayerDoorContext {
    return { audio: this.audio, onDoorCollisionChange: this.onDoorCollisionChange };
  }

  constructor() {
    this.bgContainer = new Container();
    this.bgContainer.label = CONTAINER_LABEL_BG;
    this.bgContainer.sortableChildren = true;
    this.bgContainer.zIndex = BG_CONTAINER_Z_INDEX;

    this.container = new Container();
    this.container.label = CONTAINER_LABEL_OBJ;
    this.container.sortableChildren = true;
    this.container.zIndex = OBJ_CONTAINER_Z_INDEX;

    this.overlayContainer = new Container();
    this.overlayContainer.label = CONTAINER_LABEL_OVERLAY;
    this.overlayContainer.sortableChildren = true;
    this.overlayContainer.zIndex = OVERLAY_CONTAINER_Z_INDEX;
  }

  setAudio(audio: AudioManager) {
    this.audio = audio;
  }

  registerSpriteDef(def: SpriteDefInfo) {
    this.defCache.set(def.name, def);
  }

  async addPlacedObject(obj: PlacedObjectInput, defInfo?: SpriteDefInfo) {
    return addPlacedObjectFn(this.getFullLayerContext(), obj, defInfo);
  }

  removePlacedObject(id: string) {
    const idx = this.rendered.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const r = this.rendered.splice(idx, 1)[0];
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      parentForLayer(this, r.layer).removeChild(r.container);
      r.container.destroy({ children: true });
      if (this.nearestToggleable === r) this.nearestToggleable = null;
    }
  }

  async loadAll(objects: PlacedObjectInput[], defs: SpriteDefInfo[]) {
    for (const d of defs) {
      this.registerSpriteDef(d);
    }
    for (const obj of objects) {
      await this.addPlacedObject(obj);
    }
  }

  updateAmbientVolumes(listenerX: number, listenerY: number) {
    updateAmbientVolumesFn(this.getLayerContext(), listenerX, listenerY);
  }

  refreshSoundsForDef(defName: string, sounds: ObjectSoundConfig) {
    refreshSoundsForDefFn(this.getLayerContext(), defName, sounds);
  }

  updateToggleAndAmbient(dt: number, playerX: number, playerY: number) {
    const ctx = this.getLayerContext();
    updateToggleAndAmbientFn(ctx, dt, playerX, playerY);
    this.elapsed = ctx.elapsed;
    this.nearestToggleable = ctx.nearestToggleable;
  }

  private getLayerContext(): ObjectLayerContext {
    return this.getFullLayerContext();
  }

  /** Mutable context for ghost — passes this so mutations apply to the layer */
  private getMutableContext(): ObjectLayerContext {
    return this as unknown as ObjectLayerContext;
  }

  private getFullLayerContext(): ObjectLayerContext {
    return {
      rendered: this.rendered,
      defCache: this.defCache,
      sheetCache: this.sheetCache,
      audio: this.audio,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      elapsed: this.elapsed,
      nearestToggleable: this.nearestToggleable,
      onDoorCollisionChange: this.onDoorCollisionChange,
      bgContainer: this.bgContainer,
      container: this.container,
      overlayContainer: this.overlayContainer,
      ghostSprite: this.ghostSprite,
      ghostDefName: this.ghostDefName,
    };
  }

  updateToggleInteraction(dt: number, playerX: number, playerY: number) {
    this.updateToggleAndAmbient(dt, playerX, playerY);
  }

  getNearestToggleableId(): string | null {
    return this.nearestToggleable?.id ?? null;
  }

  getNearestToggleableState(): boolean {
    return this.nearestToggleable?.isOn ?? false;
  }

  isNearestDoor(): boolean {
    return this.nearestToggleable?.isDoor ?? false;
  }

  applyToggle(id: string, isOn: boolean) {
    const r = this.rendered.find((r) => r.id === id);
    if (!r) return;

    if (r.isDoor) {
      applyDoorTransition(this.doorContext, r, isOn);
      return;
    }

    if (!r.toggleable) return;

    r.isOn = isOn;

    const frames = isOn ? r.onFrames : r.offFrames;
    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.animationSpeed = r.animationSpeed;
      r.sprite.visible = true;
      if (isOn) {
        r.sprite.gotoAndPlay(ANIMATION_FIRST_FRAME);
      } else {
        r.sprite.gotoAndStop(ANIMATION_FIRST_FRAME);
      }
    } else {
      r.sprite.visible = false;
      r.sprite.stop();
    }

    if (r.prompt) {
      (r.prompt as Text).text = isOn ? PROMPT_TURN_OFF : PROMPT_TURN_ON;
    }

    if (isOn && r.interactSoundUrl && this.audio) {
      this.audio.playOneShot(r.interactSoundUrl, SOUND_ONE_SHOT_VOLUME);
    }

    if (isOn) {
      const def = this.defCache.get(r.defName);

      if (!r.ambientRadius) {
        r.ambientRadius = def?.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
        r.ambientBaseVolume = def?.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME;
      }

      if (r.onSoundUrl && this.audio && !r.onSfxHandle) {
        this.audio.playAmbient(r.onSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
          if (handle) r.onSfxHandle = handle;
        });
      }
      if (def?.ambientSoundUrl && this.audio && !r.sfxHandle) {
        this.audio.playAmbient(def.ambientSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
          if (handle) r.sfxHandle = handle;
        });
      }
    } else {
      if (r.onSfxHandle) {
        r.onSfxHandle.stop();
        r.onSfxHandle = undefined;
      }
      if (r.sfxHandle) {
        r.sfxHandle.stop();
        r.sfxHandle = undefined;
      }
    }
  }

  async showGhost(def: SpriteDefInfo) {
    return showGhostFn(this as unknown as ObjectLayerContext, def);
  }

  updateGhost(worldX: number, worldY: number) {
    updateGhostFn(this as unknown as ObjectLayerContext, worldX, worldY);
  }

  hideGhost() {
    hideGhostFn(this as unknown as ObjectLayerContext);
  }

  clear() {
    this.hideGhost();
    for (const r of this.rendered) {
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      parentForLayer(this, r.layer).removeChild(r.container);
      r.container.destroy({ children: true });
    }
    this.rendered = [];
    this.nearestToggleable = null;
  }

  destroy() {
    this.clear();
    this.bgContainer.destroy();
    this.container.destroy();
    this.overlayContainer.destroy();
  }
}
