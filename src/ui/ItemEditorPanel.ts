/**
 * Item Editor — create and edit item definitions (weapons, armor, consumables,
 * key items, etc.) with stats, effects, rarity, and tags.
 *
 * All data is stored in the `itemDefs` table in Convex.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { Game } from "../engine/Game/index.ts";
import type { Id } from "../../convex/_generated/dataModel";
import type { VisibilityType } from "../types/visibility.ts";
import { TILESHEET_CONFIGS } from "../config/tilesheet-config.ts";
import { ITEM_PICKUP_SOUND_OPTIONS } from "../config/audio-config.ts";
import "./ItemEditor.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ITEM_TYPES = [
  "weapon", "armor", "accessory", "consumable", "material",
  "key", "currency", "quest", "misc",
] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const RARITIES = [
  "common", "uncommon", "rare", "epic", "legendary", "unique",
] as const;
type Rarity = (typeof RARITIES)[number];

const EQUIP_SLOTS = [
  "", "weapon", "head", "body", "legs", "feet", "accessory",
] as const;

interface ItemEffect {
  type: string;
  value?: number;
  duration?: number;
  description?: string;
}

interface ItemStats {
  atk?: number;
  def?: number;
  spd?: number;
  hp?: number;
  maxHp?: number;
}

interface ItemDef {
  _id?: string;
  name: string;
  displayName: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  iconUrl?: string;
  iconTilesetUrl?: string;
  iconTileX?: number;
  iconTileY?: number;
  iconTileW?: number;
  iconTileH?: number;
  iconSpriteDefName?: string;
  stats?: ItemStats;
  effects?: ItemEffect[];
  equipSlot?: string;
  levelRequirement?: number;
  stackable: boolean;
  maxStack?: number;
  value: number;
  isUnique?: boolean;
  tags?: string[];
  lore?: string;
  consumeHpDelta?: number;
  pickupSoundUrl?: string;
  visibilityType?: VisibilityType;
}

interface SpriteIconDef {
  name: string;
  defaultAnimation: string;
  spriteSheetUrl: string;
  animationSpeed: number;
  scale: number;
}

interface SpriteIconFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpriteIconAnimationData {
  image: HTMLImageElement;
  frames: SpriteIconFrame[];
  fps: number;
  scale: number;
}

function visibilityLabel(v?: VisibilityType): string {
  const type = v ?? "system";
  if (type === "private") return "private";
  if (type === "public") return "public";
  return "system";
}

// Tileset info — shared with MapEditorPanel
interface TilesetInfo {
  name: string;
  url: string;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imageHeight: number;
}

const TILESETS: TilesetInfo[] = TILESHEET_CONFIGS;

const RARITY_ICONS: Record<string, string> = {
  common: "\u26AA",    // ⚪
  uncommon: "\uD83D\uDFE2",  // 🟢
  rare: "\uD83D\uDD35",      // 🔵
  epic: "\uD83D\uDFE3",      // 🟣
  legendary: "\uD83D\uDFE0", // 🟠
  unique: "\u2B50",           // ⭐
};

const TYPE_ICONS: Record<string, string> = {
  weapon: "\u2694\uFE0F",       // ⚔️
  armor: "\uD83D\uDEE1\uFE0F", // 🛡️
  accessory: "\uD83D\uDC8D",   // 💍
  consumable: "\uD83E\uDDEA",  // 🧪
  material: "\uD83E\uDDF1",    // 🧱
  key: "\uD83D\uDD11",         // 🔑
  currency: "\uD83D\uDCB0",    // 💰
  quest: "\uD83D\uDCDC",       // 📜
  misc: "\uD83D\uDCE6",        // 📦
};

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export class ItemEditorPanel {
  readonly el: HTMLElement;
  private game: Game | null = null;

  // Data
  private allItems: ItemDef[] = [];
  private filteredItems: ItemDef[] = [];
  private objectSpriteIconDefs: SpriteIconDef[] = [];
  private objectSpriteIconDefsByName = new Map<string, SpriteIconDef>();
  private spriteIconAnimationCache = new Map<string, Promise<SpriteIconAnimationData | null>>();
  private selected: ItemDef | null = null;
  private currentItem: ItemDef | null = null;

  // DOM — sidebar
  private listEl!: HTMLElement;
  private searchInput!: HTMLInputElement;

  // DOM — main
  private mainEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private headerIcon!: HTMLElement;
  private headerName!: HTMLElement;
  private headerMeta!: HTMLElement;
  private bodyEl!: HTMLElement;
  private statusEl!: HTMLElement;

  // Form inputs
  private nameInput!: HTMLInputElement;
  private displayNameInput!: HTMLInputElement;
  private descArea!: HTMLTextAreaElement;
  private typeSelect!: HTMLSelectElement;
  private raritySelect!: HTMLSelectElement;
  private visibilitySelect!: HTMLSelectElement;
  private iconUrlInput!: HTMLInputElement;
  private iconSpriteSelect!: HTMLSelectElement;
  private pickupSoundUrlInput!: HTMLInputElement;
  private equipSlotSelect!: HTMLSelectElement;
  private levelReqInput!: HTMLInputElement;
  private stackableCheck!: HTMLInputElement;
  private maxStackInput!: HTMLInputElement;
  private valueInput!: HTMLInputElement;
  private consumeHpDeltaInput!: HTMLInputElement;
  private uniqueCheck!: HTMLInputElement;
  private loreArea!: HTMLTextAreaElement;
  private statInputs: Record<string, HTMLInputElement> = {};

  // Dynamic lists
  private effectsList!: HTMLElement;
  private effectsAddRow!: HTMLElement;
  private tagsList!: HTMLElement;
  private tagsAddRow!: HTMLElement;

  // Tile picker
  private tilePickerSection!: HTMLElement;
  private tilesetSelect!: HTMLSelectElement;
  private tilePickerCanvas!: HTMLCanvasElement;
  private tilePickerScroll!: HTMLElement;
  private tilePreview!: HTMLCanvasElement;
  private tilePreviewLabel!: HTMLElement;
  private tilePickerGrid = true;
  private activeTileset: TilesetInfo = TILESETS[0];
  private tilesetImageCache: Map<string, HTMLImageElement> = new Map();
  private failedTilesetUrls: Set<string> = new Set();
  private tilesetImage: HTMLImageElement | null = null;
  // Drag selection state
  private tsDragStart: { col: number; row: number } | null = null;
  private tsDragCurrent: { col: number; row: number } | null = null;
  private tsDragging = false;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "item-editor";
    this.el.style.display = "none";

    this.el.appendChild(this.buildSidebar());
    this.el.appendChild(this.buildMain());
  }

  // =========================================================================
  // Public API
  // =========================================================================

  setGame(game: Game) { this.game = game; }

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
    if (visible) this.loadData();
  }

  show() { this.toggle(true); }
  hide() { this.toggle(false); }
  destroy() { this.el.remove(); }

  // =========================================================================
  // BUILD: Sidebar
  // =========================================================================

  private buildSidebar(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "item-editor-sidebar";

    const title = document.createElement("h3");
    title.className = "item-editor-title";
    title.textContent = "Item Editor";
    sidebar.appendChild(title);

    const bar = document.createElement("div");
    bar.className = "item-editor-actions-bar";

    this.searchInput = document.createElement("input");
    this.searchInput.className = "item-editor-search";
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search items\u2026";
    this.searchInput.addEventListener("input", () => this.applyFilter());

    const newBtn = document.createElement("button");
    newBtn.className = "item-editor-btn accent small";
    newBtn.textContent = "+ New";
    newBtn.addEventListener("click", () => this.createNew());

    bar.append(this.searchInput, newBtn);
    sidebar.appendChild(bar);

    this.listEl = document.createElement("div");
    this.listEl.className = "item-editor-list";
    sidebar.appendChild(this.listEl);

    return sidebar;
  }

  // =========================================================================
  // BUILD: Main area
  // =========================================================================

  private buildMain(): HTMLElement {
    this.mainEl = document.createElement("div");
    this.mainEl.className = "item-editor-main";

    // Header
    this.headerEl = document.createElement("div");
    this.headerEl.className = "item-editor-header";
    this.headerEl.style.display = "none";

    this.headerIcon = document.createElement("div");
    this.headerIcon.className = "item-editor-header-icon";

    const headerInfo = document.createElement("div");
    headerInfo.className = "item-editor-header-info";
    this.headerName = document.createElement("div");
    this.headerName.className = "item-editor-header-name";
    this.headerMeta = document.createElement("div");
    this.headerMeta.className = "item-editor-header-meta";
    headerInfo.append(this.headerName, this.headerMeta);

    const actions = document.createElement("div");
    actions.className = "item-editor-header-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "item-editor-btn accent";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => this.save());

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "item-editor-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => this.deleteItem());

    this.statusEl = document.createElement("span");
    this.statusEl.className = "item-editor-status";

    actions.append(this.statusEl, saveBtn, deleteBtn);
    this.headerEl.append(this.headerIcon, headerInfo, actions);
    this.mainEl.appendChild(this.headerEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "item-editor-body";
    this.mainEl.appendChild(this.bodyEl);

    this.showEmptyState();
    return this.mainEl;
  }

  private showEmptyState() {
    this.headerEl.style.display = "none";
    this.bodyEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "item-editor-empty-state";
    empty.innerHTML = `<div class="item-editor-empty-icon">\u2694\uFE0F</div>
      <div>Select an item or create a new one</div>
      <div style="font-size:12px;color:var(--text-muted)">Items define weapons, armor, consumables, key items, and more.<br>Use the "+ New" button to get started.</div>`;
    this.bodyEl.appendChild(empty);
  }

  // =========================================================================
  // BUILD: Form
  // =========================================================================

  private buildForm() {
    this.bodyEl.innerHTML = "";

    const leftCol = document.createElement("div");
    leftCol.className = "item-editor-col";
    const rightCol = document.createElement("div");
    rightCol.className = "item-editor-col";

    // ---- Left: Identity + Icon Picker + Description + Lore ----

    const identitySec = this.makeSection("Identity");
    this.nameInput = this.addTextField(identitySec, "Name (unique slug)", "e.g. iron-sword");
    this.displayNameInput = this.addTextField(identitySec, "Display Name", "e.g. Iron Sword");
    this.iconUrlInput = this.addTextField(identitySec, "Icon URL (or pick from tileset below)", "/assets/icons/iron-sword.png");
    this.iconSpriteSelect = this.addSelect(identitySec, "Animated Icon (Object Sprite)", [
      { value: "", label: "None (use tileset/icon URL)" },
    ]);
    const iconSpriteHint = document.createElement("div");
    iconSpriteHint.style.cssText = "font-size:11px;color:var(--text-muted);";
    iconSpriteHint.textContent = "Uses non-toggle object sprites only (for example animated mushrooms).";
    identitySec.appendChild(iconSpriteHint);
    this.pickupSoundUrlInput = this.addTextField(identitySec, "Pickup SFX URL", "/assets/audio/take-item.mp3");
    this.pickupSoundUrlInput.setAttribute("list", "item-pickup-sfx-options");
    const pickupSfxList = document.createElement("datalist");
    pickupSfxList.id = "item-pickup-sfx-options";
    for (const url of ITEM_PICKUP_SOUND_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = url;
      pickupSfxList.appendChild(opt);
    }
    identitySec.appendChild(pickupSfxList);

    const typeRow = document.createElement("div");
    typeRow.className = "item-editor-field-row";
    this.typeSelect = this.addSelect(typeRow, "Type", ITEM_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })));
    this.raritySelect = this.addSelect(typeRow, "Rarity", RARITIES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) })));
    identitySec.appendChild(typeRow);

    const visibilityRow = document.createElement("div");
    visibilityRow.className = "item-editor-field-row";
    this.visibilitySelect = this.addSelect(visibilityRow, "Visibility", this.getVisibilityOptions());
    identitySec.appendChild(visibilityRow);

    const tagLabel = document.createElement("label");
    tagLabel.style.cssText = "font-size:11px;color:var(--text-muted);";
    tagLabel.textContent = "Tags";
    this.tagsList = document.createElement("div");
    this.tagsList.className = "item-editor-tags";
    this.tagsAddRow = document.createElement("div");
    this.tagsAddRow.className = "item-editor-add-row";
    identitySec.append(tagLabel, this.tagsList, this.tagsAddRow);
    leftCol.appendChild(identitySec);

    // ---- Icon Tile Picker ----
    this.tilePickerSection = this.makeSection("Icon from Tileset");
    this.buildTilePicker(this.tilePickerSection);
    leftCol.appendChild(this.tilePickerSection);

    const descSec = this.makeSection("Description");
    this.descArea = this.addTextArea(descSec, "Description", "Short tooltip description\u2026", 3);
    this.loreArea = this.addTextArea(descSec, "Lore", "Extended lore text\u2026", 4);
    leftCol.appendChild(descSec);

    // ---- Right: Properties + Stats + Effects ----

    const propsSec = this.makeSection("Properties");
    const propRow1 = document.createElement("div");
    propRow1.className = "item-editor-field-row";
    this.equipSlotSelect = this.addSelect(propRow1, "Equip Slot", EQUIP_SLOTS.map((s) => ({ value: s, label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "None" })));
    this.levelReqInput = this.addNumberField(propRow1, "Level Req.", "0");
    propsSec.appendChild(propRow1);

    const propRow2 = document.createElement("div");
    propRow2.className = "item-editor-field-row";
    this.valueInput = this.addNumberField(propRow2, "Value (gold)", "0");
    this.maxStackInput = this.addNumberField(propRow2, "Max Stack", "99");
    propsSec.appendChild(propRow2);

    const propRow3 = document.createElement("div");
    propRow3.className = "item-editor-field-row";
    this.consumeHpDeltaInput = this.addNumberField(propRow3, "Consume HP Δ", "0");
    this.consumeHpDeltaInput.placeholder = "e.g. 25 heal, -10 poison";
    propsSec.appendChild(propRow3);

    const checks = document.createElement("div");
    checks.style.cssText = "display:flex;gap:16px;margin-top:4px;";
    this.stackableCheck = this.addCheckbox(checks, "Stackable");
    this.uniqueCheck = this.addCheckbox(checks, "Unique (one-of-a-kind)");
    propsSec.appendChild(checks);
    rightCol.appendChild(propsSec);

    const statsSec = this.makeSection("Stats Bonuses");
    const statsGrid = document.createElement("div");
    statsGrid.className = "item-editor-stats-grid";
    for (const key of ["atk", "def", "spd", "hp", "maxHp"] as const) {
      const labels: Record<string, string> = { atk: "ATK", def: "DEF", spd: "SPD", hp: "HP", maxHp: "Max HP" };
      this.statInputs[key] = this.addNumberField(statsGrid, labels[key], "0");
    }
    statsSec.appendChild(statsGrid);
    rightCol.appendChild(statsSec);

    const effectsSec = this.makeSection("Effects");
    this.effectsList = document.createElement("div");
    this.effectsList.className = "item-editor-effects-list";
    this.effectsAddRow = document.createElement("div");
    this.effectsAddRow.className = "item-editor-add-row";
    effectsSec.append(this.effectsList, this.effectsAddRow);
    rightCol.appendChild(effectsSec);

    this.bodyEl.append(leftCol, rightCol);

    this.buildEffectsAddRow();
    this.buildTagsAddRow();
  }

  // =========================================================================
  // Helpers: form builders
  // =========================================================================

  private makeSection(title: string): HTMLElement {
    const sec = document.createElement("div");
    sec.className = "item-editor-section";
    const h = document.createElement("h4");
    h.className = "item-editor-section-title";
    h.textContent = title;
    sec.appendChild(h);
    return sec;
  }

  private addTextField(parent: HTMLElement, label: string, placeholder: string): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "item-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    field.append(lbl, input);
    parent.appendChild(field);
    return input;
  }

  private addTextArea(parent: HTMLElement, label: string, placeholder: string, rows: number): HTMLTextAreaElement {
    const field = document.createElement("div");
    field.className = "item-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const ta = document.createElement("textarea");
    ta.placeholder = placeholder;
    ta.rows = rows;
    field.append(lbl, ta);
    parent.appendChild(field);
    return ta;
  }

  private addNumberField(parent: HTMLElement, label: string, defaultVal: string): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "item-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.value = defaultVal;
    field.append(lbl, input);
    parent.appendChild(field);
    return input;
  }

  private addSelect(parent: HTMLElement, label: string, options: { value: string; label: string }[]): HTMLSelectElement {
    const field = document.createElement("div");
    field.className = "item-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const sel = document.createElement("select");
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    field.append(lbl, sel);
    parent.appendChild(field);
    return sel;
  }

  private addCheckbox(parent: HTMLElement, label: string): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.className = "item-editor-checkbox";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `item-cb-${label.replace(/\s+/g, "-").toLowerCase()}`;
    const lbl = document.createElement("label");
    lbl.htmlFor = cb.id;
    lbl.textContent = label;
    wrap.append(cb, lbl);
    parent.appendChild(wrap);
    return cb;
  }

  // =========================================================================
  // Tile Picker
  // =========================================================================

  private buildTilePicker(parent: HTMLElement) {
    // Row: tileset dropdown + grid toggle + clear button
    const topRow = document.createElement("div");
    topRow.className = "item-editor-tilepicker-row";

    this.tilesetSelect = document.createElement("select");
    this.tilesetSelect.className = "item-editor-tilepicker-select";
    for (const ts of TILESETS) {
      const opt = document.createElement("option");
      opt.value = ts.url;
      opt.textContent = `${ts.name} (${ts.tileWidth}px)`;
      this.tilesetSelect.appendChild(opt);
    }
    this.tilesetSelect.addEventListener("change", () => {
      const ts = TILESETS.find((t) => t.url === this.tilesetSelect.value);
      if (ts) {
        this.activeTileset = ts;
        this.loadTilesetImage(ts);
      }
    });

    const gridBtn = document.createElement("button");
    gridBtn.className = "item-editor-btn small";
    gridBtn.textContent = "Grid";
    gridBtn.title = "Toggle grid overlay";
    gridBtn.addEventListener("click", () => {
      this.tilePickerGrid = !this.tilePickerGrid;
      gridBtn.classList.toggle("active", this.tilePickerGrid);
      this.drawTileset();
    });
    gridBtn.classList.toggle("active", this.tilePickerGrid);

    const clearBtn = document.createElement("button");
    clearBtn.className = "item-editor-btn small danger";
    clearBtn.textContent = "Clear";
    clearBtn.title = "Remove tile icon";
    clearBtn.addEventListener("click", () => {
      if (!this.currentItem) return;
      this.currentItem.iconTilesetUrl = undefined;
      this.currentItem.iconTileX = undefined;
      this.currentItem.iconTileY = undefined;
      this.currentItem.iconTileW = undefined;
      this.currentItem.iconTileH = undefined;
      this.drawTileset();
      this.renderTilePreview();
    });

    topRow.append(this.tilesetSelect, gridBtn, clearBtn);
    parent.appendChild(topRow);

    // Preview row: selected tile preview + label
    const previewRow = document.createElement("div");
    previewRow.className = "item-editor-tilepicker-preview-row";

    this.tilePreview = document.createElement("canvas");
    this.tilePreview.className = "item-editor-tilepicker-preview";
    this.tilePreview.width = 48;
    this.tilePreview.height = 48;

    this.tilePreviewLabel = document.createElement("span");
    this.tilePreviewLabel.className = "item-editor-tilepicker-preview-label";
    this.tilePreviewLabel.textContent = "No tile selected";

    previewRow.append(this.tilePreview, this.tilePreviewLabel);
    parent.appendChild(previewRow);

    // Scrollable tileset view
    this.tilePickerScroll = document.createElement("div");
    this.tilePickerScroll.className = "item-editor-tilepicker-scroll";

    this.tilePickerCanvas = document.createElement("canvas");
    this.tilePickerCanvas.className = "item-editor-tilepicker-canvas";
    this.tilePickerCanvas.addEventListener("mousedown", (e) => this.onTsMouseDown(e));
    this.tilePickerCanvas.addEventListener("mousemove", (e) => this.onTsMouseMove(e));
    this.tilePickerCanvas.addEventListener("mouseup", (e) => this.onTsMouseUp(e));
    this.tilePickerCanvas.addEventListener("mouseleave", () => {
      if (!this.tsDragging) this.drawTileset();
    });
    this.tilePickerScroll.appendChild(this.tilePickerCanvas);
    parent.appendChild(this.tilePickerScroll);

    // Load initial tileset
    this.loadTilesetImage(this.activeTileset);
  }

  private async loadTilesetImage(ts: TilesetInfo) {
    this.activeTileset = ts;
    const cached = this.tilesetImageCache.get(ts.url);
    if (cached) {
      this.tilesetImage = cached;
      this.failedTilesetUrls.delete(ts.url);
      this.drawTileset();
      return;
    }
    const img = new Image();
    img.src = ts.url;
    try {
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
      this.tilesetImageCache.set(ts.url, img);
      this.tilesetImage = img;
      this.failedTilesetUrls.delete(ts.url);
      // Use actual image dimensions
      if (img.naturalWidth) this.activeTileset.imageWidth = img.naturalWidth;
      if (img.naturalHeight) this.activeTileset.imageHeight = img.naturalHeight;
      this.drawTileset();
    } catch {
      this.failedTilesetUrls.add(ts.url);
      this.tilesetImage = null;
      const ctx = this.tilePickerCanvas?.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, this.tilePickerCanvas.width, this.tilePickerCanvas.height);
      if (this.tilePreviewLabel) {
        this.tilePreviewLabel.textContent = `Tileset missing: ${ts.name}`;
      }
      console.warn("Failed to load tileset image:", ts.url);

      // Auto-fallback so sprite-icon item editing doesn't keep noisy missing-tileset errors.
      const fallback = TILESETS.find((candidate) =>
        candidate.url !== ts.url && !this.failedTilesetUrls.has(candidate.url)
      );
      if (fallback) {
        if (this.tilesetSelect) this.tilesetSelect.value = fallback.url;
        this.activeTileset = fallback;
        console.warn(`Falling back to available tileset: ${fallback.url}`);
        this.loadTilesetImage(fallback);
      }
    }
  }

  /** Scale at which tileset tiles are drawn in the picker */
  private get tileDisplayScale(): number {
    return Math.max(1, Math.floor(32 / this.activeTileset.tileWidth));
  }

  private drawTileset() {
    const img = this.tilesetImage;
    const ts = this.activeTileset;
    if (!img) return;

    const scale = this.tileDisplayScale;
    const w = ts.imageWidth * scale;
    const h = ts.imageHeight * scale;
    this.tilePickerCanvas.width = w;
    this.tilePickerCanvas.height = h;
    this.tilePickerCanvas.style.width = `${w}px`;
    this.tilePickerCanvas.style.height = `${h}px`;

    const ctx = this.tilePickerCanvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Grid overlay
    if (this.tilePickerGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      const tw = ts.tileWidth * scale;
      const th = ts.tileHeight * scale;
      for (let x = 0; x <= w; x += tw) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += th) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
      }
    }

    // Highlight selected region (saved on the item)
    const item = this.currentItem;
    if (item?.iconTilesetUrl === ts.url && item.iconTileX != null && item.iconTileY != null) {
      const sx = item.iconTileX * scale;
      const sy = item.iconTileY * scale;
      const sw = (item.iconTileW ?? ts.tileWidth) * scale;
      const sh = (item.iconTileH ?? ts.tileHeight) * scale;
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.fillStyle = "rgba(0, 255, 136, 0.15)";
      ctx.fillRect(sx, sy, sw, sh);
    }

    // Highlight drag selection (in progress)
    if (this.tsDragging && this.tsDragStart && this.tsDragCurrent) {
      const region = this.getDragRegion();
      const dx = region.col * ts.tileWidth * scale;
      const dy = region.row * ts.tileHeight * scale;
      const dw = region.w * ts.tileWidth * scale;
      const dh = region.h * ts.tileHeight * scale;
      ctx.strokeStyle = "rgba(255, 200, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
      ctx.fillStyle = "rgba(255, 200, 0, 0.12)";
      ctx.fillRect(dx, dy, dw, dh);
    }
  }

  /** Get the normalised rectangular region from drag start → current (top-left, w, h in tile units) */
  private getDragRegion(): { col: number; row: number; w: number; h: number } {
    const s = this.tsDragStart!;
    const c = this.tsDragCurrent!;
    const minCol = Math.min(s.col, c.col);
    const minRow = Math.min(s.row, c.row);
    const maxCol = Math.max(s.col, c.col);
    const maxRow = Math.max(s.row, c.row);
    return { col: minCol, row: minRow, w: maxCol - minCol + 1, h: maxRow - minRow + 1 };
  }

  /** Convert mouse event to tile col/row */
  private mouseToTile(e: MouseEvent): { col: number; row: number } {
    const ts = this.activeTileset;
    const scale = this.tileDisplayScale;
    const rect = this.tilePickerCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cols = Math.floor(ts.imageWidth / ts.tileWidth);
    const rows = Math.floor(ts.imageHeight / ts.tileHeight);
    return {
      col: Math.max(0, Math.min(cols - 1, Math.floor(mx / (ts.tileWidth * scale)))),
      row: Math.max(0, Math.min(rows - 1, Math.floor(my / (ts.tileHeight * scale)))),
    };
  }

  private onTsMouseDown(e: MouseEvent) {
    if (!this.currentItem || !this.tilesetImage) return;
    e.preventDefault();
    const tile = this.mouseToTile(e);
    this.tsDragStart = tile;
    this.tsDragCurrent = tile;
    this.tsDragging = true;
    this.drawTileset();
  }

  private onTsMouseMove(e: MouseEvent) {
    if (!this.tilesetImage) return;
    const tile = this.mouseToTile(e);

    if (this.tsDragging) {
      // Update drag selection
      this.tsDragCurrent = tile;
      this.drawTileset();
    } else {
      // Hover highlight (single tile)
      this.drawTileset();
      const ts = this.activeTileset;
      const scale = this.tileDisplayScale;
      const ctx = this.tilePickerCanvas.getContext("2d")!;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        tile.col * ts.tileWidth * scale + 1,
        tile.row * ts.tileHeight * scale + 1,
        ts.tileWidth * scale - 2,
        ts.tileHeight * scale - 2,
      );
    }
  }

  private onTsMouseUp(_e: MouseEvent) {
    if (!this.tsDragging || !this.currentItem || !this.tsDragStart || !this.tsDragCurrent) {
      this.tsDragging = false;
      return;
    }

    const ts = this.activeTileset;
    const region = this.getDragRegion();

    this.currentItem.iconTilesetUrl = ts.url;
    this.currentItem.iconTileX = region.col * ts.tileWidth;
    this.currentItem.iconTileY = region.row * ts.tileHeight;
    this.currentItem.iconTileW = region.w * ts.tileWidth;
    this.currentItem.iconTileH = region.h * ts.tileHeight;

    this.tsDragging = false;
    this.tsDragStart = null;
    this.tsDragCurrent = null;

    this.drawTileset();
    this.renderTilePreview();
    this.updateHeaderIcon();
  }

  private renderTilePreview() {
    const item = this.currentItem;
    const tw = item?.iconTileW ?? this.activeTileset.tileWidth;
    const th = item?.iconTileH ?? this.activeTileset.tileHeight;

    // Size preview canvas to fit the aspect ratio, max 64px on the larger side
    const maxSide = 64;
    const previewScale = Math.min(maxSide / tw, maxSide / th);
    // Use integer multiples for pixelated rendering
    const intScale = Math.max(1, Math.floor(previewScale));
    const pw = tw * intScale;
    const ph = th * intScale;
    this.tilePreview.width = pw;
    this.tilePreview.height = ph;
    this.tilePreview.style.width = `${pw}px`;
    this.tilePreview.style.height = `${ph}px`;

    const ctx = this.tilePreview.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, pw, ph);

    if (!item?.iconTilesetUrl || item.iconTileX == null || item.iconTileY == null) {
      this.tilePreviewLabel.textContent = "Click or drag to select tiles";
      return;
    }

    const img = this.tilesetImageCache.get(item.iconTilesetUrl);
    if (!img) {
      this.tilePreviewLabel.textContent = "Loading\u2026";
      return;
    }

    ctx.drawImage(img, item.iconTileX, item.iconTileY, tw, th, 0, 0, pw, ph);

    const tileW = this.activeTileset.tileWidth;
    const tileH = this.activeTileset.tileHeight;
    const tilesW = Math.round(tw / tileW);
    const tilesH = Math.round(th / tileH);
    const sizeLabel = tilesW === 1 && tilesH === 1
      ? `1 tile`
      : `${tilesW}\u00D7${tilesH} tiles`;
    this.tilePreviewLabel.textContent = `${sizeLabel} \u2022 ${tw}\u00D7${th}px`;

    // Sync to tileset dropdown if different
    if (this.tilesetSelect.value !== item.iconTilesetUrl) {
      const ts = TILESETS.find((t) => t.url === item.iconTilesetUrl);
      if (ts) {
        this.tilesetSelect.value = ts.url;
        this.activeTileset = ts;
        this.loadTilesetImage(ts);
      }
    }
  }

  /**
   * Draw a tile icon into a container element (for list items and headers).
   * Preserves aspect ratio and fits within `size` px.
   * Returns true if an icon was drawn, false if no tile data.
   */
  private drawTileIcon(container: HTMLElement, item: ItemDef, size: number): boolean {
    if (!item.iconTilesetUrl || item.iconTileX == null || item.iconTileY == null) return false;
    const img = this.tilesetImageCache.get(item.iconTilesetUrl);
    if (!img) {
      // Trigger load for future renders
      const ts = TILESETS.find((t) => t.url === item.iconTilesetUrl);
      if (ts) this.loadTilesetImage(ts);
      return false;
    }
    const tw = item.iconTileW ?? 24;
    const th = item.iconTileH ?? 24;
    // Integer scale that fits within `size`
    const intScale = Math.max(1, Math.floor(Math.min(size / tw, size / th)));
    const cw = tw * intScale;
    const ch = th * intScale;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.imageRendering = "pixelated";
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, item.iconTileX, item.iconTileY, tw, th, 0, 0, cw, ch);
    container.appendChild(canvas);
    return true;
  }

  private drawSpriteIcon(container: HTMLElement, item: ItemDef, size: number): boolean {
    if (!item.iconSpriteDefName) return false;
    const def = this.objectSpriteIconDefsByName.get(item.iconSpriteDefName);
    if (!def) return false;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.imageRendering = "pixelated";
    container.appendChild(canvas);

    const cacheKey = `${def.spriteSheetUrl}::${def.defaultAnimation}`;
    let promise = this.spriteIconAnimationCache.get(cacheKey);
    if (!promise) {
      promise = this.loadSpriteIconAnimation(def);
      this.spriteIconAnimationCache.set(cacheKey, promise);
    }

    promise.then((anim) => {
      if (!anim || !canvas.isConnected) return;
      this.startSpriteIconAnimation(canvas, anim);
    }).catch(() => {
      // Keep fallback icon if loading fails.
    });

    return true;
  }

  private async loadSpriteIconAnimation(def: SpriteIconDef): Promise<SpriteIconAnimationData | null> {
    try {
      const response = await fetch(def.spriteSheetUrl);
      if (!response.ok) return null;
      const data = await response.json();
      const animationNames: unknown = data?.animations?.[def.defaultAnimation];
      if (!Array.isArray(animationNames) || animationNames.length === 0) return null;
      const framesObj: Record<string, any> | undefined = data?.frames;
      if (!framesObj) return null;

      const frames: SpriteIconFrame[] = [];
      for (const frameName of animationNames) {
        if (typeof frameName !== "string") continue;
        const frameDef = framesObj[frameName]?.frame;
        if (
          !frameDef ||
          typeof frameDef.x !== "number" ||
          typeof frameDef.y !== "number" ||
          typeof frameDef.w !== "number" ||
          typeof frameDef.h !== "number"
        ) {
          continue;
        }
        frames.push({
          x: frameDef.x,
          y: frameDef.y,
          w: frameDef.w,
          h: frameDef.h,
        });
      }
      if (frames.length === 0) return null;

      const imagePath = this.resolveSpriteImagePath(def.spriteSheetUrl, String(data?.meta?.image ?? ""));
      if (!imagePath) return null;
      const image = await this.loadImage(imagePath);
      const fps = Math.max(1, Math.round((def.animationSpeed || 0.12) * 60));
      return {
        image,
        frames,
        fps,
        scale: def.scale || 1,
      };
    } catch {
      return null;
    }
  }

  private resolveSpriteImagePath(jsonPath: string, imageName: string): string | null {
    if (!imageName) return null;
    if (imageName.startsWith("/") || /^https?:\/\//.test(imageName)) return imageName;
    const base = jsonPath.substring(0, jsonPath.lastIndexOf("/") + 1);
    return `${base}${imageName}`;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  }

  private startSpriteIconAnimation(canvas: HTMLCanvasElement, anim: SpriteIconAnimationData) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameIndex = 0;
    let lastFrameAt = performance.now();
    const frameMs = 1000 / Math.max(1, anim.fps);

    const render = (now: number) => {
      if (!canvas.isConnected) return;

      if (now - lastFrameAt >= frameMs) {
        const steps = Math.max(1, Math.floor((now - lastFrameAt) / frameMs));
        frameIndex = (frameIndex + steps) % anim.frames.length;
        lastFrameAt += steps * frameMs;
      }

      const f = anim.frames[frameIndex];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const scaledW = f.w * anim.scale;
      const scaledH = f.h * anim.scale;
      const fitScale = Math.min(canvas.width / scaledW, canvas.height / scaledH);
      const drawScale = Math.max(1, Math.floor(fitScale));
      const dw = scaledW * drawScale;
      const dh = scaledH * drawScale;
      const dx = Math.floor((canvas.width - dw) / 2);
      const dy = Math.floor((canvas.height - dh) / 2);

      ctx.drawImage(anim.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  private getFallbackItemIcon(item: ItemDef): string {
    if (item.iconSpriteDefName) return "🎞️";
    return RARITY_ICONS[item.rarity] ?? "⚪";
  }

  private updateHeaderIcon() {
    if (!this.currentItem) return;
    this.headerIcon.innerHTML = "";
    if (!this.drawSpriteIcon(this.headerIcon, this.currentItem, 48) && !this.drawTileIcon(this.headerIcon, this.currentItem, 48)) {
      this.headerIcon.textContent = `${TYPE_ICONS[this.currentItem.type] ?? ""} ${this.getFallbackItemIcon(this.currentItem)}`;
    }
  }

  // =========================================================================
  // Dynamic lists: Effects
  // =========================================================================

  private buildEffectsAddRow() {
    this.effectsAddRow.innerHTML = "";
    const typeIn = document.createElement("input");
    typeIn.type = "text";
    typeIn.placeholder = "Effect type\u2026";
    typeIn.style.flex = "1";
    const valueIn = document.createElement("input");
    valueIn.type = "number";
    valueIn.placeholder = "Val";
    valueIn.style.width = "50px";
    const descIn = document.createElement("input");
    descIn.type = "text";
    descIn.placeholder = "Description\u2026";
    descIn.style.flex = "1";
    const addBtn = document.createElement("button");
    addBtn.className = "item-editor-btn small";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const type = typeIn.value.trim();
      if (!type || !this.currentItem) return;
      if (!this.currentItem.effects) this.currentItem.effects = [];
      this.currentItem.effects.push({
        type,
        value: parseFloat(valueIn.value) || undefined,
        description: descIn.value.trim() || undefined,
      });
      typeIn.value = "";
      valueIn.value = "";
      descIn.value = "";
      this.renderEffects();
    });
    this.effectsAddRow.append(typeIn, valueIn, descIn, addBtn);
  }

  private renderEffects() {
    this.effectsList.innerHTML = "";
    const effects = this.currentItem?.effects ?? [];
    if (effects.length === 0) {
      const empty = document.createElement("span");
      empty.className = "item-editor-empty";
      empty.textContent = "No effects";
      this.effectsList.appendChild(empty);
      return;
    }
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      const row = document.createElement("div");
      row.className = "item-editor-effect-row";
      row.innerHTML = `<span class="item-editor-effect-type">${e.type}</span>`;
      if (e.value != null) row.innerHTML += `<span class="item-editor-effect-value">${e.value}</span>`;
      if (e.description) row.innerHTML += `<span class="item-editor-effect-desc">${e.description}</span>`;
      const rm = document.createElement("button");
      rm.className = "item-editor-effect-remove";
      rm.textContent = "\u00D7";
      const idx = i;
      rm.addEventListener("click", () => {
        if (!this.currentItem?.effects) return;
        this.currentItem.effects.splice(idx, 1);
        this.renderEffects();
      });
      row.appendChild(rm);
      this.effectsList.appendChild(row);
    }
  }

  // =========================================================================
  // Dynamic lists: Tags
  // =========================================================================

  private buildTagsAddRow() {
    this.tagsAddRow.innerHTML = "";
    const tagIn = document.createElement("input");
    tagIn.type = "text";
    tagIn.placeholder = "Add tag\u2026";
    tagIn.style.flex = "1";
    const addBtn = document.createElement("button");
    addBtn.className = "item-editor-btn small";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const tag = tagIn.value.trim();
      if (!tag || !this.currentItem) return;
      if (!this.currentItem.tags) this.currentItem.tags = [];
      if (this.currentItem.tags.includes(tag)) return;
      this.currentItem.tags.push(tag);
      tagIn.value = "";
      this.renderTags();
    });
    tagIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
    this.tagsAddRow.append(tagIn, addBtn);
  }

  private renderTags() {
    this.tagsList.innerHTML = "";
    for (const t of this.currentItem?.tags ?? []) {
      const el = document.createElement("span");
      el.className = "item-editor-tag";
      el.textContent = t;
      const rm = document.createElement("button");
      rm.className = "item-editor-tag-remove";
      rm.textContent = "\u00D7";
      rm.addEventListener("click", () => {
        if (!this.currentItem?.tags) return;
        this.currentItem.tags = this.currentItem.tags.filter((x) => x !== t);
        this.renderTags();
      });
      el.appendChild(rm);
      this.tagsList.appendChild(el);
    }
  }

  // =========================================================================
  // DATA: Load item definitions from Convex
  // =========================================================================

  private async loadData() {
    const convex = getConvexClient();
    try {
      const [items, spriteDefs] = await Promise.all([
        convex.query(api.items.list, {}),
        convex.query(api.spriteDefinitions.list, {}),
      ]);
      this.allItems = items as ItemDef[];
      this.objectSpriteIconDefs = (spriteDefs as any[])
        .filter((d) => d.category === "object" && !d.toggleable && !d.isDoor)
        .map((d) => ({
          name: d.name as string,
          defaultAnimation: d.defaultAnimation as string,
          spriteSheetUrl: d.spriteSheetUrl as string,
          animationSpeed: typeof d.animationSpeed === "number" ? d.animationSpeed : 0.12,
          scale: typeof d.scale === "number" ? d.scale : 1,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.objectSpriteIconDefsByName = new Map(this.objectSpriteIconDefs.map((d) => [d.name, d]));
      this.applyFilter();
      if (this.currentItem) this.refreshIconSpriteOptions();
    } catch (err) {
      console.error("Failed to load items:", err);
    }
  }

  private applyFilter() {
    const q = this.searchInput.value.trim().toLowerCase();
    this.filteredItems = q
      ? this.allItems.filter((i) =>
          i.name.toLowerCase().includes(q) ||
          i.displayName.toLowerCase().includes(q) ||
          i.type.includes(q) ||
          i.rarity.includes(q)
        )
      : [...this.allItems];
    // Sort by type then name
    this.filteredItems.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    this.renderList();
  }

  // =========================================================================
  // RENDER: Item list in sidebar
  // =========================================================================

  private renderList() {
    this.listEl.innerHTML = "";

    if (this.filteredItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "item-editor-empty";
      empty.textContent = this.allItems.length === 0
        ? "No items yet. Click \"+ New\" to create one."
        : "No items match your search.";
      this.listEl.appendChild(empty);
      return;
    }

    // Group by type
    const byType = new Map<string, ItemDef[]>();
    for (const item of this.filteredItems) {
      const list = byType.get(item.type) ?? [];
      list.push(item);
      byType.set(item.type, list);
    }

    for (const [type, items] of byType) {
      const label = document.createElement("div");
      label.className = "item-editor-section-label";
      label.textContent = `${TYPE_ICONS[type] ?? ""} ${type.toUpperCase()} (${items.length})`;
      this.listEl.appendChild(label);

      for (const item of items) {
        const isSelected = this.selected?.name === item.name;
        const el = document.createElement("button");
        el.className = `item-editor-list-item ${isSelected ? "active" : ""}`;

        const icon = document.createElement("div");
        icon.className = "item-editor-list-icon";
        if (!this.drawSpriteIcon(icon, item, 24) && !this.drawTileIcon(icon, item, 24)) {
          icon.textContent = this.getFallbackItemIcon(item);
        }

        const info = document.createElement("div");
        info.className = "item-editor-list-info";

        const nameEl = document.createElement("div");
        nameEl.className = `item-editor-list-name rarity-${item.rarity}`;
        nameEl.textContent = item.displayName;

        const subEl = document.createElement("div");
        subEl.className = "item-editor-list-sub";
        subEl.textContent = item.name;
        const visEl = document.createElement("span");
        visEl.className = `item-editor-vis-tag ${visibilityLabel(item.visibilityType)}`;
        visEl.textContent = visibilityLabel(item.visibilityType);
        subEl.appendChild(visEl);

        info.append(nameEl, subEl);
        el.append(icon, info);
        el.addEventListener("click", () => this.selectItem(item));
        this.listEl.appendChild(el);
      }
    }
  }

  // =========================================================================
  // SELECT / CREATE
  // =========================================================================

  private selectItem(item: ItemDef) {
    this.selected = item;
    this.currentItem = {
      ...item,
      stats: item.stats ? { ...item.stats } : undefined,
      effects: item.effects ? [...item.effects] : [],
      tags: item.tags ? [...item.tags] : [],
    };

    this.headerEl.style.display = "";
    this.headerIcon.innerHTML = "";
    if (!this.drawSpriteIcon(this.headerIcon, this.currentItem!, 48) && !this.drawTileIcon(this.headerIcon, this.currentItem!, 48)) {
      this.headerIcon.textContent = `${TYPE_ICONS[item.type] ?? ""} ${this.getFallbackItemIcon(item)}`;
    }
    this.headerName.textContent = item.displayName;
    this.headerName.className = `item-editor-header-name rarity-${item.rarity}`;
    this.headerMeta.textContent = `${item.rarity} ${item.type} \u2022 ${item.name}`;

    this.buildForm();
    this.populateForm();
    this.renderList();
    this.statusEl.textContent = "";
  }

  private createNew() {
    const newItem: ItemDef = {
      name: "",
      displayName: "New Item",
      description: "",
      type: "misc",
      rarity: "common",
      stackable: true,
      value: 0,
      effects: [],
      tags: [],
    };
    this.selected = null;
    this.currentItem = newItem;

    this.headerEl.style.display = "";
    this.headerIcon.textContent = TYPE_ICONS["misc"] ?? "";
    this.headerName.textContent = "New Item";
    this.headerName.className = "item-editor-header-name";
    this.headerMeta.textContent = "Unsaved";

    this.buildForm();
    this.populateForm();
    this.renderList();
    this.statusEl.textContent = "";
    this.nameInput.focus();
  }

  // =========================================================================
  // POPULATE / COLLECT form
  // =========================================================================

  private populateForm() {
    const item = this.currentItem;
    if (!item) return;

    this.nameInput.value = item.name;
    this.displayNameInput.value = item.displayName;
    this.descArea.value = item.description;
    this.typeSelect.value = item.type;
    this.raritySelect.value = item.rarity;
    this.rebuildVisibilitySelect(item.visibilityType ?? (item._id ? "system" : "private"));
    this.iconUrlInput.value = item.iconUrl ?? "";
    this.refreshIconSpriteOptions();
    this.iconSpriteSelect.value = item.iconSpriteDefName ?? "";
    this.pickupSoundUrlInput.value = item.pickupSoundUrl ?? "";
    this.equipSlotSelect.value = item.equipSlot ?? "";
    this.levelReqInput.value = String(item.levelRequirement ?? 0);
    this.stackableCheck.checked = item.stackable;
    this.maxStackInput.value = String(item.maxStack ?? 99);
    this.valueInput.value = String(item.value);
    this.consumeHpDeltaInput.value = item.consumeHpDelta != null ? String(item.consumeHpDelta) : "";
    this.uniqueCheck.checked = item.isUnique ?? false;
    this.loreArea.value = item.lore ?? "";

    const stats = item.stats ?? {};
    for (const key of Object.keys(this.statInputs)) {
      this.statInputs[key].value = String((stats as Record<string, number>)[key] ?? 0);
    }

    this.renderEffects();
    this.renderTags();
    this.renderTilePreview();

    // If item has a tileset icon, switch to that tileset
    if (item.iconTilesetUrl) {
      const ts = TILESETS.find((t) => t.url === item.iconTilesetUrl);
      if (ts) {
        this.tilesetSelect.value = ts.url;
        this.activeTileset = ts;
        this.loadTilesetImage(ts);
      }
    }
    this.updateConsumableFieldState();
    this.typeSelect.addEventListener("change", () => this.updateConsumableFieldState());
  }

  private collectForm(): ItemDef | null {
    if (!this.currentItem) return null;
    const item = this.currentItem;

    item.name = this.nameInput.value.trim().toLowerCase().replace(/\s+/g, "-");
    item.displayName = this.displayNameInput.value.trim() || "Unnamed Item";
    item.description = this.descArea.value.trim();
    item.type = this.typeSelect.value as ItemType;
    item.rarity = this.raritySelect.value as Rarity;
    item.visibilityType = this.visibilitySelect.value as any;
    item.iconUrl = this.iconUrlInput.value.trim() || undefined;
    item.iconSpriteDefName = this.iconSpriteSelect.value || undefined;
    item.pickupSoundUrl = this.pickupSoundUrlInput.value.trim() || undefined;
    // iconTileset fields are set directly by the tile picker click handler
    item.equipSlot = this.equipSlotSelect.value || undefined;
    item.levelRequirement = parseInt(this.levelReqInput.value) || undefined;
    item.stackable = this.stackableCheck.checked;
    item.maxStack = parseInt(this.maxStackInput.value) || 99;
    item.value = parseInt(this.valueInput.value) || 0;
    const hpDeltaRaw = this.consumeHpDeltaInput.value.trim();
    item.consumeHpDelta =
      item.type === "consumable" && hpDeltaRaw !== ""
        ? (parseInt(hpDeltaRaw) || 0)
        : undefined;
    item.isUnique = this.uniqueCheck.checked || undefined;
    item.lore = this.loreArea.value.trim() || undefined;

    const stats: ItemStats = {};
    let hasStats = false;
    for (const key of ["atk", "def", "spd", "hp", "maxHp"] as const) {
      const v = parseInt(this.statInputs[key].value);
      if (v) { (stats as Record<string, number>)[key] = v; hasStats = true; }
    }
    item.stats = hasStats ? stats : undefined;

    return item;
  }

  private getVisibilityOptions(): Array<{ value: VisibilityType; label: string }> {
    const isSuperuser = this.game?.profile.role === "superuser";
    const options: Array<{ value: VisibilityType; label: string }> = [
      { value: "private", label: "Private (only me)" },
      { value: "public", label: "Public (all users)" },
    ];
    if (isSuperuser) {
      options.push({ value: "system", label: "System (global built-in)" });
    }
    return options;
  }

  private rebuildVisibilitySelect(selected: VisibilityType = "private") {
    if (!this.visibilitySelect) return;
    const options = this.getVisibilityOptions();
    this.visibilitySelect.innerHTML = "";
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      this.visibilitySelect.appendChild(el);
    }
    const canSelect = options.some((o) => o.value === selected);
    this.visibilitySelect.value = canSelect ? selected : "private";
  }

  private refreshIconSpriteOptions() {
    if (!this.iconSpriteSelect) return;
    const current = this.currentItem?.iconSpriteDefName ?? "";
    this.iconSpriteSelect.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "None (use tileset/icon URL)";
    this.iconSpriteSelect.appendChild(none);
    for (const def of this.objectSpriteIconDefs) {
      const opt = document.createElement("option");
      opt.value = def.name;
      opt.textContent = `${def.name} (${def.defaultAnimation})`;
      this.iconSpriteSelect.appendChild(opt);
    }
    const hasCurrent = this.objectSpriteIconDefs.some((d) => d.name === current);
    this.iconSpriteSelect.value = hasCurrent ? current : "";
  }

  // =========================================================================
  // SAVE
  // =========================================================================

  private async save() {
    const item = this.collectForm();
    if (!item || !this.game) return;

    if (!item.name) {
      this.statusEl.textContent = "Name is required";
      this.statusEl.style.color = "var(--danger)";
      this.nameInput.focus();
      return;
    }

    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      this.statusEl.textContent = "Saving\u2026";
      this.statusEl.style.color = "var(--text-muted)";

      await convex.mutation(api.items.save, {
        profileId: adminId,
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        type: item.type,
        rarity: item.rarity,
        iconUrl: item.iconUrl,
        iconTilesetUrl: item.iconTilesetUrl,
        iconTileX: item.iconTileX,
        iconTileY: item.iconTileY,
        iconTileW: item.iconTileW,
        iconTileH: item.iconTileH,
        iconSpriteDefName: item.iconSpriteDefName,
        stats: item.stats,
        effects: item.effects?.length ? item.effects : undefined,
        equipSlot: item.equipSlot,
        levelRequirement: item.levelRequirement,
        stackable: item.stackable,
        maxStack: item.maxStack,
        value: item.value,
        isUnique: item.isUnique,
        tags: item.tags?.length ? item.tags : undefined,
        lore: item.lore,
        consumeHpDelta: item.consumeHpDelta,
        pickupSoundUrl: item.pickupSoundUrl,
        visibilityType: item.visibilityType,
      });

      this.statusEl.textContent = "Saved!";
      this.statusEl.style.color = "var(--success)";

      // Refresh
      await this.loadData();
      const refreshed = this.allItems.find((i) => i.name === item.name);
      if (refreshed) {
        this.selected = refreshed;
        this.currentItem = { ...refreshed, effects: [...(refreshed.effects ?? [])], tags: [...(refreshed.tags ?? [])] };
        this.headerName.textContent = refreshed.displayName;
        this.headerName.className = `item-editor-header-name rarity-${refreshed.rarity}`;
        this.headerMeta.textContent = `${refreshed.rarity} ${refreshed.type} \u2022 ${refreshed.name}`;
        this.headerIcon.innerHTML = "";
        if (!this.drawSpriteIcon(this.headerIcon, refreshed, 48) && !this.drawTileIcon(this.headerIcon, refreshed, 48)) {
          this.headerIcon.textContent = `${TYPE_ICONS[refreshed.type] ?? ""} ${this.getFallbackItemIcon(refreshed)}`;
        }
      }
      this.renderList();

      setTimeout(() => {
        if (this.statusEl.textContent === "Saved!") this.statusEl.textContent = "";
      }, 2000);
    } catch (err: any) {
      console.error("Failed to save item:", err);
      this.statusEl.textContent = err?.message || "Error saving";
      this.statusEl.style.color = "var(--danger)";
    }
  }

  // =========================================================================
  // DELETE
  // =========================================================================

  private async deleteItem() {
    if (!this.currentItem?._id || !this.game) return;
    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      await convex.mutation(api.items.remove, {
        profileId: adminId,
        id: this.currentItem._id as Id<"itemDefs">,
      });
      this.currentItem = null;
      this.selected = null;
      this.showEmptyState();
      await this.loadData();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }

  private updateConsumableFieldState() {
    if (!this.typeSelect || !this.consumeHpDeltaInput) return;
    const isConsumable = this.typeSelect.value === "consumable";
    this.consumeHpDeltaInput.disabled = !isConsumable;
    this.consumeHpDeltaInput.title = isConsumable
      ? "Positive heals, negative damages (poison)."
      : "Only used for consumable items.";
  }
}
