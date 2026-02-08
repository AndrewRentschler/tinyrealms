/**
 * TileAnimator — renders animated tile replacements on top of a tile map.
 *
 * Each map can optionally reference an animation descriptor (JSON) via
 * `MapData.animationUrl`. The descriptor lists a spritesheet and an array
 * of tile positions where animated sprites should be placed.
 *
 * This class is intentionally generic — all map-specific data lives in the
 * descriptor JSON + spritesheet files under `public/assets/animations/`.
 * To add animated tiles to a new map, just create a new descriptor and
 * spritesheet; no engine code changes are needed.
 */

import { Container, AnimatedSprite, Assets, Spritesheet } from "pixi.js";
import type { AnimationDescriptor, AnimationTilePlacement } from "../types.ts";

export class TileAnimator {
  /** Container holding all animated sprites — add this to the map's scene graph */
  readonly container: Container;

  private sprites: AnimatedSprite[] = [];
  private descriptor: AnimationDescriptor | null = null;
  private playing = false;

  constructor() {
    this.container = new Container();
    this.container.label = "animated-tiles";
    // Sit between bg layers (zIndex 0) and obj layers but below entities
    this.container.zIndex = 5;
  }

  /**
   * Load an animation descriptor and create all animated sprites.
   * Call this after the map's static tiles have been rendered.
   */
  async load(descriptorUrl: string): Promise<void> {
    // Fetch the descriptor JSON
    const resp = await fetch(descriptorUrl);
    if (!resp.ok) {
      console.warn(`TileAnimator: failed to fetch ${descriptorUrl}`);
      return;
    }
    this.descriptor = (await resp.json()) as AnimationDescriptor;

    // Load the PixiJS spritesheet (JSON + texture)
    const sheet: Spritesheet = await Assets.load(this.descriptor.spritesheet);

    if (!sheet.animations || Object.keys(sheet.animations).length === 0) {
      console.warn(
        `TileAnimator: spritesheet has no animations`,
        this.descriptor.spritesheet,
      );
      return;
    }

    // Create animated sprites for each tile placement
    const { tileWidth, tileHeight, defaultSpeed, tiles } = this.descriptor;

    for (const tile of tiles) {
      const frames = sheet.animations[tile.animation];
      if (!frames) {
        // Skip unknown animation names silently
        continue;
      }

      const anim = new AnimatedSprite(frames);
      anim.x = tile.x * tileWidth;
      anim.y = tile.y * tileHeight;
      anim.width = tileWidth;
      anim.height = tileHeight;
      anim.animationSpeed = tile.speed ?? defaultSpeed;
      anim.autoUpdate = true;
      // Start at a random frame so the ocean doesn't all pulse in sync
      anim.gotoAndPlay(Math.floor(Math.random() * frames.length));

      this.sprites.push(anim);
      this.container.addChild(anim);
    }

    this.playing = true;
    console.log(
      `TileAnimator: loaded ${this.sprites.length} animated tiles from ${descriptorUrl}`,
    );
  }

  /** Pause all animations (e.g. when map is off-screen) */
  pause(): void {
    if (!this.playing) return;
    for (const s of this.sprites) s.stop();
    this.playing = false;
  }

  /** Resume all animations */
  resume(): void {
    if (this.playing) return;
    for (const s of this.sprites) s.play();
    this.playing = true;
  }

  /** Tear down — remove all sprites and clear references */
  destroy(): void {
    this.pause();
    this.container.removeChildren();
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.descriptor = null;
  }
}
