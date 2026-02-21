/**
 * NPC Editor — two tabs:
 *
 *  1) "NPC Sprites" — create/edit NPC sprite definitions
 *     (sheet picker, animation preview, NPC-specific fields, save to Convex)
 *
 *  2) "NPC Instances" — browse placed NPC instances on maps,
 *     assign unique names, and edit backstory, personality, stats, items,
 *     relationships, and other profile data used for LLM feeding.
 */
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SOUND_FILES } from "../config/audio-config.ts";
import { NPC_SPRITE_SHEETS } from "../config/spritesheet-config.ts";
import type { Game } from "../engine/Game/index.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import type { VisibilityType } from "../types/visibility.ts";
import "./NpcEditor.css";

// ---------------------------------------------------------------------------
// Types — NPC instances & profiles
// ---------------------------------------------------------------------------

interface NpcInstance {
  mapObjectId: string;
  mapName: string;
  spriteDefName: string;
  instanceName?: string;
  x: number;
  y: number;
  profile: NpcProfileData | null;
  spriteDef: {
    name: string;
    spriteSheetUrl: string;
    frameWidth: number;
    frameHeight: number;
    npcSpeed?: number;
    npcWanderRadius?: number;
    npcGreeting?: string;
  } | null;
}

interface Relationship {
  npcName: string;
  relation: string;
  notes?: string;
}

interface NpcStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  level: number;
}

interface NpcProfileData {
  _id?: string;
  name: string;
  instanceType?: "animal" | "character";
  spriteDefName: string;
  mapName?: string;
  displayName: string;
  title?: string;
  backstory?: string;
  personality?: string;
  dialogueStyle?: string;
  moveSpeed?: number;
  wanderRadius?: number;
  greeting?: string;
  logicKey?: string;
  systemPrompt?: string;
  faction?: string;
  knowledge?: string;
  secrets?: string;
  relationships?: Relationship[];
  stats?: NpcStats;
  items?: { name: string; quantity: number }[];
  tags?: string[];
  aggression?: "low" | "medium" | "high";
  npcType?: "procedural" | "ai";
  aiEnabled?: boolean;
  braintrustSlug?: string;
  aiPolicy?: {
    capabilities?: {
      canChat?: boolean;
      canNavigate?: boolean;
      canPickupItems?: boolean;
      canUseShops?: boolean;
      canCombat?: boolean;
      canAffectQuests?: boolean;
      canUsePortals?: boolean;
    };
  };
  visibilityType?: VisibilityType;
}

const DEFAULT_STATS: NpcStats = {
  hp: 50,
  maxHp: 50,
  atk: 5,
  def: 5,
  spd: 5,
  level: 1,
};

// ---------------------------------------------------------------------------
// Types — Sprite sheets
// ---------------------------------------------------------------------------

interface SheetJson {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
  animations?: Record<string, string[]>;
  meta: { image: string; format: string; scale: string };
}

interface LoadedSheet {
  jsonUrl: string;
  json: SheetJson;
  image: HTMLImageElement;
  animations: Record<string, { x: number; y: number; w: number; h: number }[]>;
  frameWidth: number;
  frameHeight: number;
}

interface SavedNpcDef {
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
  npcSpeed?: number;
  npcWanderRadius?: number;
  npcDirDown?: string;
  npcDirUp?: string;
  npcDirLeft?: string;
  npcDirRight?: string;
  npcGreeting?: string;
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
  visibilityType?: VisibilityType;
}

function visibilityLabel(v?: VisibilityType): string {
  const type = v ?? "system";
  if (type === "private") return "private";
  if (type === "public") return "public";
  return "system";
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type TabId = "sprites" | "instances";

export class NpcEditorPanel {
  readonly el: HTMLElement;
  private game: Game | null = null;

  // Tab state
  private activeTab: TabId = "instances";
  private spritesContent!: HTMLElement;
  private instancesContent!: HTMLElement;
  private tabBtnSprites!: HTMLButtonElement;
  private tabBtnInstances!: HTMLButtonElement;

  // ---- NPC Instances tab (existing) ----
  private instances: NpcInstance[] = [];
  private selected: NpcInstance | null = null;
  private currentProfile: NpcProfileData | null = null;

  // Instance sidebar
  private listEl!: HTMLElement;
  private collapsedMaps = new Set<string>();

  // Instance main area
  private mainEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private headerSprite!: HTMLElement;
  private headerName!: HTMLElement;
  private headerDef!: HTMLElement;
  private bodyEl!: HTMLElement;
  private statusEl!: HTMLElement;

  // Instance form inputs
  private instanceNameInput!: HTMLInputElement;
  private instanceTypeSelect!: HTMLSelectElement;
  private instanceTypeHintEl!: HTMLElement;
  private displayNameInput!: HTMLInputElement;
  private titleInput!: HTMLInputElement;
  private backstoryArea!: HTMLTextAreaElement;
  private personalityArea!: HTMLTextAreaElement;
  private dialogueStyleInput!: HTMLInputElement;
  private moveSpeedInput!: HTMLInputElement;
  private wanderRadiusInput!: HTMLInputElement;
  private greetingArea!: HTMLTextAreaElement;
  private factionInput!: HTMLInputElement;
  private factionFieldEl!: HTMLElement;
  private visibilitySelect!: HTMLSelectElement;
  private aiEnabledCheck!: HTMLInputElement;
  private aggressionSelect!: HTMLSelectElement;
  private braintrustSlugInput!: HTMLInputElement;
  private logicKeyInput!: HTMLInputElement;
  private aiTestMessageInput!: HTMLInputElement;
  private aiTestResultArea!: HTMLTextAreaElement;
  private aiHistoryPane!: HTMLDivElement;
  private aiSectionEl!: HTMLElement;
  private narrativeSectionEl!: HTMLElement;
  private knowledgeSectionEl!: HTMLElement;
  private relationshipsSectionEl!: HTMLElement;
  private promptSectionEl!: HTMLElement;
  private aggressionFieldEl!: HTMLElement;
  private greetingFieldEl!: HTMLElement;
  private knowledgeArea!: HTMLTextAreaElement;
  private secretsArea!: HTMLTextAreaElement;
  private systemPromptArea!: HTMLTextAreaElement;
  private statInputs: Record<string, HTMLInputElement> = {};

  // Instance dynamic lists
  private itemsList!: HTMLElement;
  private itemsAddRow!: HTMLElement;
  private tagsSectionEl!: HTMLElement;
  private tagsList!: HTMLElement;
  private tagsAddRow!: HTMLElement;
  private relList!: HTMLElement;
  private relAddRow!: HTMLElement;

  // Sprite thumb cache
  private spriteCache: Map<
    string,
    {
      img: HTMLImageElement;
      frame: { x: number; y: number; w: number; h: number };
    }
  > = new Map();

  // ---- NPC Sprites tab (new) ----
  private nsLoadedSheet: LoadedSheet | null = null;
  private nsSelectedAnim = "";
  private nsPreviewFrame = 0;
  private nsPreviewTimer = 0;
  private nsSavedDefs: SavedNpcDef[] = [];
  private nsEditingDef: SavedNpcDef | null = null;

  // Sprite editor DOM
  private nsSheetSelect!: HTMLSelectElement;
  private nsSheetCanvas!: HTMLCanvasElement;
  private nsSheetCtx!: CanvasRenderingContext2D;
  private nsAnimList!: HTMLElement;
  private nsPreviewCanvas!: HTMLCanvasElement;
  private nsPreviewCtx!: CanvasRenderingContext2D;
  private nsPreviewLabel!: HTMLElement;

  // Sprite form
  private nsNameInput!: HTMLInputElement;
  private nsSpeedInput!: HTMLInputElement;
  private nsScaleInput!: HTMLInputElement;
  private nsAnchorXInput!: HTMLInputElement;
  private nsAnchorYInput!: HTMLInputElement;
  private nsCollidableCheck!: HTMLInputElement;
  private nsVisibilitySelect!: HTMLSelectElement;
  private nsNpcDirDownInput!: HTMLInputElement;
  private nsNpcDirUpInput!: HTMLInputElement;
  private nsNpcDirLeftInput!: HTMLInputElement;
  private nsNpcDirRightInput!: HTMLInputElement;
  private nsAmbientSoundSelect!: HTMLSelectElement;
  private nsAmbientRadiusInput!: HTMLInputElement;
  private nsAmbientVolumeInput!: HTMLInputElement;
  private nsInteractSoundSelect!: HTMLSelectElement;
  private nsSaveBtn!: HTMLButtonElement;
  private nsDeleteBtn!: HTMLButtonElement;
  private nsStatusEl!: HTMLElement;
  private nsSavedListEl!: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "npc-editor";
    this.el.style.display = "none";

    // Tab bar
    this.el.appendChild(this.buildTabBar());

    // Sprites tab content
    this.spritesContent = this.buildSpritesContent();
    this.el.appendChild(this.spritesContent);

    // Instances tab content (wraps the existing sidebar + main)
    this.instancesContent = document.createElement("div");
    this.instancesContent.className = "npc-editor-instances-content";
    this.instancesContent.appendChild(this.buildSidebar());
    this.instancesContent.appendChild(this.buildMain());
    this.el.appendChild(this.instancesContent);

    this.switchTab("instances");
  }

  // =========================================================================
  // Public API
  // =========================================================================

  setGame(game: Game) {
    this.game = game;
    this.nsRebuildVisibilityOptions(
      (this.nsVisibilitySelect?.value as any) || "private",
    );
    this.rebuildVisibilitySelect(
      (this.visibilitySelect?.value as any) || "private",
    );
  }

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
    if (visible) {
      if (this.activeTab === "instances") this.loadData();
      else this.nsLoadSavedDefs();
    } else {
      if (this.nsPreviewTimer) {
        clearInterval(this.nsPreviewTimer);
        this.nsPreviewTimer = 0;
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
    if (this.nsPreviewTimer) clearInterval(this.nsPreviewTimer);
    this.el.remove();
  }

  // =========================================================================
  // TAB BAR
  // =========================================================================

  private buildTabBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "npc-editor-tab-bar";

    this.tabBtnSprites = document.createElement("button");
    this.tabBtnSprites.className = "npc-editor-tab";
    this.tabBtnSprites.textContent = "NPC Sprites";
    this.tabBtnSprites.addEventListener("click", () =>
      this.switchTab("sprites"),
    );

    this.tabBtnInstances = document.createElement("button");
    this.tabBtnInstances.className = "npc-editor-tab";
    this.tabBtnInstances.textContent = "NPC Instances";
    this.tabBtnInstances.addEventListener("click", () =>
      this.switchTab("instances"),
    );

    bar.append(this.tabBtnSprites, this.tabBtnInstances);
    return bar;
  }

  private switchTab(tab: TabId) {
    this.activeTab = tab;

    this.tabBtnSprites.classList.toggle("active", tab === "sprites");
    this.tabBtnInstances.classList.toggle("active", tab === "instances");

    this.spritesContent.style.display = tab === "sprites" ? "" : "none";
    this.instancesContent.style.display = tab === "instances" ? "" : "none";

    if (tab === "instances") this.loadData();
    else this.nsLoadSavedDefs();
  }

  // #########################################################################
  //
  //  TAB 1: NPC SPRITES — Create / Edit NPC sprite definitions
  //
  // #########################################################################

  private buildSpritesContent(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "npc-editor-sprites-content";

    wrap.appendChild(this.buildNsSidebar());
    wrap.appendChild(this.buildNsCenter());
    wrap.appendChild(this.buildNsDefPanel());
    return wrap;
  }

  // ---- Sidebar: sheet picker + anim list ----

  private buildNsSidebar(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "sprite-editor-sidebar";

    const title = document.createElement("h3");
    title.className = "sprite-editor-title";
    title.textContent = "Sprite Sheets";
    sidebar.appendChild(title);

    this.nsSheetSelect = document.createElement("select");
    this.nsSheetSelect.className = "sprite-editor-select";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Select a sheet —";
    this.nsSheetSelect.appendChild(ph);
    for (const s of NPC_SPRITE_SHEETS) {
      const opt = document.createElement("option");
      opt.value = s.jsonUrl;
      opt.textContent = s.name;
      this.nsSheetSelect.appendChild(opt);
    }
    this.nsSheetSelect.addEventListener("change", () => this.nsOnSheetSelect());
    sidebar.appendChild(this.nsSheetSelect);

    const animLabel = document.createElement("div");
    animLabel.className = "sprite-editor-section-label";
    animLabel.textContent = "Animations";
    sidebar.appendChild(animLabel);

    this.nsAnimList = document.createElement("div");
    this.nsAnimList.className = "sprite-editor-anim-list";
    sidebar.appendChild(this.nsAnimList);

    return sidebar;
  }

  // ---- Center: sheet canvas + preview ----

  private buildNsCenter(): HTMLElement {
    const center = document.createElement("div");
    center.className = "sprite-editor-center";

    const sheetWrap = document.createElement("div");
    sheetWrap.className = "sprite-editor-sheet-wrap";
    this.nsSheetCanvas = document.createElement("canvas");
    this.nsSheetCanvas.className = "sprite-editor-sheet-canvas";
    this.nsSheetCtx = this.nsSheetCanvas.getContext("2d")!;
    this.nsSheetCtx.imageSmoothingEnabled = false;
    sheetWrap.appendChild(this.nsSheetCanvas);
    center.appendChild(sheetWrap);

    const previewWrap = document.createElement("div");
    previewWrap.className = "sprite-editor-preview-wrap";
    this.nsPreviewLabel = document.createElement("div");
    this.nsPreviewLabel.className = "sprite-editor-preview-label";
    this.nsPreviewLabel.textContent = "Preview";
    previewWrap.appendChild(this.nsPreviewLabel);

    this.nsPreviewCanvas = document.createElement("canvas");
    this.nsPreviewCanvas.className = "sprite-editor-preview-canvas";
    this.nsPreviewCanvas.width = 128;
    this.nsPreviewCanvas.height = 128;
    this.nsPreviewCtx = this.nsPreviewCanvas.getContext("2d")!;
    this.nsPreviewCtx.imageSmoothingEnabled = false;
    previewWrap.appendChild(this.nsPreviewCanvas);
    center.appendChild(previewWrap);

    return center;
  }

  // ---- Right panel: definition form + saved NPC list ----

  private buildNsDefPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "sprite-editor-defpanel";

    const title = document.createElement("h3");
    title.className = "sprite-editor-title";
    title.textContent = "NPC Sprite Definitions";
    panel.appendChild(title);

    // Saved NPC sprites list (before form so it's visible without scrolling)
    const savedLabel = document.createElement("div");
    savedLabel.className = "sprite-editor-section-label";
    savedLabel.textContent = "Saved NPC Sprites";
    panel.appendChild(savedLabel);

    this.nsSavedListEl = document.createElement("div");
    this.nsSavedListEl.className = "sprite-editor-saved-list";
    panel.appendChild(this.nsSavedListEl);

    // Form
    const form = document.createElement("div");
    form.className = "sprite-editor-form";

    this.nsNameInput = this.nsAddFormField(
      form,
      "Name",
      "text",
      "My NPC",
    ) as HTMLInputElement;
    this.nsSpeedInput = this.nsAddFormField(
      form,
      "Anim Speed",
      "number",
      "0.15",
    ) as HTMLInputElement;
    this.nsScaleInput = this.nsAddFormField(
      form,
      "Scale",
      "number",
      "1",
    ) as HTMLInputElement;
    this.nsAnchorXInput = this.nsAddFormField(
      form,
      "Anchor X (0–1)",
      "number",
      "0.5",
    ) as HTMLInputElement;
    this.nsAnchorYInput = this.nsAddFormField(
      form,
      "Anchor Y (0–1)",
      "number",
      "1",
    ) as HTMLInputElement;

    // Collidable checkbox
    const colField = document.createElement("div");
    colField.className = "sprite-editor-field sprite-editor-field-row";
    this.nsCollidableCheck = document.createElement("input");
    this.nsCollidableCheck.type = "checkbox";
    this.nsCollidableCheck.id = "ns-collidable-check";
    const colLabel = document.createElement("label");
    colLabel.htmlFor = "ns-collidable-check";
    colLabel.textContent = "Collidable";
    colField.append(this.nsCollidableCheck, colLabel);
    form.appendChild(colField);

    // Visibility scope
    const visField = document.createElement("div");
    visField.className = "sprite-editor-field";
    const visLabel = document.createElement("label");
    visLabel.textContent = "Visibility";
    this.nsVisibilitySelect = document.createElement("select");
    this.nsVisibilitySelect.className = "sprite-editor-select";
    this.nsRebuildVisibilityOptions();
    visField.append(visLabel, this.nsVisibilitySelect);
    form.appendChild(visField);

    // ── NPC Sprite Layout ──
    const npcHeader = document.createElement("div");
    npcHeader.className = "sprite-editor-section-label";
    npcHeader.textContent = "NPC Sprite Layout";
    form.appendChild(npcHeader);

    const dirHeader = document.createElement("div");
    dirHeader.className = "sprite-editor-section-label";
    dirHeader.textContent = "Direction → Animation Row";
    dirHeader.style.marginTop = "4px";
    form.appendChild(dirHeader);

    this.nsNpcDirDownInput = this.nsAddFormField(
      form,
      "Down",
      "text",
      "row0",
    ) as HTMLInputElement;
    this.nsNpcDirUpInput = this.nsAddFormField(
      form,
      "Up",
      "text",
      "row1",
    ) as HTMLInputElement;
    this.nsNpcDirLeftInput = this.nsAddFormField(
      form,
      "Left",
      "text",
      "row3",
    ) as HTMLInputElement;
    this.nsNpcDirRightInput = this.nsAddFormField(
      form,
      "Right",
      "text",
      "row2",
    ) as HTMLInputElement;

    // ── Sounds ──
    const soundHeader = document.createElement("div");
    soundHeader.className = "sprite-editor-section-label";
    soundHeader.textContent = "Sounds";
    form.appendChild(soundHeader);

    const ambField = document.createElement("div");
    ambField.className = "sprite-editor-field";
    const ambLabel = document.createElement("label");
    ambLabel.textContent = "Ambient Sound (loops)";
    this.nsAmbientSoundSelect = this.nsBuildSoundSelect();
    ambField.append(ambLabel, this.nsAmbientSoundSelect);
    form.appendChild(ambField);

    this.nsAmbientRadiusInput = this.nsAddFormField(
      form,
      "Ambient Radius (px)",
      "number",
      "200",
    ) as HTMLInputElement;
    this.nsAmbientVolumeInput = this.nsAddFormField(
      form,
      "Ambient Volume (0–1)",
      "number",
      "0.5",
    ) as HTMLInputElement;

    const intField = document.createElement("div");
    intField.className = "sprite-editor-field";
    const intLabel = document.createElement("label");
    intLabel.textContent = "Interact / Greeting Sound";
    this.nsInteractSoundSelect = this.nsBuildSoundSelect();
    intField.append(intLabel, this.nsInteractSoundSelect);
    form.appendChild(intField);

    // ── Buttons ──
    const btnRow = document.createElement("div");
    btnRow.className = "sprite-editor-btn-row";

    const newBtn = document.createElement("button");
    newBtn.className = "sprite-editor-btn";
    newBtn.textContent = "New";
    newBtn.addEventListener("click", () => this.nsResetForm());
    btnRow.appendChild(newBtn);

    this.nsSaveBtn = document.createElement("button");
    this.nsSaveBtn.className = "sprite-editor-btn accent";
    this.nsSaveBtn.textContent = "💾 Save";
    this.nsSaveBtn.addEventListener("click", () => this.nsSaveDef());
    btnRow.appendChild(this.nsSaveBtn);

    this.nsDeleteBtn = document.createElement("button");
    this.nsDeleteBtn.className = "sprite-editor-btn danger";
    this.nsDeleteBtn.textContent = "🗑 Delete";
    this.nsDeleteBtn.style.display = "none";
    this.nsDeleteBtn.addEventListener("click", () => this.nsDeleteDef());
    btnRow.appendChild(this.nsDeleteBtn);

    form.appendChild(btnRow);

    this.nsStatusEl = document.createElement("div");
    this.nsStatusEl.className = "sprite-editor-status";
    form.appendChild(this.nsStatusEl);

    panel.appendChild(form);
    return panel;
  }

  private nsAddFormField(
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

  private nsBuildSoundSelect(): HTMLSelectElement {
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

  // ---- Sheet loading ----

  private async nsOnSheetSelect() {
    const url = this.nsSheetSelect.value;
    if (!url) return;
    try {
      const resp = await fetch(url);
      const json: SheetJson = await resp.json();
      const basePath = url.substring(0, url.lastIndexOf("/") + 1);
      const imagePath = basePath + json.meta.image;
      const image = await this.nsLoadImage(imagePath);

      const animations: LoadedSheet["animations"] = {};
      if (json.animations) {
        for (const [animName, frameNames] of Object.entries(json.animations)) {
          animations[animName] = frameNames.map((fn) => {
            const f = json.frames[fn]?.frame;
            return f ?? { x: 0, y: 0, w: 32, h: 32 };
          });
        }
      } else {
        animations["default"] = Object.values(json.frames).map((f) => f.frame);
      }

      const firstFrame = Object.values(json.frames)[0]?.frame;
      const fw = firstFrame?.w ?? 32;
      const fh = firstFrame?.h ?? 32;

      this.nsLoadedSheet = {
        jsonUrl: url,
        json,
        image,
        animations,
        frameWidth: fw,
        frameHeight: fh,
      };
      this.nsRenderSheetCanvas();
      this.nsRenderAnimList();
      this.nsSelectAnimation(Object.keys(animations)[0] ?? "");
    } catch (err) {
      console.error("Failed to load sprite sheet:", err);
    }
  }

  private nsLoadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image: " + src));
      img.src = src;
    });
  }

  // ---- Rendering ----

  private nsRenderSheetCanvas() {
    if (!this.nsLoadedSheet) return;
    const { image, frameWidth, frameHeight } = this.nsLoadedSheet;
    const scale = 2;
    const w = image.width * scale;
    const h = image.height * scale;
    this.nsSheetCanvas.width = w;
    this.nsSheetCanvas.height = h;
    this.nsSheetCanvas.style.width = w + "px";
    this.nsSheetCanvas.style.height = h + "px";
    const ctx = this.nsSheetCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
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

  private nsRenderAnimList() {
    this.nsAnimList.innerHTML = "";
    if (!this.nsLoadedSheet) return;
    for (const animName of Object.keys(this.nsLoadedSheet.animations)) {
      const frames = this.nsLoadedSheet.animations[animName];
      const btn = document.createElement("button");
      btn.className = `sprite-editor-anim-btn ${this.nsSelectedAnim === animName ? "active" : ""}`;
      btn.textContent = `${animName} (${frames.length} frames)`;
      btn.addEventListener("click", () => this.nsSelectAnimation(animName));
      this.nsAnimList.appendChild(btn);
    }
  }

  private nsSelectAnimation(name: string) {
    this.nsSelectedAnim = name;
    this.nsPreviewFrame = 0;
    this.nsRenderAnimList();
    this.nsStartPreview();
  }

  private nsStartPreview() {
    if (this.nsPreviewTimer) {
      clearInterval(this.nsPreviewTimer);
      this.nsPreviewTimer = 0;
    }
    if (!this.nsLoadedSheet || !this.nsSelectedAnim) {
      this.nsPreviewCtx.clearRect(0, 0, 128, 128);
      this.nsPreviewLabel.textContent = "Preview";
      return;
    }
    const frames = this.nsLoadedSheet.animations[this.nsSelectedAnim];
    if (!frames || frames.length === 0) return;
    this.nsPreviewLabel.textContent = `Preview: ${this.nsSelectedAnim}`;
    const speed = parseFloat(this.nsSpeedInput.value) || 0.15;
    const intervalMs = Math.max(30, speed * 1000);
    this.nsDrawPreviewFrame(frames);
    this.nsPreviewTimer = window.setInterval(() => {
      this.nsPreviewFrame = (this.nsPreviewFrame + 1) % frames.length;
      this.nsDrawPreviewFrame(frames);
    }, intervalMs);
  }

  private nsDrawPreviewFrame(
    frames: { x: number; y: number; w: number; h: number }[],
  ) {
    if (!this.nsLoadedSheet) return;
    const ctx = this.nsPreviewCtx;
    const f = frames[this.nsPreviewFrame % frames.length];
    ctx.clearRect(0, 0, 128, 128);
    const maxDim = Math.max(f.w, f.h);
    const scale = Math.floor(128 / maxDim) || 1;
    const dw = f.w * scale;
    const dh = f.h * scale;
    const dx = (128 - dw) / 2;
    const dy = (128 - dh) / 2;
    ctx.drawImage(this.nsLoadedSheet.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  }

  // ---- Form ----

  private nsResetForm() {
    this.nsEditingDef = null;
    this.nsNameInput.value = "";
    this.nsSpeedInput.value = "0.15";
    this.nsScaleInput.value = "1";
    this.nsAnchorXInput.value = "0.5";
    this.nsAnchorYInput.value = "1";
    this.nsCollidableCheck.checked = false;
    this.nsRebuildVisibilityOptions("private");
    this.nsNpcDirDownInput.value = "row0";
    this.nsNpcDirUpInput.value = "row1";
    this.nsNpcDirLeftInput.value = "row3";
    this.nsNpcDirRightInput.value = "row2";
    this.nsAmbientSoundSelect.value = "";
    this.nsAmbientRadiusInput.value = "200";
    this.nsAmbientVolumeInput.value = "0.5";
    this.nsInteractSoundSelect.value = "";
    this.nsDeleteBtn.style.display = "none";
    this.nsStatusEl.textContent = "";
  }

  private nsPopulateForm(def: SavedNpcDef) {
    this.nsEditingDef = def;
    this.nsNameInput.value = def.name;
    this.nsSpeedInput.value = String(def.animationSpeed);
    this.nsScaleInput.value = String(def.scale);
    this.nsAnchorXInput.value = String(def.anchorX);
    this.nsAnchorYInput.value = String(def.anchorY);
    this.nsCollidableCheck.checked = def.isCollidable;
    this.nsRebuildVisibilityOptions(def.visibilityType ?? "system");
    this.nsNpcDirDownInput.value = def.npcDirDown ?? "row0";
    this.nsNpcDirUpInput.value = def.npcDirUp ?? "row1";
    this.nsNpcDirLeftInput.value = def.npcDirLeft ?? "row3";
    this.nsNpcDirRightInput.value = def.npcDirRight ?? "row2";
    this.nsAmbientSoundSelect.value = def.ambientSoundUrl ?? "";
    this.nsAmbientRadiusInput.value = String(def.ambientSoundRadius ?? 200);
    this.nsAmbientVolumeInput.value = String(def.ambientSoundVolume ?? 0.5);
    this.nsInteractSoundSelect.value = def.interactSoundUrl ?? "";
    this.nsDeleteBtn.style.display = "";

    // Load the matching sheet & animation
    this.nsSheetSelect.value = def.spriteSheetUrl;
    this.nsOnSheetSelect().then(() => {
      this.nsSelectAnimation(def.defaultAnimation);
    });
  }

  // ---- Save / Delete ----

  private async nsSaveDef() {
    const name = this.nsNameInput.value.trim();
    if (!name) {
      this.nsShowStatus("Name is required", true);
      return;
    }
    if (!this.nsLoadedSheet) {
      this.nsShowStatus("Select a sprite sheet first", true);
      return;
    }
    if (!this.nsSelectedAnim) {
      this.nsShowStatus("Select an animation first", true);
      return;
    }

    this.nsShowStatus("Saving…");
    try {
      const convex = getConvexClient();
      const profileId = this.game?.profile._id as Id<"profiles">;

      await convex.mutation(api.spriteDefinitions.save, {
        profileId,
        name,
        spriteSheetUrl: this.nsLoadedSheet.jsonUrl,
        defaultAnimation: this.nsSelectedAnim,
        animationSpeed: parseFloat(this.nsSpeedInput.value) || 0.15,
        anchorX: parseFloat(this.nsAnchorXInput.value) || 0.5,
        anchorY: parseFloat(this.nsAnchorYInput.value) || 1,
        scale: parseFloat(this.nsScaleInput.value) || 1,
        isCollidable: this.nsCollidableCheck.checked,
        category: "npc",
        visibilityType: this.nsVisibilitySelect.value as any,
        frameWidth: this.nsLoadedSheet.frameWidth,
        frameHeight: this.nsLoadedSheet.frameHeight,
        // Sounds
        ambientSoundUrl: this.nsAmbientSoundSelect.value || undefined,
        ambientSoundRadius: this.nsAmbientSoundSelect.value
          ? parseFloat(this.nsAmbientRadiusInput.value) || 200
          : undefined,
        ambientSoundVolume: this.nsAmbientSoundSelect.value
          ? parseFloat(this.nsAmbientVolumeInput.value) || 0.5
          : undefined,
        interactSoundUrl: this.nsInteractSoundSelect.value || undefined,
        // NPC-specific
        npcDirDown: this.nsNpcDirDownInput.value || "row0",
        npcDirUp: this.nsNpcDirUpInput.value || "row1",
        npcDirLeft: this.nsNpcDirLeftInput.value || "row3",
        npcDirRight: this.nsNpcDirRightInput.value || "row2",
      });

      this.nsShowStatus("Saved ✓");

      // Live-refresh sounds on running entities
      const soundCfg = {
        ambientSoundUrl: this.nsAmbientSoundSelect.value || undefined,
        ambientSoundRadius: this.nsAmbientSoundSelect.value
          ? parseFloat(this.nsAmbientRadiusInput.value) || 200
          : undefined,
        ambientSoundVolume: this.nsAmbientSoundSelect.value
          ? parseFloat(this.nsAmbientVolumeInput.value) || 0.5
          : undefined,
        interactSoundUrl: this.nsInteractSoundSelect.value || undefined,
      };
      if (this.game?.entityLayer)
        this.game.entityLayer.refreshNPCSounds(name, soundCfg);

      this.nsLoadSavedDefs();
    } catch (err: any) {
      console.error("Failed to save NPC sprite definition:", err);
      const msg = err?.message || "Save failed!";
      this.nsShowStatus(
        msg.includes("superuser")
          ? "Save failed: superuser role required"
          : `Save failed: ${msg}`,
        true,
      );
    }
  }

  private async nsDeleteDef() {
    if (!this.nsEditingDef) return;
    if (!confirm(`Delete NPC sprite "${this.nsEditingDef.name}"?`)) return;
    try {
      const convex = getConvexClient();
      const profileId = this.game?.profile._id as Id<"profiles">;
      await convex.mutation(api.spriteDefinitions.remove, {
        profileId,
        id: this.nsEditingDef._id as Id<"spriteDefinitions">,
      });
      this.nsShowStatus("Deleted");
      this.nsResetForm();
      this.nsLoadSavedDefs();
    } catch (err) {
      console.error("Failed to delete NPC sprite definition:", err);
      this.nsShowStatus("Delete failed!", true);
    }
  }

  private nsShowStatus(text: string, isError = false) {
    this.nsStatusEl.textContent = text;
    this.nsStatusEl.style.color = isError ? "#ff4444" : "#88ff88";
    clearTimeout(this._nsStatusTimer);
    this._nsStatusTimer = window.setTimeout(() => {
      this.nsStatusEl.textContent = "";
    }, 3000);
  }
  private _nsStatusTimer = 0;

  // ---- Saved NPC defs list ----

  private async nsLoadSavedDefs() {
    this.nsSavedListEl.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "sprite-editor-empty";
    loading.textContent = "Loading NPC sprites...";
    this.nsSavedListEl.appendChild(loading);

    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.spriteDefinitions.list, {});
      this.nsSavedDefs = (defs as unknown as SavedNpcDef[]).filter(
        (d) => d.category === "npc",
      );
      this.nsRenderSavedList();
    } catch (err) {
      console.warn("Failed to load NPC sprite definitions:", err);
      this.nsSavedListEl.innerHTML = "";
      const errEl = document.createElement("div");
      errEl.className = "sprite-editor-empty";
      errEl.textContent = "Failed to load NPC sprites";
      errEl.style.color = "var(--danger, #e74c3c)";
      this.nsSavedListEl.appendChild(errEl);
    }
  }

  private nsRenderSavedList() {
    this.nsSavedListEl.innerHTML = "";
    if (this.nsSavedDefs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sprite-editor-empty";
      empty.textContent = "No NPC sprites yet. Create one below!";
      this.nsSavedListEl.appendChild(empty);
      return;
    }
    for (const def of this.nsSavedDefs) {
      const row = document.createElement("div");
      row.className = "sprite-editor-saved-row";
      const nameEl = document.createElement("span");
      nameEl.className = "sprite-editor-saved-name";
      nameEl.textContent = def.name;
      const catEl = document.createElement("span");
      catEl.className = "sprite-editor-saved-cat";
      catEl.textContent = "npc";
      const visEl = document.createElement("span");
      visEl.className = `sprite-editor-saved-vis ${visibilityLabel(def.visibilityType)}`;
      visEl.textContent = visibilityLabel(def.visibilityType);
      const editBtn = document.createElement("button");
      editBtn.className = "sprite-editor-btn small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => this.nsPopulateForm(def));
      row.append(nameEl, catEl, visEl, editBtn);
      this.nsSavedListEl.appendChild(row);
    }
  }

  private nsRebuildVisibilityOptions(selected: VisibilityType = "private") {
    if (!this.nsVisibilitySelect) return;
    const isSuperuser = this.game?.profile.role === "superuser";
    this.nsVisibilitySelect.innerHTML = "";
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
      this.nsVisibilitySelect.appendChild(el);
    }
    const canSelect = options.some((o) => o.value === selected);
    this.nsVisibilitySelect.value = canSelect ? selected : "private";
  }

  // #########################################################################
  //
  //  TAB 2: NPC INSTANCES — Manage placed NPC objects
  //
  // #########################################################################

  // =========================================================================
  // BUILD: Instance Sidebar
  // =========================================================================

  private buildSidebar(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "npc-editor-sidebar";

    const title = document.createElement("h3");
    title.className = "npc-editor-title";
    title.textContent = "NPC Instances";
    sidebar.appendChild(title);

    const label = document.createElement("div");
    label.className = "npc-editor-section-label";
    label.textContent = "Placed NPC Instances";
    sidebar.appendChild(label);

    this.listEl = document.createElement("div");
    this.listEl.className = "npc-editor-list";
    sidebar.appendChild(this.listEl);

    return sidebar;
  }

  // =========================================================================
  // BUILD: Instance Main area
  // =========================================================================

  private buildMain(): HTMLElement {
    this.mainEl = document.createElement("div");
    this.mainEl.className = "npc-editor-main";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "npc-editor-header";
    this.headerEl.style.display = "none";

    this.headerSprite = document.createElement("div");
    this.headerSprite.className = "npc-editor-header-sprite";

    const headerInfo = document.createElement("div");
    headerInfo.className = "npc-editor-header-info";
    this.headerName = document.createElement("div");
    this.headerName.className = "npc-editor-header-name";
    this.headerDef = document.createElement("div");
    this.headerDef.className = "npc-editor-header-def";
    headerInfo.append(this.headerName, this.headerDef);

    const actions = document.createElement("div");
    actions.className = "npc-editor-header-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "npc-editor-btn accent";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => this.save());

    const testAiBtn = document.createElement("button");
    testAiBtn.className = "npc-editor-btn";
    testAiBtn.textContent = "Test AI";
    testAiBtn.addEventListener("click", () => this.testAI());

    const clearAiBtn = document.createElement("button");
    clearAiBtn.className = "npc-editor-btn";
    clearAiBtn.textContent = "Clear AI History";
    clearAiBtn.addEventListener("click", () => this.clearAIHistory());

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "npc-editor-btn danger";
    deleteBtn.textContent = "Delete Profile";
    deleteBtn.addEventListener("click", () => this.deleteProfile());

    this.statusEl = document.createElement("span");
    this.statusEl.className = "npc-editor-status";

    actions.append(this.statusEl, saveBtn, testAiBtn, clearAiBtn, deleteBtn);
    this.headerEl.append(this.headerSprite, headerInfo, actions);
    this.mainEl.appendChild(this.headerEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "npc-editor-body";
    this.mainEl.appendChild(this.bodyEl);

    this.showEmptyState();
    return this.mainEl;
  }

  private showEmptyState() {
    this.headerEl.style.display = "none";
    this.bodyEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "npc-editor-empty-state";
    empty.innerHTML = `<div class="npc-editor-empty-icon">\u{1F9D9}</div>
      <div>Select an NPC instance from the list</div>
      <div style="font-size:12px;color:var(--text-muted)">NPCs appear here after being placed on a map using the<br>NPC tool in Build mode.</div>`;
    this.bodyEl.appendChild(empty);
  }

  // =========================================================================
  // BUILD: Instance Form
  // =========================================================================

  private buildForm() {
    this.bodyEl.innerHTML = "";

    const leftCol = document.createElement("div");
    leftCol.className = "npc-editor-col";
    const rightCol = document.createElement("div");
    rightCol.className = "npc-editor-col";

    const identitySec = this.makeSection("Identity");
    this.instanceNameInput = this.addTextField(
      identitySec,
      "Instance Name (auto if blank)",
      "e.g. elara-herbalist",
    );
    this.instanceTypeSelect = this.addSelect(identitySec, "Instance Type", [
      { value: "animal", label: "Animal" },
      { value: "character", label: "Character" },
    ]);
    this.instanceTypeSelect.addEventListener("change", () =>
      this.applyInstanceTypeUI(),
    );
    this.instanceTypeHintEl = document.createElement("div");
    this.instanceTypeHintEl.className = "npc-editor-help";
    this.instanceTypeHintEl.style.cssText =
      "font-size:11px;color:var(--text-muted);line-height:1.35;";
    this.instanceTypeHintEl.textContent =
      "Narrative and AI fields are available only for Character instances.";
    identitySec.appendChild(this.instanceTypeHintEl);
    this.displayNameInput = this.addTextField(
      identitySec,
      "Display Name",
      "e.g. Elara the Herbalist",
    );
    this.titleInput = this.addTextField(
      identitySec,
      "Title / Role",
      "e.g. Village Herbalist",
    );
    this.factionInput = this.addTextField(
      identitySec,
      "Faction / Affiliation",
      "e.g. Forest Druids",
    );
    this.factionFieldEl = this.factionInput.parentElement as HTMLElement;
    this.visibilitySelect = this.addSelect(
      identitySec,
      "Visibility",
      this.getVisibilityOptions(),
    );

    const aiSec = this.makeSection("AI");
    this.aiSectionEl = aiSec;

    const aiEnabledRow = document.createElement("div");
    aiEnabledRow.className = "npc-editor-field npc-editor-field-row";
    this.aiEnabledCheck = document.createElement("input");
    this.aiEnabledCheck.type = "checkbox";
    this.aiEnabledCheck.id = "npc-ai-enabled-check";
    this.aiEnabledCheck.addEventListener("change", () => {
      this.applyAiNpcFieldVisibility();
    });
    const aiEnabledLabel = document.createElement("label");
    aiEnabledLabel.htmlFor = "npc-ai-enabled-check";
    aiEnabledLabel.textContent = "Enable AI chat";
    aiEnabledRow.append(this.aiEnabledCheck, aiEnabledLabel);
    aiSec.appendChild(aiEnabledRow);

    this.braintrustSlugInput = this.addTextField(
      aiSec,
      "Braintrust Slug",
      "e.g. npc-merchant-v1",
    );
    this.logicKeyInput = this.addTextField(
      aiSec,
      "Logic Key (optional)",
      "e.g. pilot.single-character",
    );

    this.aiTestMessageInput = this.addTextField(
      aiSec,
      "Test Message",
      "Hello there",
    );

    const testOutLabel = document.createElement("label");
    testOutLabel.style.cssText = "font-size:11px;color:var(--text-muted);";
    testOutLabel.textContent = "Test AI Output";
    this.aiTestResultArea = document.createElement("textarea");
    this.aiTestResultArea.rows = 4;
    this.aiTestResultArea.readOnly = true;
    this.aiTestResultArea.placeholder = "Test output appears here.";
    this.aiTestResultArea.style.cssText =
      "width:100%;resize:vertical;min-height:84px;background:var(--surface-2);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;padding:8px;font:inherit;";
    aiSec.append(testOutLabel, this.aiTestResultArea);

    const aiHint = document.createElement("div");
    aiHint.style.cssText =
      "font-size:11px;color:var(--text-muted);line-height:1.35;";
    aiHint.textContent =
      "Use System Prompt with Braintrust moustache templates in your slug config.";
    aiSec.appendChild(aiHint);

    this.tagsSectionEl = document.createElement("div");
    const tagsLabel = document.createElement("label");
    tagsLabel.style.cssText = "font-size:11px;color:var(--text-muted);";
    tagsLabel.textContent = "Tags";
    this.tagsList = document.createElement("div");
    this.tagsList.className = "npc-editor-tags";
    this.tagsAddRow = document.createElement("div");
    this.tagsAddRow.className = "npc-editor-add-row";
    this.tagsSectionEl.append(tagsLabel, this.tagsList, this.tagsAddRow);
    identitySec.appendChild(this.tagsSectionEl);
    leftCol.appendChild(identitySec);
    leftCol.appendChild(aiSec);

    const narrativeSec = this.makeSection("Narrative");
    this.narrativeSectionEl = narrativeSec;
    this.backstoryArea = this.addTextArea(
      narrativeSec,
      "Backstory",
      "Their history, motivations, how they ended up here\u2026",
      5,
    );
    this.personalityArea = this.addTextArea(
      narrativeSec,
      "Personality",
      "Traits, quirks, temperament\u2026",
      3,
    );
    this.dialogueStyleInput = this.addTextField(
      narrativeSec,
      "Dialogue Style",
      "e.g. formal, cryptic, cheerful, gruff",
    );
    leftCol.appendChild(narrativeSec);

    const behaviorSec = this.makeSection("Behavior");
    this.moveSpeedInput = this.addNumberField(
      behaviorSec,
      "Move Speed (px/sec)",
      "30",
    );
    this.wanderRadiusInput = this.addNumberField(
      behaviorSec,
      "Wander Radius (px)",
      "60",
    );
    this.greetingArea = this.addTextArea(
      behaviorSec,
      "Greetings",
      "Hello there! I don't have much to say yet.",
      3,
    );
    this.greetingFieldEl = this.greetingArea.parentElement as HTMLElement;
    this.aggressionSelect = this.addSelect(
      behaviorSec,
      "Temperament / Aggression",
      [
        { value: "low", label: "Timid / Low (flee + counter only)" },
        {
          value: "medium",
          label: "Neutral / Medium (retaliates once engaged)",
        },
        { value: "high", label: "Hostile / High (attacks on proximity)" },
      ],
    );
    this.aggressionFieldEl = this.aggressionSelect.parentElement as HTMLElement;
    leftCol.appendChild(behaviorSec);

    const knowledgeSec = this.makeSection("Knowledge & Secrets");
    this.knowledgeSectionEl = knowledgeSec;
    this.knowledgeArea = this.addTextArea(
      knowledgeSec,
      "Knowledge",
      "What this NPC knows about the world\u2026",
      3,
    );
    this.secretsArea = this.addTextArea(
      knowledgeSec,
      "Secrets",
      "What they hide from players\u2026",
      3,
    );
    leftCol.appendChild(knowledgeSec);

    const statsSec = this.makeSection("Stats");
    const statsGrid = document.createElement("div");
    statsGrid.className = "npc-editor-stats-grid";
    for (const key of ["hp", "maxHp", "atk", "def", "spd", "level"] as const) {
      const labels: Record<string, string> = {
        hp: "HP",
        maxHp: "Max HP",
        atk: "ATK",
        def: "DEF",
        spd: "SPD",
        level: "Level",
      };
      this.statInputs[key] = this.addNumberField(
        statsGrid,
        labels[key],
        String(DEFAULT_STATS[key]),
      );
    }
    statsSec.appendChild(statsGrid);
    rightCol.appendChild(statsSec);

    const itemsSec = this.makeSection("Inventory");
    this.itemsList = document.createElement("div");
    this.itemsList.className = "npc-editor-items-list";
    this.itemsAddRow = document.createElement("div");
    this.itemsAddRow.className = "npc-editor-add-row";
    itemsSec.append(this.itemsList, this.itemsAddRow);
    rightCol.appendChild(itemsSec);

    const relSec = this.makeSection("Relationships");
    this.relationshipsSectionEl = relSec;
    this.relList = document.createElement("div");
    this.relList.className = "npc-editor-rel-list";
    this.relAddRow = document.createElement("div");
    this.relAddRow.className = "npc-editor-add-row";
    relSec.append(this.relList, this.relAddRow);
    rightCol.appendChild(relSec);

    const promptSec = this.makeSection("LLM System Prompt");
    this.promptSectionEl = promptSec;
    this.systemPromptArea = this.addTextArea(
      promptSec,
      "System Prompt",
      "Full system prompt for LLM conversations. Leave empty to auto-generate from other fields.",
      6,
    );
    const historyLabel = document.createElement("label");
    historyLabel.textContent = "Message History (latest 20)";
    historyLabel.style.cssText = "font-size:11px;color:var(--text-muted);";
    this.aiHistoryPane = document.createElement("div");
    this.aiHistoryPane.style.cssText =
      "max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface-2);font-size:12px;line-height:1.35;white-space:pre-wrap;";
    this.aiHistoryPane.textContent = "No message history yet.";
    promptSec.append(historyLabel, this.aiHistoryPane);
    rightCol.appendChild(promptSec);

    this.bodyEl.append(leftCol, rightCol);

    this.buildItemsAddRow();
    this.buildTagsAddRow();
    this.buildRelAddRow();
  }

  // =========================================================================
  // Helpers: Instance form builders
  // =========================================================================

  private makeSection(title: string): HTMLElement {
    const sec = document.createElement("div");
    sec.className = "npc-editor-section";
    const h = document.createElement("h4");
    h.className = "npc-editor-section-title";
    h.textContent = title;
    sec.appendChild(h);
    return sec;
  }

  private addTextField(
    parent: HTMLElement,
    label: string,
    placeholder: string,
  ): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "npc-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    field.append(lbl, input);
    parent.appendChild(field);
    return input;
  }

  private addTextArea(
    parent: HTMLElement,
    label: string,
    placeholder: string,
    rows: number,
  ): HTMLTextAreaElement {
    const field = document.createElement("div");
    field.className = "npc-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const ta = document.createElement("textarea");
    ta.placeholder = placeholder;
    ta.rows = rows;
    field.append(lbl, ta);
    parent.appendChild(field);
    return ta;
  }

  private addNumberField(
    parent: HTMLElement,
    label: string,
    defaultVal: string,
  ): HTMLInputElement {
    const field = document.createElement("div");
    field.className = "npc-editor-field";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.value = defaultVal;
    input.min = "0";
    field.append(lbl, input);
    parent.appendChild(field);
    return input;
  }

  private addSelect(
    parent: HTMLElement,
    label: string,
    options: Array<{ value: string; label: string }>,
  ): HTMLSelectElement {
    const field = document.createElement("div");
    field.className = "npc-editor-field";
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

  private getVisibilityOptions(): Array<{
    value: VisibilityType;
    label: string;
  }> {
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

  // =========================================================================
  // Dynamic lists: Items
  // =========================================================================

  private buildItemsAddRow() {
    this.itemsAddRow.innerHTML = "";
    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.placeholder = "Item name\u2026";
    const qtyIn = document.createElement("input");
    qtyIn.type = "number";
    qtyIn.value = "1";
    qtyIn.min = "1";
    const addBtn = document.createElement("button");
    addBtn.className = "npc-editor-btn small";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const name = nameIn.value.trim();
      const qty = parseInt(qtyIn.value) || 1;
      if (!name || !this.currentProfile) return;
      if (!this.currentProfile.items) this.currentProfile.items = [];
      const existing = this.currentProfile.items.find((i) => i.name === name);
      if (existing) existing.quantity += qty;
      else this.currentProfile.items.push({ name, quantity: qty });
      nameIn.value = "";
      qtyIn.value = "1";
      this.renderItems();
    });
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
    this.itemsAddRow.append(nameIn, qtyIn, addBtn);
  }

  private renderItems() {
    this.itemsList.innerHTML = "";
    const items = this.currentProfile?.items ?? [];
    if (items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "npc-editor-empty";
      empty.textContent = "No items";
      this.itemsList.appendChild(empty);
      return;
    }
    for (const item of items) {
      const tag = document.createElement("div");
      tag.className = "npc-editor-item-tag";
      tag.innerHTML = `<span>${item.name}</span><span class="npc-editor-item-qty">\u00D7${item.quantity}</span>`;
      const rm = document.createElement("button");
      rm.className = "npc-editor-item-remove";
      rm.textContent = "\u00D7";
      rm.addEventListener("click", () => {
        if (!this.currentProfile?.items) return;
        this.currentProfile.items = this.currentProfile.items.filter(
          (i) => i.name !== item.name,
        );
        this.renderItems();
      });
      tag.appendChild(rm);
      this.itemsList.appendChild(tag);
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
    addBtn.className = "npc-editor-btn small";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const tag = tagIn.value.trim();
      if (!tag || !this.currentProfile) return;
      if (!this.currentProfile.tags) this.currentProfile.tags = [];
      if (this.currentProfile.tags.includes(tag)) return;
      this.currentProfile.tags.push(tag);
      tagIn.value = "";
      this.renderTags();
    });
    tagIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
    this.tagsAddRow.append(tagIn, addBtn);
  }

  private renderTags() {
    this.tagsList.innerHTML = "";
    for (const t of this.currentProfile?.tags ?? []) {
      const el = document.createElement("span");
      el.className = "npc-editor-tag";
      el.textContent = t;
      const rm = document.createElement("button");
      rm.className = "npc-editor-tag-remove";
      rm.textContent = "\u00D7";
      rm.addEventListener("click", () => {
        if (!this.currentProfile?.tags) return;
        this.currentProfile.tags = this.currentProfile.tags.filter(
          (x) => x !== t,
        );
        this.renderTags();
      });
      el.appendChild(rm);
      this.tagsList.appendChild(el);
    }
  }

  // =========================================================================
  // Dynamic lists: Relationships
  // =========================================================================

  private buildRelAddRow() {
    this.relAddRow.innerHTML = "";
    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.placeholder = "NPC name\u2026";
    nameIn.style.flex = "1";
    const relIn = document.createElement("input");
    relIn.type = "text";
    relIn.placeholder = "Relation\u2026";
    relIn.style.flex = "1";
    const addBtn = document.createElement("button");
    addBtn.className = "npc-editor-btn small";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      const npcName = nameIn.value.trim();
      const relation = relIn.value.trim();
      if (!npcName || !relation || !this.currentProfile) return;
      if (!this.currentProfile.relationships)
        this.currentProfile.relationships = [];
      this.currentProfile.relationships.push({ npcName, relation });
      nameIn.value = "";
      relIn.value = "";
      this.renderRelationships();
    });
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") relIn.focus();
    });
    relIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
    this.relAddRow.append(nameIn, relIn, addBtn);
  }

  private renderRelationships() {
    this.relList.innerHTML = "";
    const rels = this.currentProfile?.relationships ?? [];
    if (rels.length === 0) {
      const empty = document.createElement("span");
      empty.className = "npc-editor-empty";
      empty.textContent = "No relationships";
      this.relList.appendChild(empty);
      return;
    }
    for (let i = 0; i < rels.length; i++) {
      const r = rels[i];
      const row = document.createElement("div");
      row.className = "npc-editor-rel-row";
      row.innerHTML = `<span class="npc-editor-rel-name">${r.npcName}</span><span class="npc-editor-rel-type">${r.relation}</span>`;
      const rm = document.createElement("button");
      rm.className = "npc-editor-rel-remove";
      rm.textContent = "\u00D7";
      const idx = i;
      rm.addEventListener("click", () => {
        if (!this.currentProfile?.relationships) return;
        this.currentProfile.relationships.splice(idx, 1);
        this.renderRelationships();
      });
      row.appendChild(rm);
      this.relList.appendChild(row);
    }
  }

  // =========================================================================
  // DATA: Load NPC instances from Convex
  // =========================================================================

  private async loadData() {
    const convex = getConvexClient();
    try {
      const instances = await convex.query(
        api.npcProfiles.queries.listInstances,
        {},
      );
      this.instances = instances as NpcInstance[];
      this.renderList();
    } catch (err) {
      console.error("Failed to load NPC instances:", err);
    }
  }

  // =========================================================================
  // RENDER: Instance list in sidebar
  // =========================================================================

  private renderList() {
    this.listEl.innerHTML = "";

    if (this.instances.length === 0) {
      const empty = document.createElement("div");
      empty.className = "npc-editor-empty";
      empty.textContent =
        "No NPC instances found. Place NPC sprites on maps using the NPC tool in Build mode.";
      this.listEl.appendChild(empty);
      return;
    }

    const byMap = new Map<string, NpcInstance[]>();
    for (const inst of this.instances) {
      const list = byMap.get(inst.mapName) ?? [];
      list.push(inst);
      byMap.set(inst.mapName, list);
    }

    for (const [mapName, insts] of byMap) {
      const isCollapsed = this.collapsedMaps.has(mapName);
      const mapLabel = document.createElement("button");
      mapLabel.className = "npc-editor-section-label npc-editor-map-header";
      mapLabel.type = "button";
      mapLabel.textContent = `${isCollapsed ? "▸" : "▾"} ${mapName} (${insts.length})`;
      mapLabel.addEventListener("click", () => {
        if (this.collapsedMaps.has(mapName)) this.collapsedMaps.delete(mapName);
        else this.collapsedMaps.add(mapName);
        this.renderList();
      });
      this.listEl.appendChild(mapLabel);

      if (isCollapsed) continue;

      for (const inst of insts) {
        const isSelected = this.selected?.mapObjectId === inst.mapObjectId;
        const item = document.createElement("button");
        item.className = `npc-editor-list-item ${isSelected ? "active" : ""}`;

        const spriteBox = document.createElement("div");
        spriteBox.className = "npc-editor-list-sprite";
        if (inst.spriteDef) this.renderSpriteThumb(spriteBox, inst.spriteDef);

        const info = document.createElement("div");
        info.className = "npc-editor-list-info";

        const nameEl = document.createElement("div");
        nameEl.className = "npc-editor-list-name";
        nameEl.textContent =
          inst.profile?.displayName || inst.instanceName || inst.spriteDefName;

        const subEl = document.createElement("div");
        subEl.className = "npc-editor-list-sub";
        if (inst.instanceName) {
          subEl.textContent = inst.profile?.title || inst.instanceName;
          if (inst.profile) {
            const typeTag = document.createElement("span");
            if (inst.profile.instanceType === "animal") {
              typeTag.className = "npc-editor-type-tag animal";
              typeTag.textContent = "🐾 Animal";
              subEl.appendChild(typeTag);
            } else {
              typeTag.className = "npc-editor-type-tag ai";
              typeTag.textContent = "🤖 AI";
              subEl.appendChild(typeTag);
            }
            const vis = visibilityLabel(inst.profile.visibilityType);
            const visTag = document.createElement("span");
            visTag.className = `npc-editor-vis-tag ${vis}`;
            visTag.textContent = vis;
            subEl.appendChild(visTag);
          }
        } else {
          subEl.textContent = "\u26A0 No name assigned";
          subEl.style.color = "var(--warning)";
        }

        info.append(nameEl, subEl);
        item.append(spriteBox, info);
        item.addEventListener("click", () => this.selectInstance(inst));
        this.listEl.appendChild(item);
      }
    }
  }

  // =========================================================================
  // SELECT: Load or create profile for instance
  // =========================================================================

  private selectInstance(inst: NpcInstance) {
    this.selected = inst;
    this.collapsedMaps.delete(inst.mapName);

    if (inst.profile) {
      this.currentProfile = { instanceType: "character", ...inst.profile };
      if (inst.profile.relationships)
        this.currentProfile.relationships = [...inst.profile.relationships];
      if (inst.profile.items)
        this.currentProfile.items = [...inst.profile.items];
      if (inst.profile.tags) this.currentProfile.tags = [...inst.profile.tags];
      if (inst.profile.stats)
        this.currentProfile.stats = { ...inst.profile.stats };
    } else {
      const defaultName = inst.instanceName || "";
      this.currentProfile = {
        name: defaultName,
        instanceType: "character",
        spriteDefName: inst.spriteDefName,
        mapName: inst.mapName,
        displayName: inst.spriteDef?.name || inst.spriteDefName,
        moveSpeed: inst.spriteDef?.npcSpeed ?? 30,
        wanderRadius: inst.spriteDef?.npcWanderRadius ?? 60,
        greeting: inst.spriteDef?.npcGreeting,
        npcType: "ai",
        aiEnabled: false,
        aggression: "medium",
        aiPolicy: { capabilities: { canChat: true } },
        stats: { ...DEFAULT_STATS },
        items: [],
        tags: [],
        relationships: [],
      };
    }

    this.headerEl.style.display = "";
    this.headerName.textContent = this.currentProfile.displayName;
    this.headerDef.textContent = `${inst.spriteDefName} on ${inst.mapName} (${Math.round(inst.x)}, ${Math.round(inst.y)})`;
    this.headerSprite.innerHTML = "";
    if (inst.spriteDef)
      this.renderSpriteThumb(this.headerSprite, inst.spriteDef, 48);

    this.buildForm();
    this.populateForm();
    this.renderList();
    this.statusEl.textContent = "";
  }

  // =========================================================================
  // POPULATE / COLLECT instance form
  // =========================================================================

  private populateForm() {
    const p = this.currentProfile;
    if (!p) return;

    this.instanceNameInput.value = p.name;
    this.instanceTypeSelect.value = p.instanceType ?? "character";
    this.displayNameInput.value = p.displayName;
    this.titleInput.value = p.title ?? "";
    this.factionInput.value = p.faction ?? "";
    this.rebuildVisibilitySelect(
      p.visibilityType ?? (p._id ? "system" : "private"),
    );
    this.aiEnabledCheck.checked = !!p.aiEnabled;
    this.aggressionSelect.value = p.aggression ?? "medium";
    this.braintrustSlugInput.value = p.braintrustSlug ?? "";
    this.logicKeyInput.value = p.logicKey ?? "";
    this.aiTestMessageInput.value =
      this.aiTestMessageInput.value || "Hello there";
    this.aiTestResultArea.value = "";
    this.backstoryArea.value = p.backstory ?? "";
    this.personalityArea.value = p.personality ?? "";
    this.dialogueStyleInput.value = p.dialogueStyle ?? "";
    this.moveSpeedInput.value = String(
      p.moveSpeed ?? this.selected?.spriteDef?.npcSpeed ?? 30,
    );
    this.wanderRadiusInput.value = String(
      p.wanderRadius ?? this.selected?.spriteDef?.npcWanderRadius ?? 60,
    );
    this.greetingArea.value =
      p.greeting ?? this.selected?.spriteDef?.npcGreeting ?? "";
    this.knowledgeArea.value = p.knowledge ?? "";
    this.secretsArea.value = p.secrets ?? "";
    this.systemPromptArea.value = p.systemPrompt ?? "";

    const stats = p.stats ?? DEFAULT_STATS;
    for (const key of Object.keys(this.statInputs)) {
      this.statInputs[key].value = String(
        (stats as unknown as Record<string, number>)[key] ?? 0,
      );
    }

    this.renderItems();
    this.renderTags();
    this.renderRelationships();
    this.applyInstanceTypeUI();
    if (!this.isAnimalInstanceType()) {
      void this.loadConversationHistory();
    } else if (this.aiHistoryPane) {
      this.aiHistoryPane.textContent =
        "Conversation history is disabled for animal instances.";
    }
  }

  private async loadConversationHistory() {
    if (!this.currentProfile?.name || !this.aiHistoryPane) return;
    this.aiHistoryPane.textContent = "Loading history…";
    try {
      const convex = getConvexClient();
      const rows = (await convex.query(
        (api as any).npc.memory.listConversation,
        {
          npcProfileName: this.currentProfile.name,
          limit: 20,
        },
      )) as Array<{ role: string; content: string; createdAt?: number }>;
      if (!rows || rows.length === 0) {
        this.aiHistoryPane.textContent = "No message history yet.";
        return;
      }
      this.aiHistoryPane.innerHTML = "";
      for (const r of rows) {
        const line = document.createElement("div");
        line.style.cssText =
          "margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed var(--border);";
        const who = String(r.role || "unknown");
        const ts = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
        line.textContent = `${who}${ts ? ` • ${ts}` : ""}\n${String(r.content || "")}`;
        this.aiHistoryPane.appendChild(line);
      }
      this.aiHistoryPane.scrollTop = this.aiHistoryPane.scrollHeight;
    } catch (err: any) {
      this.aiHistoryPane.textContent = `Failed to load history: ${err?.message || "unknown error"}`;
    }
  }

  private isAnimalInstanceType(): boolean {
    return this.instanceTypeSelect?.value === "animal";
  }

  private applyInstanceTypeUI() {
    const isAnimal = this.isAnimalInstanceType();
    if (!this.currentProfile) return;

    this.currentProfile.instanceType = isAnimal ? "animal" : "character";

    if (this.instanceTypeHintEl) {
      this.instanceTypeHintEl.style.display = isAnimal ? "" : "none";
    }
    if (this.aiSectionEl) {
      this.aiSectionEl.style.display = isAnimal ? "none" : "";
    }
    if (this.narrativeSectionEl) {
      this.narrativeSectionEl.style.display = isAnimal ? "none" : "";
    }
    if (this.knowledgeSectionEl) {
      this.knowledgeSectionEl.style.display = isAnimal ? "none" : "";
    }
    if (this.relationshipsSectionEl) {
      this.relationshipsSectionEl.style.display = isAnimal ? "none" : "";
    }
    if (this.promptSectionEl) {
      this.promptSectionEl.style.display = isAnimal ? "none" : "";
    }
    if (this.aggressionFieldEl) {
      this.aggressionFieldEl.style.display = isAnimal ? "" : "none";
    }
    if (this.greetingFieldEl) {
      this.greetingFieldEl.style.display = isAnimal ? "none" : "";
    }

    if (isAnimal) {
      this.aiEnabledCheck.checked = false;
    }
    this.applyAiNpcFieldVisibility();
  }

  private applyAiNpcFieldVisibility() {
    const isAnimal = this.isAnimalInstanceType();
    const isAi = !isAnimal;
    if (this.factionFieldEl)
      this.factionFieldEl.style.display = isAi ? "none" : "";
    if (this.tagsSectionEl)
      this.tagsSectionEl.style.display = isAi ? "none" : "";
  }

  private collectForm(): NpcProfileData | null {
    if (!this.currentProfile || !this.selected) return null;
    const p = this.currentProfile;
    const isAnimal = this.isAnimalInstanceType();
    const isAiMode = !isAnimal;

    p.name = this.instanceNameInput.value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    p.instanceType = isAnimal ? "animal" : "character";
    p.displayName =
      this.displayNameInput.value.trim() || this.selected.spriteDefName;
    p.title = this.titleInput.value.trim() || undefined;
    p.faction = isAiMode
      ? undefined
      : this.factionInput.value.trim() || undefined;
    p.visibilityType = this.visibilitySelect.value as any;
    p.aiEnabled = isAnimal ? false : this.aiEnabledCheck.checked;
    if (isAnimal) {
      p.aggression = this.aggressionSelect.value as "low" | "medium" | "high";
      p.npcType = "procedural";
    } else {
      p.npcType = "ai";
    }
    p.braintrustSlug = this.braintrustSlugInput.value.trim() || undefined;
    p.logicKey = this.logicKeyInput.value.trim() || undefined;
    p.aiPolicy = {
      capabilities: {
        ...(p.aiPolicy?.capabilities ?? {}),
        canChat: !isAnimal,
      },
    };
    p.backstory = this.backstoryArea.value.trim() || undefined;
    p.personality = this.personalityArea.value.trim() || undefined;
    p.dialogueStyle = this.dialogueStyleInput.value.trim() || undefined;
    p.moveSpeed = Math.max(0, parseFloat(this.moveSpeedInput.value) || 0);
    p.wanderRadius = Math.max(0, parseFloat(this.wanderRadiusInput.value) || 0);
    p.greeting = this.greetingArea.value.trim() || undefined;
    p.knowledge = this.knowledgeArea.value.trim() || undefined;
    p.secrets = this.secretsArea.value.trim() || undefined;
    p.systemPrompt = this.systemPromptArea.value.trim() || undefined;
    p.mapName = this.selected.mapName;
    p.spriteDefName = this.selected.spriteDefName;

    p.stats = {
      hp: parseInt(this.statInputs.hp.value) || 0,
      maxHp: parseInt(this.statInputs.maxHp.value) || 0,
      atk: parseInt(this.statInputs.atk.value) || 0,
      def: parseInt(this.statInputs.def.value) || 0,
      spd: parseInt(this.statInputs.spd.value) || 0,
      level: parseInt(this.statInputs.level.value) || 1,
    };

    if (isAiMode) {
      p.tags = undefined;
    }

    return p;
  }

  // =========================================================================
  // SAVE instance profile
  // =========================================================================

  private async save() {
    const profile = this.collectForm();
    if (!profile || !this.game || !this.selected) return;

    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      this.statusEl.textContent = "Saving\u2026";
      this.statusEl.style.color = "var(--text-muted)";

      if (
        profile.name !== this.selected.instanceName ||
        !this.selected.instanceName
      ) {
        const assignResult = await convex.mutation(
          api.npcProfiles.mutations.assignInstanceName,
          {
            profileId: adminId,
            mapObjectId: this.selected.mapObjectId as Id<"mapObjects">,
            instanceName: profile.name,
          },
        );
        const finalName =
          String((assignResult as any)?.instanceName || "").trim() ||
          profile.name;
        profile.name = finalName;
        this.selected.instanceName = finalName;
        this.instanceNameInput.value = finalName;
      }

      if (!profile.name) {
        throw new Error("Unable to assign an instance name");
      }

      await convex.mutation(api.npcProfiles.mutations.save, {
        profileId: adminId,
        name: profile.name,
        instanceType: profile.instanceType,
        spriteDefName: profile.spriteDefName,
        mapName: profile.mapName,
        displayName: profile.displayName,
        title: profile.title,
        backstory: profile.backstory,
        personality: profile.personality,
        dialogueStyle: profile.dialogueStyle,
        moveSpeed: profile.moveSpeed,
        wanderRadius: profile.wanderRadius,
        greeting: profile.greeting,
        systemPrompt: profile.systemPrompt,
        faction: profile.faction,
        knowledge: profile.knowledge,
        secrets: profile.secrets,
        relationships: profile.relationships?.length
          ? profile.relationships
          : undefined,
        stats: profile.stats,
        items: profile.items?.length ? profile.items : undefined,
        tags: profile.tags?.length ? profile.tags : undefined,
        aggression: profile.aggression,
        npcType: profile.npcType,
        aiEnabled: profile.aiEnabled,
        braintrustSlug: profile.braintrustSlug,
        logicKey: profile.logicKey,
        aiPolicy: profile.aiPolicy,
        visibilityType: profile.visibilityType,
      });

      this.selected.profile = { ...profile };

      this.statusEl.textContent = "Saved!";
      this.statusEl.style.color = "var(--success)";
      this.headerName.textContent = profile.displayName;

      await this.loadData();
      const refreshed = this.instances.find(
        (i) => i.mapObjectId === this.selected?.mapObjectId,
      );
      if (refreshed) {
        this.selected = refreshed;
        this.renderList();
      }

      setTimeout(() => {
        if (this.statusEl.textContent === "Saved!")
          this.statusEl.textContent = "";
      }, 2000);
    } catch (err: any) {
      console.error("Failed to save NPC profile:", err);
      this.statusEl.textContent = err?.message || "Error saving";
      this.statusEl.style.color = "var(--danger)";
    }
  }

  private async testAI() {
    const profile = this.collectForm();
    if (!profile || !this.game || !this.selected) return;
    if (profile.instanceType === "animal") {
      this.statusEl.textContent = "AI testing is disabled for animal instances";
      this.statusEl.style.color = "var(--danger)";
      return;
    }

    if (!profile.name) {
      this.statusEl.textContent = "Instance name is required before test";
      this.statusEl.style.color = "var(--danger)";
      this.instanceNameInput.focus();
      return;
    }
    if (!profile.aiEnabled) {
      this.statusEl.textContent = "Enable AI chat first";
      this.statusEl.style.color = "var(--danger)";
      return;
    }

    const message = this.aiTestMessageInput.value.trim() || "Hello there";
    const convex = getConvexClient();
    this.aiTestResultArea.value = "Running AI test…";
    this.statusEl.textContent = "Testing AI…";
    this.statusEl.style.color = "var(--text-muted)";

    try {
      // Ensure profile exists in DB. If not, ask user to save first.
      const existing = await convex.query(api.npcProfiles.queries.getByName, {
        name: profile.name,
      });
      if (!existing) {
        this.aiTestResultArea.value =
          "Profile not found in Convex. Save this NPC profile first, then re-run Test AI.";
        this.statusEl.textContent = "Save profile first";
        this.statusEl.style.color = "var(--danger)";
        return;
      }

      const result = await convex.action(api.npc.braintrust.generateResponse, {
        npcProfileName: profile.name,
        playerMessage: message,
      });

      const reply = String(
        (result as { response?: string })?.response ?? "",
      ).trim();
      this.aiTestResultArea.value = reply || "(No reply text)";
      await this.loadConversationHistory();
      this.statusEl.textContent = "AI test OK";
      this.statusEl.style.color = "var(--success)";
    } catch (err: any) {
      const msg = err?.message || "AI test failed";
      this.aiTestResultArea.value = msg;
      this.statusEl.textContent = "AI test failed";
      this.statusEl.style.color = "var(--danger)";
    }
  }

  private async clearAIHistory() {
    if (!this.game || !this.currentProfile?._id) {
      this.statusEl.textContent = "Save profile first";
      this.statusEl.style.color = "var(--danger)";
      return;
    }
    const name = this.currentProfile.name || "(unnamed)";
    const ok = confirm(
      `Clear AI history for "${name}"?\n\nThis deletes saved conversation turns and memory summary for this NPC.`,
    );
    if (!ok) return;

    const convex = getConvexClient();
    this.statusEl.textContent = "Clearing AI history…";
    this.statusEl.style.color = "var(--text-muted)";
    try {
      const result = await convex.mutation(
        api.npcProfiles.mutations.clearConversationHistory,
        {
          profileId: this.game.profile._id as Id<"profiles">,
          npcProfileId: this.currentProfile._id as Id<"npcProfiles">,
        },
      );
      const conv = Number((result as any)?.conversationsDeleted ?? 0);
      const mem = Number((result as any)?.memoriesDeleted ?? 0);
      this.aiTestResultArea.value = `Cleared history for ${name}.\nConversations deleted: ${conv}\nMemory rows deleted: ${mem}`;
      await this.loadConversationHistory();
      this.statusEl.textContent = "AI history cleared";
      this.statusEl.style.color = "var(--success)";
    } catch (err: any) {
      this.statusEl.textContent = err?.message || "Failed to clear AI history";
      this.statusEl.style.color = "var(--danger)";
    }
  }

  // =========================================================================
  // DELETE instance profile
  // =========================================================================

  private async deleteProfile() {
    if (!this.currentProfile?._id || !this.game) return;
    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      await convex.mutation(api.npcProfiles.mutations.remove, {
        profileId: adminId,
        id: this.currentProfile._id as Id<"npcProfiles">,
      });
      this.currentProfile = null;
      this.selected = null;
      this.showEmptyState();
      await this.loadData();
    } catch (err) {
      console.error("Failed to delete NPC profile:", err);
    }
  }

  // =========================================================================
  // SPRITE: Render thumbnail (instances tab)
  // =========================================================================

  private async renderSpriteThumb(
    container: HTMLElement,
    def: { spriteSheetUrl: string; frameWidth: number; frameHeight: number },
    size = 28,
  ) {
    const cached = this.spriteCache.get(def.spriteSheetUrl);
    if (cached) {
      this.drawThumb(container, cached.img, cached.frame, size);
      return;
    }
    try {
      const resp = await fetch(def.spriteSheetUrl);
      const json = await resp.json();
      const basePath = def.spriteSheetUrl.replace(/[^/]+$/, "");
      const imgPath = basePath + (json.meta?.image ?? "");
      const img = new Image();
      img.src = imgPath;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
      });
      const frameKeys = Object.keys(json.frames);
      if (frameKeys.length === 0) return;
      const first = json.frames[frameKeys[0]];
      const f = first.frame ?? first;
      const frame = { x: f.x, y: f.y, w: f.w, h: f.h };
      this.spriteCache.set(def.spriteSheetUrl, { img, frame });
      this.drawThumb(container, img, frame, size);
    } catch {
      const dot = document.createElement("div");
      dot.style.cssText = `width:${size * 0.6}px;height:${size * 0.6}px;border-radius:50%;background:var(--accent);`;
      container.appendChild(dot);
    }
  }

  private drawThumb(
    container: HTMLElement,
    img: HTMLImageElement,
    frame: { x: number; y: number; w: number; h: number },
    size: number,
  ) {
    const canvas = document.createElement("canvas");
    const scale = Math.max(1, Math.floor(size / Math.max(frame.w, frame.h)));
    canvas.width = frame.w * scale;
    canvas.height = frame.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    container.appendChild(canvas);
  }
}
