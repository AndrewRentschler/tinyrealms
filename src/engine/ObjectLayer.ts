/**
 * ObjectLayer — renders placed sprite objects on the map.
 * These are static or animated sprites placed via the editor's object tool.
 * Supports toggleable on/off state (e.g. fireplaces, lamps) with glow + prompt.
 */
import { Container, AnimatedSprite, Graphics, Text, TextStyle } from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Spritesheet, Texture } from "pixi.js";
import type { PlacedObject } from "../editor/MapEditorPanel.ts";
import type { AudioManager } from "./AudioManager.ts";

const OBJ_INTERACT_RADIUS = 56; // pixels — slightly larger than NPC radius

/** Minimal sprite def info needed for rendering */
export interface SpriteDefInfo {
  name: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  scale: number;
  frameWidth: number;
  frameHeight: number;
  // Sound (optional)
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  // Toggleable on/off
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
}

interface RenderedObject {
  id: string;
  defName: string;
  sprite: AnimatedSprite;
  container: Container;       // wrapper for sprite + glow + prompt
  x: number;
  y: number;
  sfxHandle?: import("./AudioManager.ts").SfxHandle;
  ambientRadius?: number;
  ambientBaseVolume?: number;
  // Toggle state
  toggleable: boolean;
  isOn: boolean;
  onFrames?: Texture[];
  offFrames?: Texture[];
  glow?: Graphics;
  prompt?: Text;
  onSoundUrl?: string;
  onSfxHandle?: import("./AudioManager.ts").SfxHandle;
  interactSoundUrl?: string;
}

export class ObjectLayer {
  container: Container;
  private rendered: RenderedObject[] = [];
  private sheetCache = new Map<string, Spritesheet>();
  private defCache = new Map<string, SpriteDefInfo>();
  private audio: AudioManager | null = null;

  // Ghost preview sprite
  private ghostSprite: AnimatedSprite | null = null;
  private ghostDefName: string | null = null;

  /** Currently highlighted toggleable object (nearest within radius) */
  private nearestToggleable: RenderedObject | null = null;
  private elapsed = 0;

  constructor() {
    this.container = new Container();
    this.container.label = "objects";
    this.container.sortableChildren = true;
    this.container.zIndex = 50; // between map and overlay
  }

  /** Set the audio manager for ambient sounds */
  setAudio(audio: AudioManager) {
    this.audio = audio;
  }

  /** Cache a sprite definition (called when loading from Convex) */
  registerSpriteDef(def: SpriteDefInfo) {
    this.defCache.set(def.name, def);
  }

  /** Place an object and render it immediately */
  async addPlacedObject(obj: PlacedObject, defInfo?: SpriteDefInfo) {
    const def = defInfo ?? this.defCache.get(obj.spriteDefName);
    if (!def) {
      console.warn(`[ObjectLayer] No sprite def found for "${obj.spriteDefName}"`);
      return;
    }

    try {
      // Load sprite sheet (cached)
      let sheet = this.sheetCache.get(def.spriteSheetUrl);
      if (!sheet) {
        sheet = await loadSpriteSheet(def.spriteSheetUrl);
        this.sheetCache.set(def.spriteSheetUrl, sheet);
      }

      const isToggleable = !!def.toggleable;
      // Default toggleables to OFF unless explicitly set
      const isOn = obj.isOn ?? (isToggleable ? false : true);

      // Resolve animation names (case-insensitive lookup)
      const animKeys = Object.keys(sheet.animations);
      const findAnim = (name: string) => {
        // exact match first, then case-insensitive
        if (sheet!.animations[name]) return sheet!.animations[name];
        const lower = name.toLowerCase();
        const key = animKeys.find(k => k.toLowerCase() === lower);
        return key ? sheet!.animations[key] : undefined;
      };

      // For toggleables: only resolve animations that are explicitly configured.
      // If offAnimation is not set, the sprite hides when OFF (and vice versa).
      const onAnimName = def.onAnimation || def.defaultAnimation;
      const onFrames = findAnim(onAnimName);
      const offFrames = isToggleable && !def.offAnimation
        ? undefined                           // no off animation → invisible when off
        : findAnim(def.offAnimation || def.defaultAnimation);

      // Pick which frames to show right now
      const activeFrames = isOn ? onFrames : offFrames;

      // For non-toggleables we still need at least some frames
      if (!isToggleable && (!activeFrames || activeFrames.length === 0)) {
        console.warn(`[ObjectLayer] No frames for animation in ${def.spriteSheetUrl}`);
        return;
      }

      // For toggleables, we need at least one state to have frames
      if (isToggleable && !onFrames && !offFrames) {
        console.warn(`[ObjectLayer] No on or off frames for toggleable "${obj.spriteDefName}" in ${def.spriteSheetUrl}`);
        return;
      }

      // Create wrapper container for sprite + glow + prompt
      const objContainer = new Container();
      objContainer.x = obj.x;
      objContainer.y = obj.y;
      objContainer.zIndex = Math.round(obj.y);

      // Use whichever frames are available for initial creation
      const initFrames = activeFrames || onFrames || offFrames;
      const sprite = new AnimatedSprite(initFrames!);
      sprite.anchor.set(0.5, 1.0);
      sprite.scale.set(def.scale);
      sprite.animationSpeed = 0.1;
      if (!activeFrames) {
        // No frames for the current state → hide sprite
        sprite.visible = false;
        sprite.gotoAndStop(0);
      } else if (isOn || !isToggleable) {
        sprite.play();
      } else {
        sprite.gotoAndStop(0); // show first frame of off animation
      }
      objContainer.addChild(sprite);


      const entry: RenderedObject = {
        id: obj.id,
        defName: obj.spriteDefName,
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
      };

      // Add glow + prompt for toggleable objects
      if (isToggleable) {
        const glow = new Graphics();
        glow.circle(0, -(def.frameHeight * def.scale) / 2, 18);
        glow.fill({ color: 0xffcc44, alpha: 0.3 });
        glow.visible = false;
        objContainer.addChildAt(glow, 0); // behind sprite
        entry.glow = glow;

        const stateLabel = isOn ? "Off" : "On";
        const prompt = new Text({
          text: `[E] Turn ${stateLabel}`,
          style: new TextStyle({
            fontSize: 9,
            fill: 0xffffff,
            fontFamily: "Inter, sans-serif",
            stroke: { color: 0x000000, width: 2 },
          }),
        });
        prompt.anchor.set(0.5, 1);
        prompt.y = -(def.frameHeight * def.scale) - 8;
        prompt.visible = false;
        objContainer.addChild(prompt);
        entry.prompt = prompt;
      }

      this.container.addChild(objContainer);

      // Start ambient sound if defined (and object is "on" or non-toggleable)
      if (def.ambientSoundUrl && this.audio) {
        entry.ambientRadius = def.ambientSoundRadius ?? 200;
        entry.ambientBaseVolume = def.ambientSoundVolume ?? 0.5;
        if (!isToggleable || isOn) {
          this.audio.playAmbient(def.ambientSoundUrl, 0).then((handle) => {
            if (handle) entry.sfxHandle = handle;
          });
        }
      }

      // Start "on" sound if toggleable and currently on
      if (isToggleable && isOn && def.onSoundUrl && this.audio) {
        entry.ambientRadius = entry.ambientRadius ?? (def.ambientSoundRadius ?? 200);
        entry.ambientBaseVolume = entry.ambientBaseVolume ?? (def.ambientSoundVolume ?? 0.5);
        this.audio.playAmbient(def.onSoundUrl, 0).then((handle) => {
          if (handle) entry.onSfxHandle = handle;
        });
      }

      this.rendered.push(entry);
    } catch (err) {
      console.warn(`Failed to render object "${obj.spriteDefName}":`, err);
    }
  }

  /** Remove a placed object */
  removePlacedObject(id: string) {
    const idx = this.rendered.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const r = this.rendered.splice(idx, 1)[0];
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      this.container.removeChild(r.container);
      r.container.destroy({ children: true });
      if (this.nearestToggleable === r) this.nearestToggleable = null;
    }
  }

  /** Load a batch of objects + their sprite defs */
  async loadAll(objects: PlacedObject[], defs: SpriteDefInfo[]) {
    // Register all defs
    for (const d of defs) {
      this.registerSpriteDef(d);
    }

    // Render all objects
    for (const obj of objects) {
      await this.addPlacedObject(obj);
    }
  }

  // =========================================================================
  // Spatial audio: update ambient volumes based on listener position
  // =========================================================================

  /** Call each frame with the player's world position to update ambient volumes */
  updateAmbientVolumes(listenerX: number, listenerY: number) {
    for (const r of this.rendered) {
      if (!r.ambientRadius) continue;

      const dx = r.x - listenerX;
      const dy = r.y - listenerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const vol = dist >= r.ambientRadius
        ? 0
        : (1 - dist / r.ambientRadius) * (r.ambientBaseVolume ?? 0.5);

      if (r.sfxHandle) r.sfxHandle.setVolume(vol);
      if (r.onSfxHandle) r.onSfxHandle.setVolume(vol);
    }
  }

  // =========================================================================
  // Live-refresh sounds after a sprite definition is updated
  // =========================================================================

  refreshSoundsForDef(
    defName: string,
    sounds: {
      ambientSoundUrl?: string;
      ambientSoundRadius?: number;
      ambientSoundVolume?: number;
    },
  ) {
    for (const r of this.rendered) {
      if (r.defName !== defName) continue;

      // Stop old sound
      if (r.sfxHandle) {
        r.sfxHandle.stop();
        r.sfxHandle = undefined;
        r.ambientRadius = undefined;
        r.ambientBaseVolume = undefined;
      }

      // Start new sound if one is now defined
      if (sounds.ambientSoundUrl && this.audio) {
        r.ambientRadius = sounds.ambientSoundRadius ?? 200;
        r.ambientBaseVolume = sounds.ambientSoundVolume ?? 0.5;
        this.audio.playAmbient(sounds.ambientSoundUrl, 0).then((handle) => {
          if (handle) r.sfxHandle = handle;
        });
      }
    }
  }

  // =========================================================================
  // Toggleable object interaction (proximity + glow + prompt)
  // =========================================================================

  /** Call each frame in play mode to update toggleable object interaction */
  updateToggleInteraction(dt: number, playerX: number, playerY: number) {
    this.elapsed += dt;

    // Find nearest toggleable object within interact radius
    let nearest: RenderedObject | null = null;
    let nearestDist = OBJ_INTERACT_RADIUS;

    for (const r of this.rendered) {
      if (!r.toggleable) continue;
      const dx = r.x - playerX;
      const dy = r.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = r;
        nearestDist = dist;
      }
    }

    // Update glow + prompt visibility
    if (this.nearestToggleable && this.nearestToggleable !== nearest) {
      if (this.nearestToggleable.glow) this.nearestToggleable.glow.visible = false;
      if (this.nearestToggleable.prompt) this.nearestToggleable.prompt.visible = false;
    }

    this.nearestToggleable = nearest;
    if (nearest) {
      if (nearest.glow) {
        nearest.glow.visible = true;
        // Pulse glow
        nearest.glow.alpha = 0.2 + 0.15 * Math.sin(this.elapsed * 3);
      }
      if (nearest.prompt) {
        nearest.prompt.visible = true;
      }
    }
  }

  /** Get the ID of the nearest toggleable object (for toggle action) */
  getNearestToggleableId(): string | null {
    return this.nearestToggleable?.id ?? null;
  }

  /** Get whether the nearest toggleable is currently on */
  getNearestToggleableState(): boolean {
    return this.nearestToggleable?.isOn ?? false;
  }

  /** Apply a toggle state change to a rendered object (called after Convex mutation) */
  applyToggle(id: string, isOn: boolean) {
    const r = this.rendered.find((r) => r.id === id);
    if (!r || !r.toggleable) return;

    r.isOn = isOn;

    // Switch animation — hide sprite if no frames for this state
    const frames = isOn ? r.onFrames : r.offFrames;
    if (frames && frames.length > 0) {
      r.sprite.textures = frames;
      r.sprite.animationSpeed = 0.1;
      r.sprite.visible = true;
      if (isOn) {
        r.sprite.gotoAndPlay(0);
      } else {
        r.sprite.gotoAndStop(0);
      }
    } else {
      // No frames for this state — hide the sprite
      r.sprite.visible = false;
      r.sprite.stop();
    }

    // Update prompt text
    if (r.prompt) {
      (r.prompt as Text).text = `[E] Turn ${isOn ? "Off" : "On"}`;
    }

    // Play one-shot interact sound when turning ON
    if (isOn && r.interactSoundUrl && this.audio) {
      this.audio.playOneShot(r.interactSoundUrl, 0.7);
    }

    // Handle ambient / looping sounds
    if (isOn) {
      const def = this.defCache.get(r.defName);

      // Ensure ambientRadius is set so updateAmbientVolumes can control volume
      if (!r.ambientRadius) {
        r.ambientRadius = def?.ambientSoundRadius ?? 200;
        r.ambientBaseVolume = def?.ambientSoundVolume ?? 0.5;
      }

      // Start on-sound if defined
      if (r.onSoundUrl && this.audio && !r.onSfxHandle) {
        this.audio.playAmbient(r.onSoundUrl, 0).then((handle) => {
          if (handle) r.onSfxHandle = handle;
        });
      }
      // Start ambient sound
      if (def?.ambientSoundUrl && this.audio && !r.sfxHandle) {
        this.audio.playAmbient(def.ambientSoundUrl, 0).then((handle) => {
          if (handle) r.sfxHandle = handle;
        });
      }
    } else {
      // Stop on-sound
      if (r.onSfxHandle) {
        r.onSfxHandle.stop();
        r.onSfxHandle = undefined;
      }
      // Stop ambient sound
      if (r.sfxHandle) {
        r.sfxHandle.stop();
        r.sfxHandle = undefined;
      }
    }
  }

  // =========================================================================
  // Ghost preview
  // =========================================================================

  /** Show a semi-transparent ghost of a sprite def at the cursor position */
  async showGhost(def: SpriteDefInfo) {
    // Don't reload if it's already the same def
    if (this.ghostDefName === def.name && this.ghostSprite) return;

    this.hideGhost();
    this.ghostDefName = def.name;

    try {
      let sheet = this.sheetCache.get(def.spriteSheetUrl);
      if (!sheet) {
        sheet = await loadSpriteSheet(def.spriteSheetUrl);
        this.sheetCache.set(def.spriteSheetUrl, sheet);
      }

      const animFrames = sheet.animations[def.defaultAnimation];
      if (!animFrames || animFrames.length === 0) return;

      const sprite = new AnimatedSprite(animFrames);
      sprite.anchor.set(0.5, 1.0);
      sprite.scale.set(def.scale);
      sprite.alpha = 0.45;
      sprite.animationSpeed = 0.1;
      sprite.play();
      sprite.zIndex = 99999; // always on top
      sprite.visible = false; // hidden until first updateGhost

      this.ghostSprite = sprite;
      this.container.addChild(sprite);
    } catch (err) {
      console.warn("Failed to create ghost sprite:", err);
    }
  }

  /** Update the ghost position (world coordinates) */
  updateGhost(worldX: number, worldY: number) {
    if (!this.ghostSprite) return;
    this.ghostSprite.x = Math.round(worldX);
    this.ghostSprite.y = Math.round(worldY);
    this.ghostSprite.visible = true;
  }

  /** Remove the ghost */
  hideGhost() {
    if (this.ghostSprite) {
      this.container.removeChild(this.ghostSprite);
      this.ghostSprite.destroy();
      this.ghostSprite = null;
      this.ghostDefName = null;
    }
  }

  /** Clear everything */
  clear() {
    this.hideGhost();
    for (const r of this.rendered) {
      r.sfxHandle?.stop();
      r.onSfxHandle?.stop();
      this.container.removeChild(r.container);
      r.container.destroy({ children: true });
    }
    this.rendered = [];
    this.nearestToggleable = null;
  }

  destroy() {
    this.clear();
    this.container.destroy();
  }
}
