/**
 * CharacterPanel – displays and allows editing of the current player's
 * character sprite, stats, items, and other profile info.
 */
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Game } from "../engine/Game/index.ts";
import type { ProfileData } from "../engine/types.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import "./CharacterPanel.css";

/** XP required for a given level (simple curve) */
function xpForLevel(level: number): number {
  return level * 100;
}

export class CharacterPanel {
  readonly el: HTMLElement;

  private isOpen = false;
  private toggleBtn: HTMLButtonElement;
  private panel: HTMLElement;

  private game: Game | null = null;
  private profile: ProfileData | null = null;
  private isAdmin = false;

  // Cached DOM refs inside the panel
  private spriteBox!: HTMLElement;
  private nameEl!: HTMLElement;
  private levelTag!: HTMLElement;
  private xpLabel!: HTMLElement;
  private xpBarFill!: HTMLElement;
  private statsGrid!: HTMLElement;
  private itemsGrid!: HTMLElement;
  private npcList!: HTMLElement;
  private completedQuestList!: HTMLElement;
  private mapInfo!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private itemUseStatusEl!: HTMLElement;
  // Editing state (admin)
  private editedStats: ProfileData["stats"] | null = null;
  private itemDefsByName = new Map<
    string,
    { type: string; displayName: string; consumeHpDelta?: number }
  >();
  private itemDefsLoadedKey = "";
  private consumingItem = false;
  private completedQuestRows: Array<{
    _id: string;
    questDefKey: string;
    completedAt?: number;
    questDef?: { title?: string; key?: string } | null;
  }> = [];

  // Sprite animation
  private spriteCanvas: HTMLCanvasElement | null = null;
  private spriteFrames: { x: number; y: number; w: number; h: number }[] = [];
  private spriteImage: HTMLImageElement | null = null;
  private spriteAnimFrame = 0;
  private spriteAnimTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.el = document.createElement("div");

    // Toggle button (bottom-right)
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "char-toggle";
    this.toggleBtn.title = "Character";
    this.toggleBtn.textContent = "\u{1F9D1}"; // 🧑
    this.toggleBtn.addEventListener("click", () => this.open());
    this.el.appendChild(this.toggleBtn);

    // Panel (hidden by default)
    this.panel = document.createElement("div");
    this.panel.className = "char-panel";
    this.panel.style.display = "none";
    this.buildPanel();
    this.el.appendChild(this.panel);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  setGame(game: Game) {
    this.game = game;
    this.profile = game.profile;
    this.isAdmin = game.profile.role === "superuser";
    if (this.isOpen) this.refresh();
  }

  /** Update the profile reference (e.g. after stats change) */
  updateProfile(profile: ProfileData) {
    this.profile = profile;
    this.isAdmin = profile.role === "superuser";
    if (this.isOpen) this.refresh();
  }

  toggle(visible: boolean) {
    this.toggleBtn.style.display = visible ? "" : "none";
    if (!visible) this.close();
  }

  show() {
    this.toggle(true);
  }
  hide() {
    this.toggle(false);
  }
  destroy() {
    this.stopSpriteAnim();
    this.el.remove();
  }

  /* ------------------------------------------------------------------ */
  /*  Panel DOM construction                                             */
  /* ------------------------------------------------------------------ */

  private buildPanel() {
    // ---- Header ----
    const header = document.createElement("div");
    header.className = "char-header";

    this.spriteBox = document.createElement("div");
    this.spriteBox.className = "char-sprite-box";

    const headerInfo = document.createElement("div");
    headerInfo.className = "char-header-info";

    this.nameEl = document.createElement("div");
    this.nameEl.className = "char-name";

    const levelRow = document.createElement("div");
    levelRow.className = "char-level-row";
    this.levelTag = document.createElement("span");
    this.levelTag.className = "char-level-tag";
    levelRow.appendChild(this.levelTag);

    headerInfo.append(this.nameEl, levelRow);

    const closeBtn = document.createElement("button");
    closeBtn.className = "char-close";
    closeBtn.textContent = "\u00D7"; // ×
    closeBtn.addEventListener("click", () => this.close());

    header.append(this.spriteBox, headerInfo, closeBtn);

    // ---- Body ----
    const body = document.createElement("div");
    body.className = "char-body";

    // XP bar
    const xpSection = document.createElement("div");
    xpSection.className = "char-xp-section";
    this.xpLabel = document.createElement("div");
    this.xpLabel.className = "char-xp-label";
    const xpTrack = document.createElement("div");
    xpTrack.className = "char-xp-bar-track";
    this.xpBarFill = document.createElement("div");
    this.xpBarFill.className = "char-xp-bar-fill";
    xpTrack.appendChild(this.xpBarFill);
    xpSection.append(this.xpLabel, xpTrack);

    // Stats
    const statsSection = document.createElement("div");
    const statsTitle = document.createElement("div");
    statsTitle.className = "char-section-title";
    statsTitle.textContent = "Stats";
    this.statsGrid = document.createElement("div");
    this.statsGrid.className = "char-stats-grid";
    statsSection.append(statsTitle, this.statsGrid);

    // Save button (admin only, rendered conditionally)
    this.saveBtn = document.createElement("button");
    this.saveBtn.className = "char-save-btn";
    this.saveBtn.textContent = "Save Stats";
    this.saveBtn.style.display = "none";
    this.saveBtn.addEventListener("click", () => this.saveStats());

    // Items
    const itemsSection = document.createElement("div");
    const itemsTitle = document.createElement("div");
    itemsTitle.className = "char-section-title";
    itemsTitle.textContent = "Items";
    this.itemUseStatusEl = document.createElement("div");
    this.itemUseStatusEl.className = "char-item-use-status";
    this.itemsGrid = document.createElement("div");
    this.itemsGrid.className = "char-items-grid";
    itemsSection.append(itemsTitle, this.itemUseStatusEl, this.itemsGrid);

    // NPCs chatted
    const npcSection = document.createElement("div");
    const npcTitle = document.createElement("div");
    npcTitle.className = "char-section-title";
    npcTitle.textContent = "NPCs Met";
    this.npcList = document.createElement("div");
    this.npcList.className = "char-npc-list";
    npcSection.append(npcTitle, this.npcList);

    // Completed quests
    const completedQuestSection = document.createElement("div");
    const completedQuestTitle = document.createElement("div");
    completedQuestTitle.className = "char-section-title";
    completedQuestTitle.textContent = "Completed Quests";
    this.completedQuestList = document.createElement("div");
    this.completedQuestList.className = "char-completed-quest-list";
    completedQuestSection.append(completedQuestTitle, this.completedQuestList);

    // Map info
    this.mapInfo = document.createElement("div");
    this.mapInfo.className = "char-map-info";

    body.append(
      xpSection,
      statsSection,
      this.saveBtn,
      itemsSection,
      npcSection,
      completedQuestSection,
      this.mapInfo,
    );

    this.panel.append(header, body);
  }

  /* ------------------------------------------------------------------ */
  /*  Open / Close                                                       */
  /* ------------------------------------------------------------------ */

  private open() {
    this.isOpen = true;
    this.toggleBtn.style.display = "none";
    this.panel.style.display = "";
    this.refresh();
  }

  private close() {
    this.isOpen = false;
    this.panel.style.display = "none";
    this.toggleBtn.style.display = "";
    this.editedStats = null;
    this.stopSpriteAnim();
  }

  /* ------------------------------------------------------------------ */
  /*  Refresh all data into DOM                                          */
  /* ------------------------------------------------------------------ */

  private refresh() {
    const p = this.profile;
    if (!p) return;

    // ---- Name + role badge ----
    this.nameEl.innerHTML = "";
    this.nameEl.textContent = p.name;
    const badge = document.createElement("span");
    badge.className = `char-role-badge char-role-badge--${p.role}`;
    badge.textContent = p.role;
    this.nameEl.appendChild(badge);

    // ---- Level ----
    this.levelTag.textContent = `Lv. ${p.stats.level}`;

    // ---- XP bar ----
    const xpNeeded = xpForLevel(p.stats.level);
    const xpPct =
      xpNeeded > 0 ? Math.min(100, (p.stats.xp / xpNeeded) * 100) : 0;
    this.xpLabel.innerHTML = `<span>Experience</span><span>${p.stats.xp} / ${xpNeeded}</span>`;
    this.xpBarFill.style.width = `${xpPct}%`;

    // ---- Stats ----
    this.renderStats(p.stats);

    // ---- Save button ----
    this.saveBtn.style.display = this.isAdmin ? "" : "none";

    // ---- Items ----
    this.renderItems(p.items);
    void this.loadItemMetaForInventory(p.items);

    // ---- NPCs ----
    this.renderNpcs(p.npcsChatted);
    this.renderCompletedQuests();
    void this.loadCompletedQuests();

    // ---- Map info ----
    this.mapInfo.innerHTML = "";
    const currentMap = this.game?.currentMapName ?? p.mapName;
    if (currentMap) {
      this.mapInfo.innerHTML = `Current map: <span class="char-map-name">${currentMap}</span>`;
    }

    // ---- Sprite ----
    this.loadSprite(p.spriteUrl);
  }

  /* ------------------------------------------------------------------ */
  /*  Stats rendering                                                    */
  /* ------------------------------------------------------------------ */

  private renderStats(stats: ProfileData["stats"]) {
    this.statsGrid.innerHTML = "";

    const statDefs: {
      key: keyof ProfileData["stats"];
      label: string;
      color: string;
      max: number;
    }[] = [
      { key: "hp", label: "HP", color: "hp", max: stats.maxHp || 100 },
      { key: "atk", label: "ATK", color: "atk", max: 50 },
      { key: "def", label: "DEF", color: "def", max: 50 },
      { key: "spd", label: "SPD", color: "spd", max: 50 },
    ];

    const displayStats = this.editedStats ?? stats;

    for (const def of statDefs) {
      const row = document.createElement("div");
      row.className = "char-stat-row";

      const label = document.createElement("span");
      label.className = "char-stat-label";
      label.textContent = def.label;

      const track = document.createElement("div");
      track.className = "char-stat-bar-track";
      const fill = document.createElement("div");
      fill.className = `char-stat-bar-fill char-stat-bar-fill--${def.color}`;
      const val = displayStats[def.key];
      const pct = Math.min(100, (val / def.max) * 100);
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      if (this.isAdmin) {
        const input = document.createElement("input");
        input.type = "number";
        input.className = "char-stat-input";
        input.value = String(val);
        input.min = "0";
        input.addEventListener("input", () => {
          if (!this.editedStats) {
            this.editedStats = { ...stats };
          }
          this.editedStats[def.key] = parseInt(input.value) || 0;
          // Update bar live
          const newPct = Math.min(
            100,
            (this.editedStats[def.key] / def.max) * 100,
          );
          fill.style.width = `${newPct}%`;
        });
        row.append(label, track, input);
      } else {
        const valueEl = document.createElement("span");
        valueEl.className = "char-stat-value";
        valueEl.textContent =
          def.key === "hp" ? `${val}/${stats.maxHp}` : String(val);
        row.append(label, track, valueEl);
      }

      this.statsGrid.appendChild(row);
    }

    // maxHp editor (admin only, shown as separate row)
    if (this.isAdmin) {
      const maxHpRow = document.createElement("div");
      maxHpRow.className = "char-stat-row";
      const mLabel = document.createElement("span");
      mLabel.className = "char-stat-label";
      mLabel.textContent = "Max";
      const mSpacer = document.createElement("div");
      mSpacer.className = "char-stat-bar-track";
      mSpacer.style.visibility = "hidden";
      const mInput = document.createElement("input");
      mInput.type = "number";
      mInput.className = "char-stat-input";
      mInput.value = String(displayStats.maxHp);
      mInput.min = "1";
      mInput.addEventListener("input", () => {
        if (!this.editedStats) this.editedStats = { ...stats };
        this.editedStats.maxHp = parseInt(mInput.value) || 1;
      });
      maxHpRow.append(mLabel, mSpacer, mInput);
      this.statsGrid.appendChild(maxHpRow);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Items rendering                                                    */
  /* ------------------------------------------------------------------ */

  private renderItems(items: { name: string; quantity: number }[]) {
    this.itemsGrid.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "char-items-empty";
      empty.textContent = "No items yet";
      this.itemsGrid.appendChild(empty);
      return;
    }

    for (const item of items) {
      const el = document.createElement("div");
      el.className = "char-item";
      const meta = this.itemDefsByName.get(item.name);
      const consumeHpDelta =
        meta?.type === "consumable" ? (meta.consumeHpDelta ?? 0) : undefined;
      const isConsumableClickable = meta?.type === "consumable";
      if (isConsumableClickable) {
        el.classList.add("char-item--consumable");
        const sign = (consumeHpDelta ?? 0) > 0 ? "+" : "";
        el.title = `Click to use (${sign}${consumeHpDelta ?? 0} HP)`;
        el.addEventListener("click", () => this.consumeItem(item.name));
      }

      const nameEl = document.createElement("span");
      nameEl.className = "char-item-name";
      nameEl.textContent = meta?.displayName ?? item.name;

      const qtyEl = document.createElement("span");
      qtyEl.className = "char-item-qty";
      qtyEl.textContent = `\u00D7${item.quantity}`;

      el.append(nameEl, qtyEl);
      if (isConsumableClickable) {
        const effectEl = document.createElement("span");
        effectEl.className = "char-item-effect";
        const delta = consumeHpDelta ?? 0;
        const sign = delta > 0 ? "+" : "";
        effectEl.textContent = `${sign}${delta}HP`;
        el.appendChild(effectEl);
      }

      if (this.isAdmin) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "char-item-remove";
        removeBtn.textContent = "\u00D7";
        removeBtn.title = "Remove item";
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.removeItem(item.name);
        });
        el.appendChild(removeBtn);
      }

      this.itemsGrid.appendChild(el);
    }
  }

  private async loadItemMetaForInventory(
    items: { name: string; quantity: number }[],
  ) {
    const names = [...new Set(items.map((i) => i.name))].sort();
    const key = names.join("|");
    if (key === this.itemDefsLoadedKey) return;
    this.itemDefsLoadedKey = key;

    if (names.length === 0) {
      this.itemDefsByName.clear();
      return;
    }

    try {
      const convex = getConvexClient();
      const defs = (await convex.query(api.items.list, {})) as Array<{
        name: string;
        type: string;
        displayName: string;
        consumeHpDelta?: number;
      }>;
      const byName = new Map<
        string,
        { type: string; displayName: string; consumeHpDelta?: number }
      >();
      for (const def of defs) {
        if (names.includes(def.name)) {
          byName.set(def.name, {
            type: def.type,
            displayName: def.displayName,
            consumeHpDelta: def.consumeHpDelta,
          });
        }
      }
      this.itemDefsByName = byName;
      if (this.isOpen && this.profile) {
        this.renderItems(this.profile.items);
      }
    } catch (err) {
      console.warn("Failed to load item definitions for character panel:", err);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  NPCs list                                                          */
  /* ------------------------------------------------------------------ */

  private renderNpcs(npcsChatted: string[]) {
    this.npcList.innerHTML = "";
    if (npcsChatted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "char-npcs-empty";
      empty.textContent = "None yet";
      this.npcList.appendChild(empty);
      return;
    }
    for (const name of npcsChatted) {
      const tag = document.createElement("span");
      tag.className = "char-npc-tag";
      tag.textContent = name;
      this.npcList.appendChild(tag);
    }
  }

  private renderCompletedQuests() {
    this.completedQuestList.innerHTML = "";
    if (this.completedQuestRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "char-completed-quests-empty";
      empty.textContent = "None yet";
      this.completedQuestList.appendChild(empty);
      return;
    }
    for (const q of this.completedQuestRows) {
      const row = document.createElement("div");
      row.className = "char-completed-quest-row";
      const title = q.questDef?.title ?? q.questDefKey ?? "Quest";
      const when = q.completedAt
        ? new Date(q.completedAt).toLocaleString()
        : "";

      const titleEl = document.createElement("span");
      titleEl.className = "char-completed-quest-title";
      titleEl.textContent = title;
      row.appendChild(titleEl);

      if (when) {
        const dateEl = document.createElement("span");
        dateEl.className = "char-completed-quest-date";
        dateEl.textContent = when;
        row.appendChild(dateEl);
      }
      this.completedQuestList.appendChild(row);
    }
  }

  private async loadCompletedQuests() {
    if (!this.profile) return;
    try {
      const convex = getConvexClient();
      const rows = await convex.query(api.story.quests.listHistory, {
        profileId: this.profile._id as Id<"profiles">,
        status: "completed",
      });
      this.completedQuestRows = (rows ?? []) as any[];
      this.renderCompletedQuests();
    } catch (err) {
      console.warn("Failed to load completed quests:", err);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Sprite preview (animated)                                          */
  /* ------------------------------------------------------------------ */

  private async loadSprite(spriteUrl: string) {
    this.stopSpriteAnim();
    this.spriteBox.innerHTML = "";

    try {
      const resp = await fetch(spriteUrl);
      const json = await resp.json();

      // Resolve image path relative to JSON
      const basePath = spriteUrl.replace(/[^/]+$/, "");
      const imgPath = basePath + (json.meta?.image ?? "");

      const img = new Image();
      img.src = imgPath;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      this.spriteImage = img;

      // Gather frames for the default "down" animation (row0)
      const animName = json.animations ? Object.keys(json.animations)[0] : null;
      const frameNames: string[] =
        animName && json.animations[animName]
          ? json.animations[animName]
          : Object.keys(json.frames).slice(0, 3);

      this.spriteFrames = frameNames.map((name: string) => {
        const f = json.frames[name];
        const fr = f.frame ?? f;
        return { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
      });

      if (this.spriteFrames.length === 0) return;

      const fw = this.spriteFrames[0].w;
      const fh = this.spriteFrames[0].h;

      // Scale to fit the 48x48 box while preserving pixel art
      const maxDim = Math.max(fw, fh);
      const scale = Math.max(1, Math.floor(44 / maxDim));

      const canvas = document.createElement("canvas");
      canvas.width = fw * scale;
      canvas.height = fh * scale;
      this.spriteCanvas = canvas;

      this.spriteBox.appendChild(canvas);
      this.spriteAnimFrame = 0;
      this.drawSpriteFrame();

      // Animate at ~4fps
      this.spriteAnimTimer = setInterval(() => {
        this.spriteAnimFrame =
          (this.spriteAnimFrame + 1) % this.spriteFrames.length;
        this.drawSpriteFrame();
      }, 250);
    } catch {
      // Fallback: colored circle
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:var(--accent);";
      this.spriteBox.appendChild(dot);
    }
  }

  private drawSpriteFrame() {
    if (
      !this.spriteCanvas ||
      !this.spriteImage ||
      this.spriteFrames.length === 0
    )
      return;
    const ctx = this.spriteCanvas.getContext("2d");
    if (!ctx) return;
    const f = this.spriteFrames[this.spriteAnimFrame];
    const cw = this.spriteCanvas.width;
    const ch = this.spriteCanvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.spriteImage, f.x, f.y, f.w, f.h, 0, 0, cw, ch);
  }

  private stopSpriteAnim() {
    if (this.spriteAnimTimer !== null) {
      clearInterval(this.spriteAnimTimer);
      this.spriteAnimTimer = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Convex mutations                                                   */
  /* ------------------------------------------------------------------ */

  private async saveStats() {
    if (!this.profile || !this.editedStats) return;
    const convex = getConvexClient();
    try {
      this.saveBtn.disabled = true;
      this.saveBtn.textContent = "Saving\u2026";
      await convex.mutation(api.profiles.updateStats, {
        id: this.profile._id as Id<"profiles">,
        stats: this.editedStats,
      });
      // Update local profile reference
      this.profile.stats = { ...this.editedStats };
      if (this.game) this.game.profile.stats = { ...this.editedStats };
      this.editedStats = null;
      this.saveBtn.textContent = "Saved!";
      setTimeout(() => {
        this.saveBtn.textContent = "Save Stats";
        this.saveBtn.disabled = false;
      }, 1200);
    } catch (err) {
      console.error("Failed to save stats:", err);
      this.saveBtn.textContent = "Error";
      this.saveBtn.disabled = false;
    }
  }

  private async removeItem(name: string) {
    if (!this.profile) return;
    const convex = getConvexClient();
    try {
      await convex.mutation(api.profiles.removeItem, {
        id: this.profile._id as Id<"profiles">,
        itemName: name,
      });
      // Update local
      this.profile.items = this.profile.items.filter((i) => i.name !== name);
      if (this.game) this.game.profile.items = [...this.profile.items];
      this.renderItems(this.profile.items);
      void this.loadItemMetaForInventory(this.profile.items);
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  }

  private async consumeItem(itemName: string) {
    if (!this.profile || this.consumingItem) return;
    this.consumingItem = true;
    const convex = getConvexClient();
    try {
      const result = await convex.mutation(api.profiles.consumeConsumable, {
        id: this.profile._id as Id<"profiles">,
        itemName,
      });

      this.profile.items = result.items;
      this.profile.stats = result.stats;
      if (this.game) {
        this.game.profile.items = [...result.items];
        this.game.profile.stats = { ...result.stats };
      }

      const sign = result.hpDelta > 0 ? "+" : "";
      this.itemUseStatusEl.textContent = `${result.displayName}: ${sign}${result.hpDelta} HP (${result.hp}/${result.maxHp})`;
      this.itemUseStatusEl.className = `char-item-use-status ${
        result.hpDelta > 0 ? "good" : result.hpDelta < 0 ? "bad" : "neutral"
      }`;
      this.renderStats(this.profile.stats);
      this.renderItems(this.profile.items);
      void this.loadItemMetaForInventory(this.profile.items);
      window.setTimeout(() => {
        this.itemUseStatusEl.textContent = "";
        this.itemUseStatusEl.className = "char-item-use-status";
      }, 1800);
    } catch (err: any) {
      this.itemUseStatusEl.textContent = err?.message ?? "Could not use item";
      this.itemUseStatusEl.className = "char-item-use-status bad";
      window.setTimeout(() => {
        this.itemUseStatusEl.textContent = "";
        this.itemUseStatusEl.className = "char-item-use-status";
      }, 1800);
    }
    this.consumingItem = false;
  }
}
