import type { AnimatedSprite, Container, Graphics, Text } from "pixi.js";
import type { Texture } from "pixi.js";
import type { SfxHandle } from "../AudioManager/index.ts";

/** Minimal sprite def info needed for rendering */
export interface SpriteDefInfo {
  name: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
  isDoor?: boolean;
  doorClosedAnimation?: string;
  doorOpeningAnimation?: string;
  doorOpenAnimation?: string;
  doorClosingAnimation?: string;
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
}

export type DoorState = "closed" | "opening" | "open" | "closing";

export interface RenderedObject {
  id: string;
  defName: string;
  animationSpeed: number;
  layer: number;
  sprite: AnimatedSprite;
  container: Container;
  x: number;
  y: number;
  sfxHandle?: SfxHandle;
  ambientRadius?: number;
  ambientBaseVolume?: number;
  toggleable: boolean;
  isOn: boolean;
  onFrames?: Texture[];
  offFrames?: Texture[];
  glow?: Graphics;
  prompt?: Text;
  onSoundUrl?: string;
  onSfxHandle?: SfxHandle;
  interactSoundUrl?: string;
  isDoor: boolean;
  doorState: DoorState;
  doorClosedFrames?: Texture[];
  doorOpeningFrames?: Texture[];
  doorOpenFrames?: Texture[];
  doorClosingFrames?: Texture[];
  doorCollisionTiles?: { x: number; y: number }[];
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
}

/** Sound config passed when refreshing sounds for a sprite def */
export interface ObjectSoundConfig {
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  onSoundUrl?: string;
  interactSoundUrl?: string;
}

/** Minimal context for ambient/toggle update functions only */
export interface AmbientToggleContext {
  rendered: RenderedObject[];
  defCache: Map<string, SpriteDefInfo>;
  audio: import("../AudioManager/index.ts").AudioManager | null;
  tileWidth: number;
  tileHeight: number;
  elapsed: number;
  nearestToggleable: RenderedObject | null;
}

/** Minimal shape for parentForLayer — avoids requiring full ObjectLayerContext */
export interface IObjectLayerContainers {
  container: Container;
  bgContainer: Container;
  overlayContainer: Container;
}

/** Layer context for addPlacedObject, ghost, ambient/toggle (internal use) */
export interface ObjectLayerContext {
  rendered: RenderedObject[];
  defCache: Map<string, SpriteDefInfo>;
  sheetCache: Map<string, import("pixi.js").Spritesheet>;
  audio: import("../AudioManager/index.ts").AudioManager | null;
  tileWidth: number;
  tileHeight: number;
  elapsed: number;
  nearestToggleable: RenderedObject | null;
  onDoorCollisionChange:
    | ((tiles: { x: number; y: number }[], blocked: boolean) => void)
    | null;
  bgContainer: Container;
  container: Container;
  overlayContainer: Container;
  ghostSprite: AnimatedSprite | null;
  ghostDefName: string | null;
}

/** Minimal placed object input — avoids importing from editor (circular deps) */
export interface PlacedObjectInput {
  id: string;
  spriteDefName: string;
  x: number;
  y: number;
  layer: number;
  isOn?: boolean;
  instanceName?: string;
  sourceId?: string;
}

/** Minimal audio interface — avoids importing AudioManager in consuming modules */
export interface IObjectLayerAudio {
  playAmbient(url: string, volume: number): Promise<SfxHandle | null>;
  playOneShot(url: string, volume: number): void;
}

/** Minimal context for door modules (audio, onDoorCollisionChange) */
export interface IObjectLayerDoorContext {
  audio: import("../AudioManager/index.ts").AudioManager | null;
  onDoorCollisionChange:
    | ((tiles: { x: number; y: number }[], blocked: boolean) => void)
    | null;
}

/** Minimal ObjectLayer interface for modules to avoid circular imports */
export interface IObjectLayer {
  container: Container;
  bgContainer: Container;
  overlayContainer: Container;
  tileWidth: number;
  tileHeight: number;
  onDoorCollisionChange:
    | ((tiles: { x: number; y: number }[], blocked: boolean) => void)
    | null;

  setAudio(audio: IObjectLayerAudio): void;
  registerSpriteDef(def: SpriteDefInfo): void;
  addPlacedObject(obj: PlacedObjectInput, defInfo?: SpriteDefInfo): Promise<void>;
  removePlacedObject(id: string): void;
  loadAll(objects: PlacedObjectInput[], defs: SpriteDefInfo[]): Promise<void>;
  updateAmbientVolumes(listenerX: number, listenerY: number): void;
  refreshSoundsForDef(defName: string, sounds: ObjectSoundConfig): void;
  updateToggleAndAmbient(dt: number, playerX: number, playerY: number): void;
  updateToggleInteraction(dt: number, playerX: number, playerY: number): void;
  getNearestToggleableId(): string | null;
  getNearestToggleableState(): boolean;
  isNearestDoor(): boolean;
  applyToggle(id: string, isOn: boolean): void;
  showGhost(def: SpriteDefInfo): Promise<void>;
  updateGhost(worldX: number, worldY: number): void;
  hideGhost(): void;
  clear(): void;
  destroy(): void;
}
