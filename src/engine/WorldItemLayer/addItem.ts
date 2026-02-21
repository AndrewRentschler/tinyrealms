/**
 * Add a single world item to the layer: create container, visual, glow, prompt, respawn label.
 * Returns the RenderedWorldItem entry to push onto the layer's rendered array.
 */
import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Sprite,
} from "pixi.js";
import type { AnimatedSprite } from "pixi.js";
import type {
  WorldItemLayerAddContext,
  WorldItemDefInfo,
  WorldItemInstance,
  RenderedWorldItem,
} from "./types.ts";
import { INTERACT_PROMPT_PREFIX } from "../../constants/keybindings.ts";
import {
  DEFAULT_ICON_HEIGHT,
  FONT_FAMILY,
  GLOW_ALPHA,
  GLOW_RADIUS,
  PICKED_UP_ALPHA_BUILD_MODE,
  PICKED_UP_ALPHA_PLAY_MODE,
  PROMPT_FILL_COLOR,
  PROMPT_FONT_SIZE,
  PROMPT_OFFSET_ABOVE_ITEM,
  PROMPT_STROKE_COLOR,
  PROMPT_STROKE_WIDTH,
  RARITY_COLORS,
  RESPAWN_LABEL_COLOR,
  RESPAWN_LABEL_FONT_SIZE,
  RESPAWN_LABEL_NAME,
  RESPAWN_LABEL_OFFSET_Y,
} from "./constants.ts";
import { loadCroppedTexture } from "./loadCroppedTexture.ts";
import { loadSpriteDefVisual } from "./loadSpriteDefVisual.ts";
import { createFallbackVisual } from "./createFallbackVisual.ts";

/**
 * Add one item: create container, visual, glow, prompt, (optional) respawn label.
 * Adds the item container to the layer and returns the RenderedWorldItem to push.
 */
export async function addItem(
  ctx: WorldItemLayerAddContext,
  item: WorldItemInstance,
  defInfo?: WorldItemDefInfo,
): Promise<RenderedWorldItem | undefined> {
  const def = defInfo ?? ctx.defCache.get(item.itemDefName);
  if (!def) {
    console.warn(`No item def for "${item.itemDefName}"`);
    return undefined;
  }

  const available = !item.pickedUpAt;

  const itemContainer = new Container();
  itemContainer.x = item.x;
  itemContainer.y = item.y;
  itemContainer.zIndex = Math.round(item.y);

  const itemH = def.iconTileH ?? def.iconSpriteFrameHeight ?? DEFAULT_ICON_HEIGHT;

  let visual: Sprite | AnimatedSprite | Graphics;
  if (def.iconSpriteSheetUrl && def.iconSpriteAnimation) {
    const spriteVisual = await loadSpriteDefVisual(def, ctx.spriteSheetCache);
    visual = spriteVisual ?? createFallbackVisual(def);
  } else if (def.iconTilesetUrl && def.iconTileW && def.iconTileH) {
    const texture = await loadCroppedTexture(def, ctx.textureCache);
    if (texture) {
      visual = new Sprite(texture);
      visual.anchor.set(0.5, 1.0);
    } else {
      visual = createFallbackVisual(def);
    }
  } else {
    visual = createFallbackVisual(def);
  }
  itemContainer.addChild(visual);

  const glowColor = RARITY_COLORS[def.rarity] ?? PROMPT_FILL_COLOR;
  const glow = new Graphics();
  glow.circle(0, -(itemH / 2), GLOW_RADIUS);
  glow.fill({ color: glowColor, alpha: GLOW_ALPHA });
  glow.visible = false;
  itemContainer.addChild(glow);

  const prompt = new Text({
    text: `${INTERACT_PROMPT_PREFIX}${def.displayName}`,
    style: new TextStyle({
      fontSize: PROMPT_FONT_SIZE,
      fill: PROMPT_FILL_COLOR,
      fontFamily: FONT_FAMILY,
      stroke: { color: PROMPT_STROKE_COLOR, width: PROMPT_STROKE_WIDTH },
    }),
  });
  prompt.anchor.set(0.5, 1);
  prompt.y = -(itemH + PROMPT_OFFSET_ABOVE_ITEM);
  prompt.visible = false;
  itemContainer.addChild(prompt);

  if (!available) {
    itemContainer.alpha = ctx.buildMode ? PICKED_UP_ALPHA_BUILD_MODE : PICKED_UP_ALPHA_PLAY_MODE;
    const respawnLabel = new Text({
      text: "respawning",
      style: new TextStyle({
        fontSize: RESPAWN_LABEL_FONT_SIZE,
        fill: RESPAWN_LABEL_COLOR,
        fontFamily: FONT_FAMILY,
        stroke: { color: PROMPT_STROKE_COLOR, width: PROMPT_STROKE_WIDTH },
      }),
    });
    respawnLabel.anchor.set(0.5, 0);
    respawnLabel.y = RESPAWN_LABEL_OFFSET_Y;
    respawnLabel.label = RESPAWN_LABEL_NAME;
    respawnLabel.visible = ctx.buildMode;
    itemContainer.addChild(respawnLabel);
  }

  ctx.container.addChild(itemContainer);

  return {
    id: item.id,
    defName: item.itemDefName,
    container: itemContainer,
    sprite: visual,
    glow,
    prompt,
    baseX: item.x,
    baseY: item.y,
    bobPhase: Math.random() * Math.PI * 2,
    available,
  };
}
