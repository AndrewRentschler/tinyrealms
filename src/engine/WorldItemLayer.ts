/**
 * WorldItemLayer — renders item pickups on the map.
 *
 * Each world item is drawn from its itemDef's tileset icon crop.
 * Items glow and bob when the player is nearby, with a "[E] Pick up" prompt.
 * During play mode, pressing E picks up the nearest item.
 */
import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Sprite,
  AnimatedSprite,
  Texture,
  Rectangle,
  Assets,
} from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";

const ITEM_INTERACT_RADIUS = 48; // pixels — same as NPC interact radius
const BOB_AMPLITUDE = 3;         // pixels of vertical bob
const BOB_SPEED = 2.5;           // radians per second
const GLOW_RADIUS = 12;          // glow circle radius around item
const GLOW_ALPHA = 0.35;

/** Minimal item def info for rendering */
export interface WorldItemDefInfo {
  name: string;
  displayName: string;
  type: string;
  rarity: string;
  pickupSoundUrl?: string;
  iconTilesetUrl?: string;
  iconTileX?: number;
  iconTileY?: number;
  iconTileW?: number;
  iconTileH?: number;
  iconSpriteDefName?: string;
  iconSpriteSheetUrl?: string;
  iconSpriteAnimation?: string;
  iconSpriteAnimationSpeed?: number;
  iconSpriteScale?: number;
  iconSpriteFrameWidth?: number;
  iconSpriteFrameHeight?: number;
}

/** A world item instance placed on the map */
export interface WorldItemInstance {
  id: string;             // worldItems._id or local UUID
  itemDefName: string;
  x: number;
  y: number;
  quantity: number;
  respawn?: boolean;
  pickedUpAt?: number;
}

interface RenderedWorldItem {
  id: string;
  defName: string;
  container: Container;
  sprite: Sprite | AnimatedSprite | Graphics; // the visual
  glow: Graphics;
  prompt: Text;
  baseX: number;
  baseY: number;
  bobPhase: number;
  available: boolean;       // false if picked up and not yet respawned
}

// Rarity → glow colour
const RARITY_COLORS: Record<string, number> = {
  common:    0xffffff,
  uncommon:  0x44ff44,
  rare:      0x4488ff,
  epic:      0xbb44ff,
  legendary: 0xffaa00,
  unique:    0xff4444,
};

// Type → fallback emoji for items without tileset icons
const TYPE_EMOJI: Record<string, string> = {
  weapon: "⚔️", armor: "🛡", accessory: "💍",
  consumable: "🧪", material: "🪵", key: "🔑",
  currency: "🪙", quest: "📜", misc: "📦",
};

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

  constructor() {
    this.container = new Container();
    this.container.label = "worldItems";
    this.container.sortableChildren = true;
    this.container.zIndex = 45; // just below objects (50)
  }

  registerDef(def: WorldItemDefInfo) {
    this.defCache.set(def.name, def);
  }

  /** Add a single item to the layer */
  async addItem(item: WorldItemInstance, defInfo?: WorldItemDefInfo) {
    const def = defInfo ?? this.defCache.get(item.itemDefName);
    if (!def) {
      console.warn(`No item def for "${item.itemDefName}"`);
      return;
    }

    // Is this item currently available?
    const available = !item.pickedUpAt; // simplified — respawn logic checked at pickup

    const itemContainer = new Container();
    itemContainer.x = item.x;
    itemContainer.y = item.y;
    itemContainer.zIndex = Math.round(item.y);

    // Item visual
    let visual: Sprite | AnimatedSprite | Graphics;
    const itemH = def.iconTileH ?? def.iconSpriteFrameHeight ?? 16;
    if (def.iconSpriteSheetUrl && def.iconSpriteAnimation) {
      const spriteVisual = await this.loadSpriteDefVisual(def);
      visual = spriteVisual ?? this.createFallbackVisual(def);
    } else if (def.iconTilesetUrl && def.iconTileW && def.iconTileH) {
      // Create sprite from tileset crop
      const texture = await this.loadCroppedTexture(def);
      if (texture) {
        visual = new Sprite(texture);
        visual.anchor.set(0.5, 1.0);
      } else {
        visual = this.createFallbackVisual(def);
      }
    } else {
      visual = this.createFallbackVisual(def);
    }
    itemContainer.addChild(visual);

    // Glow circle (centered on item)
    const glowColor = RARITY_COLORS[def.rarity] ?? 0xffffff;
    const glow = new Graphics();
    glow.circle(0, -(itemH / 2), GLOW_RADIUS);
    glow.fill({ color: glowColor, alpha: GLOW_ALPHA });
    glow.visible = false; // only shown when player is near
    itemContainer.addChild(glow);

    // Pickup prompt (above item)
    const prompt = new Text({
      text: `[E] ${def.displayName}`,
      style: new TextStyle({
        fontSize: 9,
        fill: 0xffffff,
        fontFamily: "Inter, sans-serif",
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    prompt.anchor.set(0.5, 1);
    prompt.y = -(itemH + 6);
    prompt.visible = false;
    itemContainer.addChild(prompt);

    if (!available) {
      itemContainer.alpha = this.buildMode ? 0.6 : 0.3;
      // Add a "respawning" label visible in build mode
      const respawnLabel = new Text({
        text: "respawning",
        style: new TextStyle({
          fontSize: 8,
          fill: 0xffaa00,
          fontFamily: "Inter, sans-serif",
          stroke: { color: 0x000000, width: 2 },
        }),
      });
      respawnLabel.anchor.set(0.5, 0);
      respawnLabel.y = 2;
      respawnLabel.label = "respawn-label";
      respawnLabel.visible = this.buildMode;
      itemContainer.addChild(respawnLabel);
    }

    this.container.addChild(itemContainer);

    this.rendered.push({
      id: item.id,
      defName: item.itemDefName,
      container: itemContainer,
      sprite: visual,
      glow,
      prompt,
      baseX: item.x,
      baseY: item.y,
      bobPhase: Math.random() * Math.PI * 2, // random start phase
      available,
    });
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

  /** Load a batch of items + their defs */
  async loadAll(items: WorldItemInstance[], defs: Record<string, WorldItemDefInfo>) {
    for (const d of Object.values(defs)) {
      this.registerDef(d);
    }
    for (const item of items) {
      await this.addItem(item, defs[item.itemDefName]);
    }
  }

  /** Update animation + proximity detection each frame */
  update(dt: number, playerX: number, playerY: number): RenderedWorldItem | null {
    this.elapsed += dt;

    // Bob animation for all items
    for (const r of this.rendered) {
      if (!r.available) continue;
      const bob = Math.sin(this.elapsed * BOB_SPEED + r.bobPhase) * BOB_AMPLITUDE;
      r.sprite.y = (r.sprite.y ?? 0);
      // Apply bob offset to the sprite within its container
      if (r.sprite instanceof Sprite) {
        r.sprite.y = bob;
      } else {
        r.sprite.y = bob;
      }
    }

    // Find nearest available item within interact radius
    let nearest: RenderedWorldItem | null = null;
    let nearestDist = ITEM_INTERACT_RADIUS;

    for (const r of this.rendered) {
      if (!r.available) continue;
      const dx = r.baseX - playerX;
      const dy = r.baseY - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = r;
        nearestDist = dist;
      }
    }

    // Update glow + prompt visibility
    if (this.nearestItem && this.nearestItem !== nearest) {
      this.nearestItem.glow.visible = false;
      this.nearestItem.prompt.visible = false;
    }

    this.nearestItem = nearest;
    if (nearest) {
      nearest.glow.visible = true;
      nearest.prompt.visible = true;
      // Pulse the glow alpha
      const pulse = 0.2 + 0.15 * Math.sin(this.elapsed * 3);
      nearest.glow.alpha = pulse;
    }

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
      r.container.alpha = 0.3;
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
        // In build mode: show at 60% alpha with a label; in play mode: dim at 30%
        r.container.alpha = enabled ? 0.6 : 0.3;
        // Show/hide the respawn label
        const label = r.container.children.find(
          (c) => c.label === "respawn-label",
        );
        if (label) label.visible = enabled;
      }
    }
  }

  /** Find the item nearest to worldX/worldY within a radius (for build-mode inspection) */
  findItemAt(worldX: number, worldY: number, radius = 24): {
    id: string;
    defName: string;
    available: boolean;
    def?: WorldItemDefInfo;
  } | null {
    let best: RenderedWorldItem | null = null;
    let bestDist = radius;
    for (const r of this.rendered) {
      const dx = r.baseX - worldX;
      const dy = r.baseY - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        best = r;
        bestDist = dist;
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

  // =========================================================================
  // Ghost preview (cursor-following item preview in build mode)
  // =========================================================================

  private ghostSprite: Sprite | AnimatedSprite | Graphics | null = null;
  private ghostDefName: string | null = null;

  /** Show a semi-transparent ghost of an item def at the cursor */
  async showGhost(def: WorldItemDefInfo) {
    // Don't reload if same def
    if (this.ghostDefName === def.name && this.ghostSprite) return;
    this.hideGhost();
    this.ghostDefName = def.name;

    let visual: Sprite | AnimatedSprite | Graphics;
    if (def.iconSpriteSheetUrl && def.iconSpriteAnimation) {
      const spriteVisual = await this.loadSpriteDefVisual(def);
      visual = spriteVisual ?? this.createFallbackVisual(def);
    } else if (def.iconTilesetUrl && def.iconTileW && def.iconTileH) {
      const texture = await this.loadCroppedTexture(def);
      if (texture) {
        visual = new Sprite(texture);
        visual.anchor.set(0.5, 1.0);
      } else {
        visual = this.createFallbackVisual(def);
      }
    } else {
      visual = this.createFallbackVisual(def);
    }
    visual.alpha = 0.45;
    visual.zIndex = 99999;
    this.container.addChild(visual);
    this.ghostSprite = visual;
  }

  /** Update ghost position */
  updateGhost(worldX: number, worldY: number) {
    if (this.ghostSprite) {
      this.ghostSprite.x = worldX;
      this.ghostSprite.y = worldY;
    }
  }

  /** Hide and destroy the ghost */
  hideGhost() {
    if (this.ghostSprite) {
      this.container.removeChild(this.ghostSprite);
      this.ghostSprite.destroy();
      this.ghostSprite = null;
      this.ghostDefName = null;
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async loadCroppedTexture(def: WorldItemDefInfo): Promise<Texture | null> {
    const key = `${def.iconTilesetUrl}:${def.iconTileX}:${def.iconTileY}:${def.iconTileW}:${def.iconTileH}`;
    if (this.textureCache.has(key)) return this.textureCache.get(key)!;

    try {
      // Load the full tileset as a PixiJS texture (cached by Assets)
      const baseTexture = await Assets.load(def.iconTilesetUrl!);

      // Create a sub-texture using a crop rectangle (PixiJS v8 API)
      const frame = new Rectangle(
        def.iconTileX!,
        def.iconTileY!,
        def.iconTileW!,
        def.iconTileH!,
      );
      const texture = new Texture({ source: baseTexture.source, frame });
      this.textureCache.set(key, texture);
      return texture;
    } catch (err) {
      console.warn("Failed to load item texture:", err);
      return null;
    }
  }

  private async loadSpriteDefVisual(
    def: WorldItemDefInfo,
  ): Promise<AnimatedSprite | null> {
    const sheetUrl = def.iconSpriteSheetUrl;
    const animation = def.iconSpriteAnimation;
    if (!sheetUrl || !animation) return null;

    try {
      let sheet = this.spriteSheetCache.get(sheetUrl);
      if (!sheet) {
        sheet = await loadSpriteSheet(sheetUrl);
        this.spriteSheetCache.set(sheetUrl, sheet);
      }
      const frames = sheet.animations?.[animation];
      if (!frames || frames.length === 0) return null;

      const sprite = new AnimatedSprite(frames);
      sprite.anchor.set(0.5, 1.0);
      sprite.animationSpeed = def.iconSpriteAnimationSpeed ?? 0.12;
      sprite.scale.set(def.iconSpriteScale ?? 1);
      sprite.play();
      return sprite;
    } catch (err) {
      console.warn("Failed to load sprite-def icon for world item:", err);
      return null;
    }
  }

  private createFallbackVisual(def: WorldItemDefInfo): Graphics {
    const g = new Graphics();
    // Draw a small coloured square as fallback
    const color = RARITY_COLORS[def.rarity] ?? 0xffffff;
    g.roundRect(-8, -20, 16, 16, 3);
    g.fill({ color, alpha: 0.9 });
    g.stroke({ color: 0x000000, width: 1 });
    return g;
  }
}
