/**
 * WorldItemLayer — renders item pickups on the map.
 *
 * Each world item is drawn from its itemDef's tileset icon crop.
 * Items glow and bob when the player is nearby, with a "[E] Pick up" prompt.
 * During play mode, pressing E picks up the nearest item.
 */
import { Container, Texture } from "pixi.js";
import type { Graphics } from "pixi.js";
import type { WorldItemDefInfo, WorldItemInstance, RenderedWorldItem, WorldItemLayerAddContext, WorldItemLayerUpdateState, WorldItemLayerGhostContext } from "./types.ts";
import {
  CONTAINER_LABEL,
  CONTAINER_Z_INDEX,
  FIND_ITEM_AT_DEFAULT_RADIUS,
  PICKED_UP_ALPHA_BUILD_MODE,
  PICKED_UP_ALPHA_PLAY_MODE,
  RESPAWN_LABEL_NAME,
} from "./constants.ts";
import { addItem as addItemFn } from "./addItem.ts";
import { update as updateFn } from "./update.ts";
import { showGhost as showGhostFn, updateGhost as updateGhostFn, hideGhost as hideGhostFn } from "./ghost.ts";
import { loadSpriteSheet } from "../SpriteLoader.ts";

export class WorldItemLayer {
  container: Container;
  private rendered: RenderedWorldItem[] = [];
  private defCache = new Map<string, WorldItemDefInfo>();
  private textureCache = new Map<string, Texture>();
  private spriteSheetCache = new Map<string, Awaited<ReturnType<typeof loadSpriteSheet>>>();

  /** Currently highlighted item (nearest within radius) */
  private nearestItem: RenderedWorldItem | null = null;

  /** Build mode flag — picked-up items shown more prominently */
  private buildMode = false;

  /** Elapsed time for bob animation */
  private elapsed = 0;

  /** Ghost preview (build mode) */
  private ghostSprite: import("pixi.js").Sprite | import("pixi.js").AnimatedSprite | Graphics | null = null;
  private ghostDefName: string | null = null;

  constructor() {
    this.container = new Container();
    this.container.label = CONTAINER_LABEL;
    this.container.sortableChildren = true;
    this.container.zIndex = CONTAINER_Z_INDEX;
  }

  registerDef(def: WorldItemDefInfo) {
    this.defCache.set(def.name, def);
  }

  /** Add a single item to the layer */
  async addItem(item: WorldItemInstance, defInfo?: WorldItemDefInfo) {
    const entry = await addItemFn(this.getAddContext(), item, defInfo);
    if (entry) this.rendered.push(entry);
  }

  /** Remove an item from the layer */
  removeItem(id: string) {
    const idx = this.rendered.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const r = this.rendered.splice(idx, 1)[0];
      this.container.removeChild(r.container);
      r.container.destroy({ children: true });
      if (this.nearestItem === r) this.nearestItem = null;
    }
  }

  /** Load a batch of items + their defs (parallel add for faster load). */
  async loadAll(items: WorldItemInstance[], defs: Record<string, WorldItemDefInfo>) {
    for (const d of Object.values(defs)) {
      this.registerDef(d);
    }
    const entries = await Promise.all(
      items.map((item) => addItemFn(this.getAddContext(), item, defs[item.itemDefName])),
    );
    for (const entry of entries) {
      if (entry) this.rendered.push(entry);
    }
  }

  /** Update animation + proximity detection each frame */
  update(dt: number, playerX: number, playerY: number): RenderedWorldItem | null {
    const state: WorldItemLayerUpdateState = {
      elapsed: this.elapsed,
      rendered: this.rendered,
      nearestItem: this.nearestItem,
    };
    const nearest = updateFn(dt, playerX, playerY, state);
    this.elapsed = state.elapsed;
    this.nearestItem = state.nearestItem;
    return nearest;
  }

  /** Get the ID of the nearest interactable item (for pickup) */
  getNearestItemId(): string | null {
    return this.nearestItem?.id ?? null;
  }

  /** Get the display name of the nearest item */
  getNearestItemName(): string | null {
    if (!this.nearestItem) return null;
    const def = this.defCache.get(this.nearestItem.defName);
    return def?.displayName ?? this.nearestItem.defName;
  }

  /** Get pickup SFX URL for the nearest item (if defined) */
  getNearestItemPickupSoundUrl(): string | null {
    if (!this.nearestItem) return null;
    const def = this.defCache.get(this.nearestItem.defName);
    return def?.pickupSoundUrl ?? null;
  }

  /** Mark an item as picked up (fade it out or remove it) */
  markPickedUp(id: string, respawns: boolean) {
    const r = this.rendered.find((r) => r.id === id);
    if (!r) return;
    if (respawns) {
      r.available = false;
      r.container.alpha = PICKED_UP_ALPHA_PLAY_MODE;
      r.glow.visible = false;
      r.prompt.visible = false;
      if (this.nearestItem === r) this.nearestItem = null;
    } else {
      this.removeItem(id);
    }
  }

  /** Toggle build mode — picked-up items shown with higher visibility */
  setBuildMode(enabled: boolean) {
    this.buildMode = enabled;
    for (const r of this.rendered) {
      if (!r.available) {
        r.container.alpha = enabled ? PICKED_UP_ALPHA_BUILD_MODE : PICKED_UP_ALPHA_PLAY_MODE;
        const label = r.container.children.find(
          (c) => c.label === RESPAWN_LABEL_NAME,
        );
        if (label) label.visible = enabled;
      }
    }
  }

  /** Find the item nearest to worldX/worldY within a radius (for build-mode inspection) */
  findItemAt(worldX: number, worldY: number, radius = FIND_ITEM_AT_DEFAULT_RADIUS): {
    id: string;
    defName: string;
    available: boolean;
    def?: WorldItemDefInfo;
  } | null {
    const radiusSq = radius * radius;
    let best: RenderedWorldItem | null = null;
    let bestDistSq = radiusSq;
    for (const r of this.rendered) {
      const dx = r.baseX - worldX;
      const dy = r.baseY - worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        best = r;
        bestDistSq = distSq;
      }
    }
    if (!best) return null;
    return {
      id: best.id,
      defName: best.defName,
      available: best.available,
      def: this.defCache.get(best.defName),
    };
  }

  /** Clear everything */
  clear() {
    for (const r of this.rendered) {
      this.container.removeChild(r.container);
      r.container.destroy({ children: true });
    }
    this.rendered = [];
    this.nearestItem = null;
  }

  destroy() {
    this.clear();
    this.container.destroy();
  }

  /** Show a semi-transparent ghost of an item def at the cursor */
  async showGhost(def: WorldItemDefInfo) {
    return showGhostFn(this.getGhostContext(), def);
  }

  /** Update ghost position */
  updateGhost(worldX: number, worldY: number) {
    updateGhostFn(this.getGhostContext(), worldX, worldY);
  }

  /** Hide and destroy the ghost */
  hideGhost() {
    hideGhostFn(this.getGhostContext());
  }

  private getAddContext(): WorldItemLayerAddContext {
    return {
      container: this.container,
      defCache: this.defCache,
      textureCache: this.textureCache,
      spriteSheetCache: this.spriteSheetCache,
      buildMode: this.buildMode,
    };
  }

  /** Mutable context for ghost — pass this so ghost module mutations apply to the layer */
  private getGhostContext(): WorldItemLayerGhostContext {
    return this as unknown as WorldItemLayerGhostContext;
  }
}
