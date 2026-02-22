/**
 * Sprite Editor — browse sprite sheets, preview animations,
 * create named sprite definitions, and save them to Convex.
 */
import { api } from "../../convex/_generated/api";
import { SOUND_FILES } from "../config/audio-config.ts";
import {
  OBJECT_SPRITE_SHEETS,
  type SheetEntry,
} from "../config/spritesheet-config.ts";
import type { Game } from "../engine/Game/index.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import type { VisibilityType } from "../types/visibility.ts";
import "./SpriteEditor.css";

// ---------------------------------------------------------------------------
// Available sprite sheets (static assets)
// ---------------------------------------------------------------------------

/** Raw sprite-sheet JSON shape (TexturePacker / PixiJS format) */
interface SheetJson {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
  animations?: Record<string, string[]>;
  meta: { image: string; format: string; scale: string };
}

/** Parsed info about a loaded sheet */
interface LoadedSheet {
  entry: SheetEntry;
  json: SheetJson;
  image: HTMLImageElement;
  animations: Record<string, { x: number; y: number; w: number; h: number }[]>;
  frameWidth: number;
  frameHeight: number;
}

/** A saved sprite definition row from Convex */
interface SavedSpriteDef {
  _id: string;
  name: string;
  spriteSheetUrl: string;
  defaultAnimation: string;
  animationSpeed: number;
  anchorX: number;
  anchorY: number;
  scale: number;
  isCollidable: boolean;
  category: string;
  frameWidth: number;
  frameHeight: number;
  // NPC-specific
  npcSpeed?: number;
  npcWanderRadius?: number;
  npcDirDown?: string;
  npcDirUp?: string;
  npcDirLeft?: string;
  npcDirRight?: string;
  npcGreeting?: string;
  // Sound
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  // Toggle
  toggleable?: boolean;
  onAnimation?: string;
  offAnimation?: string;
  onSoundUrl?: string;
  // Storage template defaults
  hasStorage?: boolean;
  storageCapacity?: number;
  storageOwnerType?: "public" | "player";
  // Door
  isDoor?: boolean;
  doorClosedAnimation?: string;
  doorOpeningAnimation?: string;
  doorOpenAnimation?: string;
  doorClosingAnimation?: string;
  doorOpenSoundUrl?: string;
  doorCloseSoundUrl?: string;
  visibilityType?: VisibilityType;
}

function visibilityLabel(v?: VisibilityType): string {
  const type = v ?? "system";
  if (type === "private") return "private";
  if (type === "public") return "public";
  return "system";
}

const CATEGORIES = ["object"];

// ---------------------------------------------------------------------------
// Editor panel
// ---------------------------------------------------------------------------
export class SpriteEditorPanel {
  readonly el: HTMLElement;
  private game: Game | null = null;

  // State
  private loadedSheet: LoadedSheet | null = null;
  private selectedAnim = "";
  private previewFrame = 0;
  private previewTimer = 0;
  private savedDefs: SavedSpriteDef[] = [];
  private editingDef: SavedSpriteDef | null = null; // null = creating new

  // DOM refs
  private sheetSelect!: HTMLSelectElement;
  private sheetCanvas!: HTMLCanvasElement;
  private sheetCtx!: CanvasRenderingContext2D;
  private animList!: HTMLElement;
  private previewCanvas!: HTMLCanvasElement;
  private previewCtx!: CanvasRenderingContext2D;
  private previewLabel!: HTMLElement;

  // Form
  private nameInput!: HTMLInputElement;
  private speedInput!: HTMLInputElement;
  private anchorXInput!: HTMLInputElement;
  private anchorYInput!: HTMLInputElement;
  private scaleInput!: HTMLInputElement;
  private collidableCheck!: HTMLInputElement;
  private categorySelect!: HTMLSelectElement;
  private visibilitySelect!: HTMLSelectElement;
  private saveBtn!: HTMLButtonElement;
  private deleteBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;

  // Sound form fields
  private ambientSoundSelect!: HTMLSelectElement;
  private ambientRadiusInput!: HTMLInputElement;
  private ambientVolumeInput!: HTMLInputElement;
  private interactSoundSelect!: HTMLSelectElement;

  // Toggleable on/off form fields
  private toggleFieldsWrap!: HTMLElement;
  private toggleableCheck!: HTMLInputElement;
  private onAnimInput!: HTMLInputElement;
  private offAnimInput!: HTMLInputElement;
  private onSoundSelect!: HTMLSelectElement;

  // Door form fields
  private doorFieldsWrap!: HTMLElement;
  private doorCheck!: HTMLInputElement;
  private doorClosedAnimInput!: HTMLInputElement;
  private doorOpeningAnimInput!: HTMLInputElement;
  private doorOpenAnimInput!: HTMLInputElement;
  private doorClosingAnimInput!: HTMLInputElement;
  private doorOpenSoundSelect!: HTMLSelectElement;
  private doorCloseSoundSelect!: HTMLSelectElement;

  // Storage form fields
  private storageFieldsWrap!: HTMLElement;
  private hasStorageCheck!: HTMLInputElement;
  private storageCapacityInput!: HTMLInputElement;
  private storageOwnerTypeSelect!: HTMLSelectElement;

  // NPC-specific form fields
  private npcFieldsWrap!: HTMLElement;
  private npcSpeedInput!: HTMLInputElement;
  private npcWanderInput!: HTMLInputElement;
  private npcDirDownInput!: HTMLInputElement;
  private npcDirUpInput!: HTMLInputElement;
  private npcDirLeftInput!: HTMLInputElement;
  private npcDirRightInput!: HTMLInputElement;
  private npcGreetingInput!: HTMLTextAreaElement;

  // Saved list
  private savedListEl!: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "sprite-editor";
    this.el.style.display = "none";

    // Layout: sidebar (left) + canvas area (center) + definition panel (right)
    this.el.appendChild(this.buildSidebar());
    this.el.appendChild(this.buildCenter());
    this.el.appendChild(this.buildDefPanel());
  }

  setGame(game: Game) {
    this.game = game;
    this.rebuildVisibilityOptions(
      (this.visibilitySelect?.value as any) || "private",
    );
  }

  // =========================================================================
  // BUILD: Sidebar — sheet picker + animation list
  // =========================================================================

  private buildSidebar(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "sprite-editor-sidebar";

    const title = document.createElement("h3");
    title.className = "sprite-editor-title";
    title.textContent = "Sprite Sheets";
    sidebar.appendChild(title);

    // Sheet selector
    this.sheetSelect = document.createElement("select");
    this.sheetSelect.className = "sprite-editor-select";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— Select a sheet —";
    this.sheetSelect.appendChild(placeholder);
    for (const s of OBJECT_SPRITE_SHEETS) {
      const opt = document.createElement("option");
      opt.value = s.jsonUrl;
      opt.textContent = s.name;
      this.sheetSelect.appendChild(opt);
    }
    this.sheetSelect.addEventListener("change", () => this.onSheetSelect());
    sidebar.appendChild(this.sheetSelect);

    // Animation list
    const animLabel = document.createElement("div");
    animLabel.className = "sprite-editor-section-label";
    animLabel.textContent = "Animations";
    sidebar.appendChild(animLabel);

    this.animList = document.createElement("div");
    this.animList.className = "sprite-editor-anim-list";
    sidebar.appendChild(this.animList);

    return sidebar;
  }

  // =========================================================================
  // BUILD: Center — sheet image + animation preview
  // =========================================================================

  private buildCenter(): HTMLElement {
    const center = document.createElement("div");
    center.className = "sprite-editor-center";

    // Sheet image canvas (scrollable)
    const sheetWrap = document.createElement("div");
    sheetWrap.className = "sprite-editor-sheet-wrap";

    this.sheetCanvas = document.createElement("canvas");
    this.sheetCanvas.className = "sprite-editor-sheet-canvas";
    this.sheetCtx = this.sheetCanvas.getContext("2d")!;
    this.sheetCtx.imageSmoothingEnabled = false;
    sheetWrap.appendChild(this.sheetCanvas);
    center.appendChild(sheetWrap);

    // Preview area
    const previewWrap = document.createElement("div");
    previewWrap.className = "sprite-editor-preview-wrap";

    this.previewLabel = document.createElement("div");
    this.previewLabel.className = "sprite-editor-preview-label";
    this.previewLabel.textContent = "Preview";
    previewWrap.appendChild(this.previewLabel);

    this.previewCanvas = document.createElement("canvas");
    this.previewCanvas.className = "sprite-editor-preview-canvas";
    this.previewCanvas.width = 256;
    this.previewCanvas.height = 256;
    this.previewCtx = this.previewCanvas.getContext("2d")!;
    this.previewCtx.imageSmoothingEnabled = false;
    previewWrap.appendChild(this.previewCanvas);
    center.appendChild(previewWrap);

    return center;
  }

  // =========================================================================
  // BUILD: Right panel — sprite definition form + saved list
  // =========================================================================

  private buildDefPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "sprite-editor-defpanel";

    const title = document.createElement("h3");
    title.className = "sprite-editor-title";
    title.textContent = "Sprite Definitions";
    panel.appendChild(title);

    // Form
    const form = document.createElement("div");
    form.className = "sprite-editor-form";

    this.nameInput = this.addFormField(
      form,
      "Name",
      "text",
      "My Sprite",
    ) as HTMLInputElement;
    this.speedInput = this.addFormField(
      form,
      "Anim Speed",
      "number",
      "0.15",
    ) as HTMLInputElement;
    this.speedInput.addEventListener("input", () => this.startPreview()); // live-update preview
    this.scaleInput = this.addFormField(
      form,
      "Scale",
      "number",
      "1",
    ) as HTMLInputElement;
    this.anchorXInput = this.addFormField(
      form,
      "Anchor X (0–1)",
      "number",
      "0.5",
    ) as HTMLInputElement;
    this.anchorYInput = this.addFormField(
      form,
      "Anchor Y (0–1)",
      "number",
      "1",
    ) as HTMLInputElement;

    // Category
    const catField = document.createElement("div");
    catField.className = "sprite-editor-field";
    const catLabel = document.createElement("label");
    catLabel.textContent = "Category";
    this.categorySelect = document.createElement("select");
    this.categorySelect.className = "sprite-editor-select";
    for (const c of CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      this.categorySelect.appendChild(opt);
    }
    catField.append(catLabel, this.categorySelect);
    form.appendChild(catField);

    // Visibility scope
    const visField = document.createElement("div");
    visField.className = "sprite-editor-field";
    const visLabel = document.createElement("label");
    visLabel.textContent = "Visibility";
    this.visibilitySelect = document.createElement("select");
    this.visibilitySelect.className = "sprite-editor-select";
    this.rebuildVisibilityOptions();
    visField.append(visLabel, this.visibilitySelect);
    form.appendChild(visField);

    // Collidable checkbox
    const colField = document.createElement("div");
    colField.className = "sprite-editor-field sprite-editor-field-row";
    this.collidableCheck = document.createElement("input");
    this.collidableCheck.type = "checkbox";
    this.collidableCheck.id = "collidable-check";
    const colLabel = document.createElement("label");
    colLabel.htmlFor = "collidable-check";
    colLabel.textContent = "Collidable";
    colField.append(this.collidableCheck, colLabel);
    form.appendChild(colField);

    // ---- Sound fields (all categories) ----
    const soundHeader = document.createElement("div");
    soundHeader.className = "sprite-editor-section-label";
    soundHeader.textContent = "Sounds";
    form.appendChild(soundHeader);

    // Ambient sound
    const ambField = document.createElement("div");
    ambField.className = "sprite-editor-field";
    const ambLabel = document.createElement("label");
    ambLabel.textContent = "Ambient Sound (loops)";
    this.ambientSoundSelect = this.buildSoundSelect();
    ambField.append(ambLabel, this.ambientSoundSelect);
    form.appendChild(ambField);

    this.ambientRadiusInput = this.addFormField(
      form,
      "Ambient Radius (px)",
      "number",
      "200",
    ) as HTMLInputElement;
    this.ambientVolumeInput = this.addFormField(
      form,
      "Ambient Volume (0–1)",
      "number",
      "0.5",
    ) as HTMLInputElement;

    // Interact sound
    const intField = document.createElement("div");
    intField.className = "sprite-editor-field";
    const intLabel = document.createElement("label");
    intLabel.textContent = "Interact / Greeting Sound";
    this.interactSoundSelect = this.buildSoundSelect();
    intField.append(intLabel, this.interactSoundSelect);
    form.appendChild(intField);

    // ---- Toggleable on/off fields (shown when checkbox is checked) ----
    this.toggleFieldsWrap = document.createElement("div");

    const toggleHeader = document.createElement("div");
    toggleHeader.className = "sprite-editor-section-label";
    toggleHeader.textContent = "Toggleable On/Off";
    this.toggleFieldsWrap.appendChild(toggleHeader);

    const toggleField = document.createElement("div");
    toggleField.className = "sprite-editor-field sprite-editor-field-row";
    this.toggleableCheck = document.createElement("input");
    this.toggleableCheck.type = "checkbox";
    this.toggleableCheck.id = "toggleable-check";
    const toggleLabel = document.createElement("label");
    toggleLabel.htmlFor = "toggleable-check";
    toggleLabel.textContent = "Toggleable (player can turn on/off)";
    toggleField.append(this.toggleableCheck, toggleLabel);
    this.toggleFieldsWrap.appendChild(toggleField);

    const toggleAnimWrap = document.createElement("div");
    toggleAnimWrap.className = "sprite-editor-toggle-anim-fields";
    toggleAnimWrap.style.display = "none";
    this.onAnimInput = this.addFormField(
      toggleAnimWrap,
      "On Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;
    this.offAnimInput = this.addFormField(
      toggleAnimWrap,
      "Off Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;

    const onSoundField = document.createElement("div");
    onSoundField.className = "sprite-editor-field";
    const onSoundLabel = document.createElement("label");
    onSoundLabel.textContent = "Sound When On (loops)";
    this.onSoundSelect = this.buildSoundSelect();
    onSoundField.append(onSoundLabel, this.onSoundSelect);
    toggleAnimWrap.appendChild(onSoundField);

    this.toggleFieldsWrap.appendChild(toggleAnimWrap);
    form.appendChild(this.toggleFieldsWrap);

    this.toggleableCheck.addEventListener("change", () => {
      toggleAnimWrap.style.display = this.toggleableCheck.checked ? "" : "none";
      // Uncheck door if toggleable is checked (mutually exclusive)
      if (this.toggleableCheck.checked && this.doorCheck.checked) {
        this.doorCheck.checked = false;
        this.doorCheck.dispatchEvent(new Event("change"));
      }
    });

    // ── Door fields ──
    this.doorFieldsWrap = document.createElement("div");
    this.doorFieldsWrap.className = "sprite-editor-door-fields-wrap";

    const doorField = document.createElement("div");
    doorField.className = "sprite-editor-field sprite-editor-field-row";
    this.doorCheck = document.createElement("input");
    this.doorCheck.type = "checkbox";
    this.doorCheck.id = "door-check";
    const doorLabel = document.createElement("label");
    doorLabel.htmlFor = "door-check";
    doorLabel.textContent = "Door (4-state open/close)";
    doorField.append(this.doorCheck, doorLabel);
    this.doorFieldsWrap.appendChild(doorField);

    const doorAnimWrap = document.createElement("div");
    doorAnimWrap.className = "sprite-editor-door-anim-fields";
    doorAnimWrap.style.display = "none";
    this.doorClosedAnimInput = this.addFormField(
      doorAnimWrap,
      "Closed Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;
    this.doorOpeningAnimInput = this.addFormField(
      doorAnimWrap,
      "Opening Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;
    this.doorOpenAnimInput = this.addFormField(
      doorAnimWrap,
      "Open Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;
    this.doorClosingAnimInput = this.addFormField(
      doorAnimWrap,
      "Closing Animation (row name)",
      "text",
      "",
    ) as HTMLInputElement;

    // Door sounds
    const doorOpenSoundField = document.createElement("div");
    doorOpenSoundField.className = "sprite-editor-field";
    const doorOpenSoundLabel = document.createElement("label");
    doorOpenSoundLabel.textContent = "Open Sound";
    this.doorOpenSoundSelect = this.buildSoundSelect();
    doorOpenSoundField.append(doorOpenSoundLabel, this.doorOpenSoundSelect);
    doorAnimWrap.appendChild(doorOpenSoundField);

    const doorCloseSoundField = document.createElement("div");
    doorCloseSoundField.className = "sprite-editor-field";
    const doorCloseSoundLabel = document.createElement("label");
    doorCloseSoundLabel.textContent = "Close Sound";
    this.doorCloseSoundSelect = this.buildSoundSelect();
    doorCloseSoundField.append(doorCloseSoundLabel, this.doorCloseSoundSelect);
    doorAnimWrap.appendChild(doorCloseSoundField);

    this.doorFieldsWrap.appendChild(doorAnimWrap);
    form.appendChild(this.doorFieldsWrap);

    this.doorCheck.addEventListener("change", () => {
      doorAnimWrap.style.display = this.doorCheck.checked ? "" : "none";
      // Uncheck toggleable if door is checked (mutually exclusive)
      if (this.doorCheck.checked && this.toggleableCheck.checked) {
        this.toggleableCheck.checked = false;
        this.toggleableCheck.dispatchEvent(new Event("change"));
      }
    });

    // ---- Storage fields ----
    this.storageFieldsWrap = document.createElement("div");
    this.storageFieldsWrap.className = "sprite-editor-storage-fields-wrap";

    const storageHeader = document.createElement("div");
    storageHeader.className = "sprite-editor-section-label";
    storageHeader.textContent = "Storage (Chests, Barrels, etc.)";
    this.storageFieldsWrap.appendChild(storageHeader);

    const storageField = document.createElement("div");
    storageField.className = "sprite-editor-field sprite-editor-field-row";
    this.hasStorageCheck = document.createElement("input");
    this.hasStorageCheck.type = "checkbox";
    this.hasStorageCheck.id = "has-storage-check";
    const storageLabel = document.createElement("label");
    storageLabel.htmlFor = "has-storage-check";
    storageLabel.textContent = "Has Storage";
    storageField.append(this.hasStorageCheck, storageLabel);
    this.storageFieldsWrap.appendChild(storageField);

    const storageConfigWrap = document.createElement("div");
    storageConfigWrap.className = "sprite-editor-storage-config-fields";
    storageConfigWrap.style.display = "none";

    this.storageCapacityInput = this.addFormField(
      storageConfigWrap,
      "Capacity (slots)",
      "number",
      "10",
    ) as HTMLInputElement;

    const ownerField = document.createElement("div");
    ownerField.className = "sprite-editor-field";
    const ownerLabel = document.createElement("label");
    ownerLabel.textContent = "Default Owner Type";
    this.storageOwnerTypeSelect = document.createElement("select");
    this.storageOwnerTypeSelect.className = "sprite-editor-select";
    const publicOpt = document.createElement("option");
    publicOpt.value = "public";
    publicOpt.textContent = "Public (Shared)";
    const playerOpt = document.createElement("option");
    playerOpt.value = "player";
    playerOpt.textContent = "Player (Private)";
    this.storageOwnerTypeSelect.append(publicOpt, playerOpt);
    ownerField.append(ownerLabel, this.storageOwnerTypeSelect);
    storageConfigWrap.appendChild(ownerField);

    this.storageFieldsWrap.appendChild(storageConfigWrap);
    form.appendChild(this.storageFieldsWrap);

    this.hasStorageCheck.addEventListener("change", () => {
      storageConfigWrap.style.display = this.hasStorageCheck.checked
        ? ""
        : "none";
    });

    // NPC-specific fields (shown/hidden based on category)
    this.npcFieldsWrap = document.createElement("div");
    this.npcFieldsWrap.className = "sprite-editor-npc-fields";
    this.npcFieldsWrap.style.display = "none";

    const npcHeader = document.createElement("div");
    npcHeader.className = "sprite-editor-section-label";
    npcHeader.textContent = "NPC Settings";
    this.npcFieldsWrap.appendChild(npcHeader);

    this.npcSpeedInput = this.addFormField(
      this.npcFieldsWrap,
      "Move Speed (px/sec)",
      "number",
      "30",
    ) as HTMLInputElement;
    this.npcWanderInput = this.addFormField(
      this.npcFieldsWrap,
      "Wander Radius (px)",
      "number",
      "60",
    ) as HTMLInputElement;

    const dirHeader = document.createElement("div");
    dirHeader.className = "sprite-editor-section-label";
    dirHeader.textContent = "Direction → Animation Row";
    dirHeader.style.marginTop = "4px";
    this.npcFieldsWrap.appendChild(dirHeader);

    this.npcDirDownInput = this.addFormField(
      this.npcFieldsWrap,
      "Down",
      "text",
      "row0",
    ) as HTMLInputElement;
    this.npcDirUpInput = this.addFormField(
      this.npcFieldsWrap,
      "Up",
      "text",
      "row1",
    ) as HTMLInputElement;
    this.npcDirLeftInput = this.addFormField(
      this.npcFieldsWrap,
      "Left",
      "text",
      "row3",
    ) as HTMLInputElement;
    this.npcDirRightInput = this.addFormField(
      this.npcFieldsWrap,
      "Right",
      "text",
      "row2",
    ) as HTMLInputElement;

    // Greeting textarea
    const greetField = document.createElement("div");
    greetField.className = "sprite-editor-field";
    const greetLabel = document.createElement("label");
    greetLabel.textContent = "Greeting";
    this.npcGreetingInput = document.createElement("textarea");
    this.npcGreetingInput.className = "sprite-editor-textarea";
    this.npcGreetingInput.rows = 3;
    this.npcGreetingInput.placeholder =
      "Hello there! I don't have much to say yet.";
    greetField.append(greetLabel, this.npcGreetingInput);
    this.npcFieldsWrap.appendChild(greetField);

    form.appendChild(this.npcFieldsWrap);

    // Show/hide NPC fields when category changes
    this.categorySelect.addEventListener("change", () =>
      this.onCategoryChange(),
    );

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "sprite-editor-btn-row";

    const newBtn = document.createElement("button");
    newBtn.className = "sprite-editor-btn";
    newBtn.textContent = "New";
    newBtn.addEventListener("click", () => this.resetForm());
    btnRow.appendChild(newBtn);

    this.saveBtn = document.createElement("button");
    this.saveBtn.className = "sprite-editor-btn accent";
    this.saveBtn.textContent = "💾 Save";
    this.saveBtn.addEventListener("click", () => this.saveDef());
    btnRow.appendChild(this.saveBtn);

    this.deleteBtn = document.createElement("button");
    this.deleteBtn.className = "sprite-editor-btn danger";
    this.deleteBtn.textContent = "🗑 Delete";
    this.deleteBtn.style.display = "none";
    this.deleteBtn.addEventListener("click", () => this.deleteDef());
    btnRow.appendChild(this.deleteBtn);

    form.appendChild(btnRow);

    // Status
    this.statusEl = document.createElement("div");
    this.statusEl.className = "sprite-editor-status";
    form.appendChild(this.statusEl);

    panel.appendChild(form);

    // Saved definitions list — placed in a collapsible section at the bottom
    // but also rendered in a top summary strip so it's always visible.
    const savedLabel = document.createElement("div");
    savedLabel.className = "sprite-editor-section-label";
    savedLabel.textContent = "Saved Sprites";
    savedLabel.style.cursor = "pointer";
    savedLabel.title = "Click to scroll to saved sprites";

    this.savedListEl = document.createElement("div");
    this.savedListEl.className = "sprite-editor-saved-list";

    // Put saved list BEFORE the form so it's visible without scrolling
    panel.insertBefore(this.savedListEl, form);
    panel.insertBefore(savedLabel, this.savedListEl);

    return panel;
  }

  private buildSoundSelect(): HTMLSelectElement {
    const sel = document.createElement("select");
    sel.className = "sprite-editor-select";
    for (const sf of SOUND_FILES) {
      const opt = document.createElement("option");
      opt.value = sf.url;
      opt.textContent = sf.label;
      sel.appendChild(opt);
    }
    return sel;
  }

  private addFormField(
    parent: HTMLElement,
    labelText: string,
    type: string,
    defaultVal: string,
  ): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "sprite-editor-field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.value = defaultVal;
    if (type === "number") {
      input.step = "0.01";
      input.min = "0";
    }
    field.append(label, input);
    parent.appendChild(field);
    return input;
  }

  // =========================================================================
  // LOAD: Sprite sheet
  // =========================================================================

  private async onSheetSelect() {
    const url = this.sheetSelect.value;
    if (!url) return;

    const entry = OBJECT_SPRITE_SHEETS.find((s) => s.jsonUrl === url);
    if (!entry) return;

    try {
      // Fetch JSON
      const resp = await fetch(entry.jsonUrl);
      const json: SheetJson = await resp.json();

      // Determine base path
      const basePath = entry.jsonUrl.substring(
        0,
        entry.jsonUrl.lastIndexOf("/") + 1,
      );
      const imagePath = basePath + json.meta.image;

      // Load image
      const image = await this.loadImage(imagePath);

      // Parse animations
      const animations: LoadedSheet["animations"] = {};
      if (json.animations) {
        for (const [animName, frameNames] of Object.entries(json.animations)) {
          animations[animName] = frameNames.map((fn) => {
            const f = json.frames[fn]?.frame;
            return f ?? { x: 0, y: 0, w: 32, h: 32 };
          });
        }
      } else {
        // Single "default" animation from all frames
        animations["default"] = Object.values(json.frames).map((f) => f.frame);
      }

      // Determine frame size from first frame
      const firstFrame = Object.values(json.frames)[0]?.frame;
      const fw = firstFrame?.w ?? 32;
      const fh = firstFrame?.h ?? 32;

      this.loadedSheet = {
        entry,
        json,
        image,
        animations,
        frameWidth: fw,
        frameHeight: fh,
      };
      this.renderSheetCanvas();
      this.renderAnimList();
      this.selectAnimation(Object.keys(animations)[0] ?? "");
    } catch (err) {
      console.error("Failed to load sprite sheet:", err);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image: " + src));
      img.src = src;
    });
  }

  // =========================================================================
  // RENDER: Sheet canvas with grid overlay
  // =========================================================================

  private renderSheetCanvas() {
    if (!this.loadedSheet) return;
    const { image, frameWidth, frameHeight } = this.loadedSheet;

    // Adaptive scale: 2x for small sheets, 1x for large ones
    const maxSheetDim = Math.max(image.width, image.height);
    const scale = maxSheetDim > 512 ? 1 : 2;
    const w = image.width * scale;
    const h = image.height * scale;

    this.sheetCanvas.width = w;
    this.sheetCanvas.height = h;
    this.sheetCanvas.style.width = w + "px";
    this.sheetCanvas.style.height = h + "px";

    const ctx = this.sheetCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    // Draw image scaled up
    ctx.drawImage(image, 0, 0, w, h);

    // Grid overlay
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    const cols = Math.floor(image.width / frameWidth);
    const rows = Math.floor(image.height / frameHeight);
    for (let r = 0; r <= rows; r++) {
      const y = r * frameHeight * scale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const x = c * frameWidth * scale;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  // =========================================================================
  // RENDER: Animation list
  // =========================================================================

  private renderAnimList() {
    this.animList.innerHTML = "";
    if (!this.loadedSheet) return;

    for (const animName of Object.keys(this.loadedSheet.animations)) {
      const frames = this.loadedSheet.animations[animName];
      const btn = document.createElement("button");
      btn.className = `sprite-editor-anim-btn ${this.selectedAnim === animName ? "active" : ""}`;
      btn.textContent = `${animName} (${frames.length} frames)`;
      btn.addEventListener("click", () => this.selectAnimation(animName));
      this.animList.appendChild(btn);
    }
  }

  private selectAnimation(name: string) {
    this.selectedAnim = name;
    this.previewFrame = 0;
    this.renderAnimList();
    this.startPreview();
  }

  // =========================================================================
  // RENDER: Animation preview
  // =========================================================================

  private startPreview() {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = 0;
    }

    if (!this.loadedSheet || !this.selectedAnim) {
      this.previewCtx.clearRect(
        0,
        0,
        this.previewCanvas.width,
        this.previewCanvas.height,
      );
      this.previewLabel.textContent = "Preview";
      return;
    }

    const frames = this.loadedSheet.animations[this.selectedAnim];
    if (!frames || frames.length === 0) return;

    this.previewLabel.textContent = `Preview: ${this.selectedAnim}`;

    // PixiJS animationSpeed is a fraction-of-frame-per-tick at ~60 fps.
    // To match in setInterval: intervalMs = 1000 / (60 * speed).
    const speed = parseFloat(this.speedInput.value) || 0.15;
    const intervalMs = Math.max(30, 1000 / (60 * speed));

    this.drawPreviewFrame(frames);

    this.previewTimer = window.setInterval(() => {
      this.previewFrame = (this.previewFrame + 1) % frames.length;
      this.drawPreviewFrame(frames);
    }, intervalMs);
  }

  private drawPreviewFrame(
    frames: { x: number; y: number; w: number; h: number }[],
  ) {
    if (!this.loadedSheet) return;
    const ctx = this.previewCtx;
    const f = frames[this.previewFrame % frames.length];
    const cw = this.previewCanvas.width;
    const ch = this.previewCanvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // Scale to fit canvas while preserving aspect ratio.
    // For small frames (< canvas) use integer scale; for large ones use fractional.
    const maxDim = Math.max(f.w, f.h);
    const scale =
      maxDim <= cw
        ? Math.max(1, Math.floor(cw / maxDim)) // integer upscale for pixel art
        : cw / maxDim; // fractional downscale for large sprites
    const dw = Math.round(f.w * scale);
    const dh = Math.round(f.h * scale);
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);

    ctx.drawImage(this.loadedSheet.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  }

  // =========================================================================
  // FORM: Reset / populate / category toggle
  // =========================================================================

  private onCategoryChange() {
    const isNpc = this.categorySelect.value === "npc";
    this.npcFieldsWrap.style.display = isNpc ? "" : "none";
  }

  private resetForm() {
    this.editingDef = null;
    this.nameInput.value = "";
    this.speedInput.value = "0.15";
    this.scaleInput.value = "1";
    this.anchorXInput.value = "0.5";
    this.anchorYInput.value = "1";
    this.collidableCheck.checked = false;
    this.categorySelect.value = "object";
    this.rebuildVisibilityOptions("private");
    this.deleteBtn.style.display = "none";
    this.statusEl.textContent = "";

    // Reset sound fields
    this.ambientSoundSelect.value = "";
    this.ambientRadiusInput.value = "200";
    this.ambientVolumeInput.value = "0.5";
    this.interactSoundSelect.value = "";

    // Reset storage fields
    this.hasStorageCheck.checked = false;
    this.storageCapacityInput.value = "10";
    this.storageOwnerTypeSelect.value = "public";
    (
      this.storageFieldsWrap.querySelector(
        ".sprite-editor-storage-config-fields",
      ) as HTMLElement
    ).style.display = "none";

    // Reset toggle fields
    this.toggleableCheck.checked = false;
    this.onAnimInput.value = "";
    this.offAnimInput.value = "";
    this.onSoundSelect.value = "";
    (
      this.toggleFieldsWrap.querySelector(
        ".sprite-editor-toggle-anim-fields",
      ) as HTMLElement
    ).style.display = "none";

    // Reset NPC fields
    this.npcSpeedInput.value = "30";
    this.npcWanderInput.value = "60";
    this.npcDirDownInput.value = "row0";
    this.npcDirUpInput.value = "row1";
    this.npcDirLeftInput.value = "row3";
    this.npcDirRightInput.value = "row2";
    this.npcGreetingInput.value = "";
    this.npcFieldsWrap.style.display = "none";
  }

  private populateForm(def: SavedSpriteDef) {
    this.editingDef = def;
    this.nameInput.value = def.name;
    this.speedInput.value = String(def.animationSpeed);
    this.scaleInput.value = String(def.scale);
    this.anchorXInput.value = String(def.anchorX);
    this.anchorYInput.value = String(def.anchorY);
    this.collidableCheck.checked = def.isCollidable;
    this.categorySelect.value = def.category;
    this.rebuildVisibilityOptions(def.visibilityType ?? "system");
    this.deleteBtn.style.display = "";

    // Sound fields
    this.ambientSoundSelect.value = def.ambientSoundUrl ?? "";
    this.ambientRadiusInput.value = String(def.ambientSoundRadius ?? 200);
    this.ambientVolumeInput.value = String(def.ambientSoundVolume ?? 0.5);
    this.interactSoundSelect.value = def.interactSoundUrl ?? "";

    // Storage fields
    this.hasStorageCheck.checked = !!def.hasStorage;
    this.storageCapacityInput.value = String(def.storageCapacity ?? 10);
    this.storageOwnerTypeSelect.value = def.storageOwnerType ?? "public";
    (
      this.storageFieldsWrap.querySelector(
        ".sprite-editor-storage-config-fields",
      ) as HTMLElement
    ).style.display = def.hasStorage ? "" : "none";

    // Toggle fields
    this.toggleableCheck.checked = !!def.toggleable;
    this.onAnimInput.value = def.onAnimation ?? "";
    this.offAnimInput.value = def.offAnimation ?? "";
    this.onSoundSelect.value = def.onSoundUrl ?? "";
    (
      this.toggleFieldsWrap.querySelector(
        ".sprite-editor-toggle-anim-fields",
      ) as HTMLElement
    ).style.display = def.toggleable ? "" : "none";

    // Door fields
    this.doorCheck.checked = !!def.isDoor;
    this.doorClosedAnimInput.value = def.doorClosedAnimation ?? "";
    this.doorOpeningAnimInput.value = def.doorOpeningAnimation ?? "";
    this.doorOpenAnimInput.value = def.doorOpenAnimation ?? "";
    this.doorClosingAnimInput.value = def.doorClosingAnimation ?? "";
    this.doorOpenSoundSelect.value = def.doorOpenSoundUrl ?? "";
    this.doorCloseSoundSelect.value = def.doorCloseSoundUrl ?? "";
    (
      this.doorFieldsWrap.querySelector(
        ".sprite-editor-door-anim-fields",
      ) as HTMLElement
    ).style.display = def.isDoor ? "" : "none";

    // NPC fields
    const isNpc = def.category === "npc";
    this.npcFieldsWrap.style.display = isNpc ? "" : "none";
    this.npcSpeedInput.value = String(def.npcSpeed ?? 30);
    this.npcWanderInput.value = String(def.npcWanderRadius ?? 60);
    this.npcDirDownInput.value = def.npcDirDown ?? "row0";
    this.npcDirUpInput.value = def.npcDirUp ?? "row1";
    this.npcDirLeftInput.value = def.npcDirLeft ?? "row3";
    this.npcDirRightInput.value = def.npcDirRight ?? "row2";
    this.npcGreetingInput.value = def.npcGreeting ?? "";

    // Select the matching sheet & animation
    this.sheetSelect.value = def.spriteSheetUrl;
    this.onSheetSelect().then(() => {
      this.selectAnimation(def.defaultAnimation);
    });
  }

  // =========================================================================
  // SAVE / DELETE
  // =========================================================================

  private async saveDef() {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.showStatus("Name is required", true);
      return;
    }
    if (!this.loadedSheet) {
      this.showStatus("Select a sprite sheet first", true);
      return;
    }
    if (!this.selectedAnim) {
      this.showStatus("Select an animation first", true);
      return;
    }

    this.showStatus("Saving…");

    try {
      const convex = getConvexClient();
      const category = this.categorySelect.value;
      const isNpc = category === "npc";

      const profileId = this.game?.profile._id as any;

      await convex.mutation(api.spriteDefinitions.save, {
        profileId,
        name,
        spriteSheetUrl: this.loadedSheet.entry.jsonUrl,
        defaultAnimation: this.selectedAnim,
        animationSpeed: parseFloat(this.speedInput.value) || 0.15,
        anchorX: parseFloat(this.anchorXInput.value) || 0.5,
        anchorY: parseFloat(this.anchorYInput.value) || 1,
        scale: parseFloat(this.scaleInput.value) || 1,
        isCollidable: this.collidableCheck.checked,
        category,
        visibilityType: this.visibilitySelect.value as any,
        frameWidth: this.loadedSheet.frameWidth,
        frameHeight: this.loadedSheet.frameHeight,
        // Sound fields
        ambientSoundUrl: this.ambientSoundSelect.value || undefined,
        ambientSoundRadius: this.ambientSoundSelect.value
          ? parseFloat(this.ambientRadiusInput.value) || 200
          : undefined,
        ambientSoundVolume: this.ambientSoundSelect.value
          ? parseFloat(this.ambientVolumeInput.value) || 0.5
          : undefined,
        interactSoundUrl: this.interactSoundSelect.value || undefined,
        // Storage defaults
        hasStorage: this.hasStorageCheck.checked || undefined,
        storageCapacity: this.hasStorageCheck.checked
          ? parseInt(this.storageCapacityInput.value) || 10
          : undefined,
        storageOwnerType: this.hasStorageCheck.checked
          ? (this.storageOwnerTypeSelect.value as any)
          : undefined,
        // Toggleable on/off
        ...(this.toggleableCheck.checked
          ? {
              toggleable: true,
              onAnimation: this.onAnimInput.value || undefined,
              offAnimation: this.offAnimInput.value || undefined,
              onSoundUrl: this.onSoundSelect.value || undefined,
            }
          : {
              toggleable: undefined,
              onAnimation: undefined,
              offAnimation: undefined,
              onSoundUrl: undefined,
            }),
        // Door
        ...(this.doorCheck.checked
          ? {
              isDoor: true,
              doorClosedAnimation: this.doorClosedAnimInput.value || undefined,
              doorOpeningAnimation:
                this.doorOpeningAnimInput.value || undefined,
              doorOpenAnimation: this.doorOpenAnimInput.value || undefined,
              doorClosingAnimation:
                this.doorClosingAnimInput.value || undefined,
              doorOpenSoundUrl: this.doorOpenSoundSelect.value || undefined,
              doorCloseSoundUrl: this.doorCloseSoundSelect.value || undefined,
            }
          : {
              isDoor: undefined,
              doorClosedAnimation: undefined,
              doorOpeningAnimation: undefined,
              doorOpenAnimation: undefined,
              doorClosingAnimation: undefined,
              doorOpenSoundUrl: undefined,
              doorCloseSoundUrl: undefined,
            }),
        // NPC-specific
        ...(isNpc
          ? {
              npcSpeed: parseFloat(this.npcSpeedInput.value) || 30,
              npcWanderRadius: parseFloat(this.npcWanderInput.value) || 60,
              npcDirDown: this.npcDirDownInput.value || "row0",
              npcDirUp: this.npcDirUpInput.value || "row1",
              npcDirLeft: this.npcDirLeftInput.value || "row3",
              npcDirRight: this.npcDirRightInput.value || "row2",
              npcGreeting: this.npcGreetingInput.value || undefined,
            }
          : {}),
      });

      this.showStatus("Saved ✓");

      // Live-refresh sounds on any running entities using this definition
      const soundCfg = {
        ambientSoundUrl: this.ambientSoundSelect.value || undefined,
        ambientSoundRadius: this.ambientSoundSelect.value
          ? parseFloat(this.ambientRadiusInput.value) || 200
          : undefined,
        ambientSoundVolume: this.ambientSoundSelect.value
          ? parseFloat(this.ambientVolumeInput.value) || 0.5
          : undefined,
        interactSoundUrl: this.interactSoundSelect.value || undefined,
        onSoundUrl:
          (this.toggleableCheck.checked ? this.onSoundSelect.value : "") ||
          undefined,
      };
      if (this.game?.entityLayer) {
        this.game.entityLayer.refreshNPCSounds(name, soundCfg);
      }
      if (this.game?.objectLayer) {
        this.game.objectLayer.refreshSoundsForDef(name, soundCfg);
      }

      this.loadSavedDefs();
    } catch (err: any) {
      console.error("Failed to save sprite definition:", err);
      const msg = err?.message || "Save failed!";
      if (msg.includes("superuser") || msg.includes("Permission denied")) {
        this.showStatus(`Save failed: ${msg}`, true);
      } else {
        this.showStatus(`Save failed: ${msg}`, true);
      }
    }
  }

  private async deleteDef() {
    if (!this.editingDef) return;

    if (!confirm(`Delete sprite "${this.editingDef.name}"?`)) return;

    try {
      const convex = getConvexClient();
      const profileId = this.game?.profile._id as any;
      await convex.mutation(api.spriteDefinitions.remove, {
        profileId,
        id: this.editingDef._id as any,
      });
      this.showStatus("Deleted");
      this.resetForm();
      this.loadSavedDefs();
    } catch (err) {
      console.error("Failed to delete sprite definition:", err);
      this.showStatus("Delete failed!", true);
    }
  }

  private showStatus(text: string, isError = false) {
    this.statusEl.textContent = text;
    this.statusEl.style.color = isError ? "#ff4444" : "#88ff88";
    clearTimeout(this._statusTimer);
    this._statusTimer = window.setTimeout(() => {
      this.statusEl.textContent = "";
    }, 3000);
  }
  private _statusTimer = 0;

  // =========================================================================
  // LOAD: Saved definitions from Convex
  // =========================================================================

  async loadSavedDefs() {
    // Show loading state immediately
    this.savedListEl.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "sprite-editor-empty";
    loading.textContent = "Loading saved sprites...";
    this.savedListEl.appendChild(loading);

    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.spriteDefinitions.list, {});
      console.log(
        `[SpriteEditor] Loaded ${defs.length} saved sprite definitions`,
      );
      this.savedDefs = defs as unknown as SavedSpriteDef[];
      this.renderSavedList();
    } catch (err) {
      console.warn("Failed to load sprite definitions:", err);
      this.savedListEl.innerHTML = "";
      const errEl = document.createElement("div");
      errEl.className = "sprite-editor-empty";
      errEl.textContent = "Failed to load saved sprites";
      errEl.style.color = "var(--danger, #e74c3c)";
      this.savedListEl.appendChild(errEl);
    }
  }

  private renderSavedList() {
    this.savedListEl.innerHTML = "";

    // Filter out NPC sprites — those are managed in the NPC Editor
    const objectDefs = this.savedDefs.filter((d) => d.category !== "npc");

    if (objectDefs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sprite-editor-empty";
      empty.textContent = "No saved sprites yet. Create one above!";
      this.savedListEl.appendChild(empty);
      return;
    }

    for (const def of objectDefs) {
      const row = document.createElement("div");
      row.className = "sprite-editor-saved-row";

      const nameEl = document.createElement("span");
      nameEl.className = "sprite-editor-saved-name";
      nameEl.textContent = def.name;

      const catEl = document.createElement("span");
      catEl.className = "sprite-editor-saved-cat";
      catEl.textContent = def.category;

      const visEl = document.createElement("span");
      visEl.className = `sprite-editor-saved-vis ${visibilityLabel(def.visibilityType)}`;
      visEl.textContent = visibilityLabel(def.visibilityType);

      const editBtn = document.createElement("button");
      editBtn.className = "sprite-editor-btn small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => this.populateForm(def));

      row.append(nameEl, catEl, visEl, editBtn);
      this.savedListEl.appendChild(row);
    }
  }

  private rebuildVisibilityOptions(selected: VisibilityType = "private") {
    if (!this.visibilitySelect) return;
    const isSuperuser = this.game?.profile.role === "superuser";
    this.visibilitySelect.innerHTML = "";
    const options: Array<{ value: VisibilityType; label: string }> = [
      { value: "private", label: "Private (only me)" },
      { value: "public", label: "Public (all users)" },
    ];
    if (isSuperuser) {
      options.push({ value: "system", label: "System (global built-in)" });
    }
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      this.visibilitySelect.appendChild(el);
    }
    const canSelect = options.some((o) => o.value === selected);
    this.visibilitySelect.value = canSelect ? selected : "private";
  }

  // =========================================================================
  // Visibility
  // =========================================================================

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
    if (visible) {
      this.loadSavedDefs();
    } else {
      // Stop preview timer when hidden
      if (this.previewTimer) {
        clearInterval(this.previewTimer);
        this.previewTimer = 0;
      }
    }
  }

  show() {
    this.toggle(true);
  }
  hide() {
    this.toggle(false);
  }

  destroy() {
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.el.remove();
  }
}
