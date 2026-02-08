/**
 * NPC Editor — browse NPC *instances* (placed map objects with category "npc"),
 * assign unique names, and edit backstory, personality, stats, items,
 * relationships, and other profile data used for LLM feeding.
 *
 * Same sprite can be used for many NPCs — each placed instance gets its own
 * identity via npcProfiles, keyed by a unique instance name.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { Game } from "../engine/Game.ts";
import type { Id } from "../../convex/_generated/dataModel";
import "./NpcEditor.css";

// ---------------------------------------------------------------------------
// Types
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
  spriteDefName: string;
  mapName?: string;
  displayName: string;
  title?: string;
  backstory?: string;
  personality?: string;
  dialogueStyle?: string;
  systemPrompt?: string;
  faction?: string;
  knowledge?: string;
  secrets?: string;
  relationships?: Relationship[];
  stats?: NpcStats;
  items?: { name: string; quantity: number }[];
  tags?: string[];
}

const DEFAULT_STATS: NpcStats = {
  hp: 50, maxHp: 50, atk: 5, def: 5, spd: 5, level: 1,
};

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export class NpcEditorPanel {
  readonly el: HTMLElement;
  private game: Game | null = null;

  // Data
  private instances: NpcInstance[] = [];
  private selected: NpcInstance | null = null;
  private currentProfile: NpcProfileData | null = null;

  // DOM — sidebar
  private listEl!: HTMLElement;

  // DOM — main area
  private mainEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private headerSprite!: HTMLElement;
  private headerName!: HTMLElement;
  private headerDef!: HTMLElement;
  private bodyEl!: HTMLElement;
  private statusEl!: HTMLElement;

  // Form inputs
  private instanceNameInput!: HTMLInputElement;
  private displayNameInput!: HTMLInputElement;
  private titleInput!: HTMLInputElement;
  private backstoryArea!: HTMLTextAreaElement;
  private personalityArea!: HTMLTextAreaElement;
  private dialogueStyleInput!: HTMLInputElement;
  private factionInput!: HTMLInputElement;
  private knowledgeArea!: HTMLTextAreaElement;
  private secretsArea!: HTMLTextAreaElement;
  private systemPromptArea!: HTMLTextAreaElement;
  private statInputs: Record<string, HTMLInputElement> = {};

  // Dynamic lists
  private itemsList!: HTMLElement;
  private itemsAddRow!: HTMLElement;
  private tagsList!: HTMLElement;
  private tagsAddRow!: HTMLElement;
  private relList!: HTMLElement;
  private relAddRow!: HTMLElement;

  // Sprite cache
  private spriteCache: Map<string, { img: HTMLImageElement; frame: { x: number; y: number; w: number; h: number } }> = new Map();

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "npc-editor";
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
    sidebar.className = "npc-editor-sidebar";

    const title = document.createElement("h3");
    title.className = "npc-editor-title";
    title.textContent = "NPC Editor";
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
  // BUILD: Main area
  // =========================================================================

  private buildMain(): HTMLElement {
    this.mainEl = document.createElement("div");
    this.mainEl.className = "npc-editor-main";

    // Header
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

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "npc-editor-btn danger";
    deleteBtn.textContent = "Delete Profile";
    deleteBtn.addEventListener("click", () => this.deleteProfile());

    this.statusEl = document.createElement("span");
    this.statusEl.className = "npc-editor-status";

    actions.append(this.statusEl, saveBtn, deleteBtn);
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
      <div style="font-size:12px;color:var(--text-muted)">NPCs appear here after being placed on a map using the<br>Object tool in Build mode. Each instance gets a unique name.</div>`;
    this.bodyEl.appendChild(empty);
  }

  // =========================================================================
  // BUILD: Form
  // =========================================================================

  private buildForm() {
    this.bodyEl.innerHTML = "";

    const leftCol = document.createElement("div");
    leftCol.className = "npc-editor-col";
    const rightCol = document.createElement("div");
    rightCol.className = "npc-editor-col";

    // ---- Left: Identity + Narrative + Knowledge ----

    const identitySec = this.makeSection("Identity");
    this.instanceNameInput = this.addTextField(identitySec, "Instance Name (unique ID)", "e.g. elara-herbalist");
    this.displayNameInput = this.addTextField(identitySec, "Display Name", "e.g. Elara the Herbalist");
    this.titleInput = this.addTextField(identitySec, "Title / Role", "e.g. Village Herbalist");
    this.factionInput = this.addTextField(identitySec, "Faction / Affiliation", "e.g. Forest Druids");

    const tagsLabel = document.createElement("label");
    tagsLabel.style.cssText = "font-size:11px;color:var(--text-muted);";
    tagsLabel.textContent = "Tags";
    this.tagsList = document.createElement("div");
    this.tagsList.className = "npc-editor-tags";
    this.tagsAddRow = document.createElement("div");
    this.tagsAddRow.className = "npc-editor-add-row";
    identitySec.append(tagsLabel, this.tagsList, this.tagsAddRow);
    leftCol.appendChild(identitySec);

    const narrativeSec = this.makeSection("Narrative");
    this.backstoryArea = this.addTextArea(narrativeSec, "Backstory", "Their history, motivations, how they ended up here\u2026", 5);
    this.personalityArea = this.addTextArea(narrativeSec, "Personality", "Traits, quirks, temperament\u2026", 3);
    this.dialogueStyleInput = this.addTextField(narrativeSec, "Dialogue Style", "e.g. formal, cryptic, cheerful, gruff");
    leftCol.appendChild(narrativeSec);

    const knowledgeSec = this.makeSection("Knowledge & Secrets");
    this.knowledgeArea = this.addTextArea(knowledgeSec, "Knowledge", "What this NPC knows about the world\u2026", 3);
    this.secretsArea = this.addTextArea(knowledgeSec, "Secrets", "What they hide from players\u2026", 3);
    leftCol.appendChild(knowledgeSec);

    // ---- Right: Stats + Items + Relationships + System Prompt ----

    const statsSec = this.makeSection("Stats");
    const statsGrid = document.createElement("div");
    statsGrid.className = "npc-editor-stats-grid";
    for (const key of ["hp", "maxHp", "atk", "def", "spd", "level"] as const) {
      const labels: Record<string, string> = { hp: "HP", maxHp: "Max HP", atk: "ATK", def: "DEF", spd: "SPD", level: "Level" };
      this.statInputs[key] = this.addNumberField(statsGrid, labels[key], String(DEFAULT_STATS[key]));
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
    this.relList = document.createElement("div");
    this.relList.className = "npc-editor-rel-list";
    this.relAddRow = document.createElement("div");
    this.relAddRow.className = "npc-editor-add-row";
    relSec.append(this.relList, this.relAddRow);
    rightCol.appendChild(relSec);

    const promptSec = this.makeSection("LLM System Prompt");
    this.systemPromptArea = this.addTextArea(promptSec, "System Prompt", "Full system prompt for LLM conversations. Leave empty to auto-generate from other fields.", 6);
    rightCol.appendChild(promptSec);

    this.bodyEl.append(leftCol, rightCol);

    this.buildItemsAddRow();
    this.buildTagsAddRow();
    this.buildRelAddRow();
  }

  // =========================================================================
  // Helpers: form builders
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

  private addTextField(parent: HTMLElement, label: string, placeholder: string): HTMLInputElement {
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

  private addTextArea(parent: HTMLElement, label: string, placeholder: string, rows: number): HTMLTextAreaElement {
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

  private addNumberField(parent: HTMLElement, label: string, defaultVal: string): HTMLInputElement {
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
    nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
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
        this.currentProfile.items = this.currentProfile.items.filter((i) => i.name !== item.name);
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
    tagIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
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
        this.currentProfile.tags = this.currentProfile.tags.filter((x) => x !== t);
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
      if (!this.currentProfile.relationships) this.currentProfile.relationships = [];
      this.currentProfile.relationships.push({ npcName, relation });
      nameIn.value = "";
      relIn.value = "";
      this.renderRelationships();
    });
    nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") relIn.focus(); });
    relIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });
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
      const instances = await convex.query(api.npcProfiles.listInstances, {});
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
      empty.textContent = "No NPC instances found. Place NPC sprites on maps using the Object tool in Build mode.";
      this.listEl.appendChild(empty);
      return;
    }

    // Group by map
    const byMap = new Map<string, NpcInstance[]>();
    for (const inst of this.instances) {
      const list = byMap.get(inst.mapName) ?? [];
      list.push(inst);
      byMap.set(inst.mapName, list);
    }

    for (const [mapName, insts] of byMap) {
      const mapLabel = document.createElement("div");
      mapLabel.className = "npc-editor-section-label";
      mapLabel.textContent = mapName;
      this.listEl.appendChild(mapLabel);

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
        nameEl.textContent = inst.profile?.displayName || inst.instanceName || inst.spriteDefName;

        const subEl = document.createElement("div");
        subEl.className = "npc-editor-list-sub";
        if (inst.instanceName) {
          subEl.textContent = inst.profile?.title || inst.instanceName;
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

    if (inst.profile) {
      // Deep copy
      this.currentProfile = { ...inst.profile };
      if (inst.profile.relationships) this.currentProfile.relationships = [...inst.profile.relationships];
      if (inst.profile.items) this.currentProfile.items = [...inst.profile.items];
      if (inst.profile.tags) this.currentProfile.tags = [...inst.profile.tags];
      if (inst.profile.stats) this.currentProfile.stats = { ...inst.profile.stats };
    } else {
      // New profile — derive name from spriteDefName + position
      const defaultName = inst.instanceName || "";
      this.currentProfile = {
        name: defaultName,
        spriteDefName: inst.spriteDefName,
        mapName: inst.mapName,
        displayName: inst.spriteDef?.name || inst.spriteDefName,
        stats: { ...DEFAULT_STATS },
        items: [],
        tags: [],
        relationships: [],
      };
    }

    // Header
    this.headerEl.style.display = "";
    this.headerName.textContent = this.currentProfile.displayName;
    this.headerDef.textContent = `${inst.spriteDefName} on ${inst.mapName} (${Math.round(inst.x)}, ${Math.round(inst.y)})`;
    this.headerSprite.innerHTML = "";
    if (inst.spriteDef) this.renderSpriteThumb(this.headerSprite, inst.spriteDef, 48);

    this.buildForm();
    this.populateForm();
    this.renderList();
    this.statusEl.textContent = "";
  }

  // =========================================================================
  // POPULATE / COLLECT form
  // =========================================================================

  private populateForm() {
    const p = this.currentProfile;
    if (!p) return;

    this.instanceNameInput.value = p.name;
    this.displayNameInput.value = p.displayName;
    this.titleInput.value = p.title ?? "";
    this.factionInput.value = p.faction ?? "";
    this.backstoryArea.value = p.backstory ?? "";
    this.personalityArea.value = p.personality ?? "";
    this.dialogueStyleInput.value = p.dialogueStyle ?? "";
    this.knowledgeArea.value = p.knowledge ?? "";
    this.secretsArea.value = p.secrets ?? "";
    this.systemPromptArea.value = p.systemPrompt ?? "";

    const stats = p.stats ?? DEFAULT_STATS;
    for (const key of Object.keys(this.statInputs)) {
      this.statInputs[key].value = String((stats as Record<string, number>)[key] ?? 0);
    }

    this.renderItems();
    this.renderTags();
    this.renderRelationships();
  }

  private collectForm(): NpcProfileData | null {
    if (!this.currentProfile || !this.selected) return null;
    const p = this.currentProfile;

    p.name = this.instanceNameInput.value.trim().toLowerCase().replace(/\s+/g, "-");
    p.displayName = this.displayNameInput.value.trim() || this.selected.spriteDefName;
    p.title = this.titleInput.value.trim() || undefined;
    p.faction = this.factionInput.value.trim() || undefined;
    p.backstory = this.backstoryArea.value.trim() || undefined;
    p.personality = this.personalityArea.value.trim() || undefined;
    p.dialogueStyle = this.dialogueStyleInput.value.trim() || undefined;
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

    return p;
  }

  // =========================================================================
  // SAVE
  // =========================================================================

  private async save() {
    const profile = this.collectForm();
    if (!profile || !this.game || !this.selected) return;

    if (!profile.name) {
      this.statusEl.textContent = "Instance name is required";
      this.statusEl.style.color = "var(--danger)";
      this.instanceNameInput.focus();
      return;
    }

    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      this.statusEl.textContent = "Saving\u2026";
      this.statusEl.style.color = "var(--text-muted)";

      // 1) Assign instance name on the mapObject (if changed or new)
      if (profile.name !== this.selected.instanceName) {
        await convex.mutation(api.npcProfiles.assignInstanceName, {
          profileId: adminId,
          mapObjectId: this.selected.mapObjectId as Id<"mapObjects">,
          instanceName: profile.name,
        });
        this.selected.instanceName = profile.name;
      }

      // 2) Save the NPC profile
      await convex.mutation(api.npcProfiles.save, {
        profileId: adminId,
        name: profile.name,
        spriteDefName: profile.spriteDefName,
        mapName: profile.mapName,
        displayName: profile.displayName,
        title: profile.title,
        backstory: profile.backstory,
        personality: profile.personality,
        dialogueStyle: profile.dialogueStyle,
        systemPrompt: profile.systemPrompt,
        faction: profile.faction,
        knowledge: profile.knowledge,
        secrets: profile.secrets,
        relationships: profile.relationships?.length ? profile.relationships : undefined,
        stats: profile.stats,
        items: profile.items?.length ? profile.items : undefined,
        tags: profile.tags?.length ? profile.tags : undefined,
      });

      // Update local state
      this.selected.profile = { ...profile };

      this.statusEl.textContent = "Saved!";
      this.statusEl.style.color = "var(--success)";
      this.headerName.textContent = profile.displayName;

      // Refresh list to show updated names
      await this.loadData();
      // Re-select (loadData clears selection visually)
      const refreshed = this.instances.find((i) => i.mapObjectId === this.selected?.mapObjectId);
      if (refreshed) {
        this.selected = refreshed;
        this.renderList();
      }

      setTimeout(() => {
        if (this.statusEl.textContent === "Saved!") this.statusEl.textContent = "";
      }, 2000);
    } catch (err: any) {
      console.error("Failed to save NPC profile:", err);
      this.statusEl.textContent = err?.message || "Error saving";
      this.statusEl.style.color = "var(--danger)";
    }
  }

  // =========================================================================
  // DELETE
  // =========================================================================

  private async deleteProfile() {
    if (!this.currentProfile?._id || !this.game) return;
    const convex = getConvexClient();
    const adminId = this.game.profile._id as Id<"profiles">;

    try {
      await convex.mutation(api.npcProfiles.remove, {
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
  // SPRITE: Render thumbnail
  // =========================================================================

  private async renderSpriteThumb(container: HTMLElement, def: { spriteSheetUrl: string; frameWidth: number; frameHeight: number }, size = 28) {
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
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
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

  private drawThumb(container: HTMLElement, img: HTMLImageElement, frame: { x: number; y: number; w: number; h: number }, size: number) {
    const canvas = document.createElement("canvas");
    const scale = Math.max(1, Math.floor(size / Math.max(frame.w, frame.h)));
    canvas.width = frame.w * scale;
    canvas.height = frame.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, canvas.width, canvas.height);
    container.appendChild(canvas);
  }
}
