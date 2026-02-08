/**
 * CharacterPanel – displays and allows editing of the current player's
 * character sprite, stats, items, and other profile info.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { Game } from "../engine/Game.ts";
import type { ProfileData } from "../engine/types.ts";
import type { Id } from "../../convex/_generated/dataModel";
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
  private mapInfo!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private addItemRow!: HTMLElement;

  // Editing state (admin)
  private editedStats: ProfileData["stats"] | null = null;

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
    this.isAdmin = game.profile.role === "admin";
    if (this.isOpen) this.refresh();
  }

  /** Update the profile reference (e.g. after stats change) */
  updateProfile(profile: ProfileData) {
    this.profile = profile;
    this.isAdmin = profile.role === "admin";
    if (this.isOpen) this.refresh();
  }

  toggle(visible: boolean) {
    this.toggleBtn.style.display = visible ? "" : "none";
    if (!visible) this.close();
  }

  show() { this.toggle(true); }
  hide() { this.toggle(false); }
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
    this.itemsGrid = document.createElement("div");
    this.itemsGrid.className = "char-items-grid";
    this.addItemRow = document.createElement("div");
    this.addItemRow.className = "char-add-item-row";
    this.addItemRow.style.display = "none";
    itemsSection.append(itemsTitle, this.itemsGrid, this.addItemRow);

    // NPCs chatted
    const npcSection = document.createElement("div");
    const npcTitle = document.createElement("div");
    npcTitle.className = "char-section-title";
    npcTitle.textContent = "NPCs Met";
    this.npcList = document.createElement("div");
    this.npcList.className = "char-npc-list";
    npcSection.append(npcTitle, this.npcList);

    // Map info
    this.mapInfo = document.createElement("div");
    this.mapInfo.className = "char-map-info";

    body.append(xpSection, statsSection, this.saveBtn, itemsSection, npcSection, this.mapInfo);

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
    const xpPct = xpNeeded > 0 ? Math.min(100, (p.stats.xp / xpNeeded) * 100) : 0;
    this.xpLabel.innerHTML =
      `<span>Experience</span><span>${p.stats.xp} / ${xpNeeded}</span>`;
    this.xpBarFill.style.width = `${xpPct}%`;

    // ---- Stats ----
    this.renderStats(p.stats);

    // ---- Save button ----
    this.saveBtn.style.display = this.isAdmin ? "" : "none";

    // ---- Items ----
    this.renderItems(p.items);

    // ---- Add item row (admin) ----
    this.renderAddItemRow();

    // ---- NPCs ----
    this.renderNpcs(p.npcsChatted);

    // ---- Map info ----
    this.mapInfo.innerHTML = "";
    if (p.mapName) {
      this.mapInfo.innerHTML =
        `Current map: <span class="char-map-name">${p.mapName}</span>`;
    }

    // ---- Sprite ----
    this.loadSprite(p.spriteUrl);
  }

  /* ------------------------------------------------------------------ */
  /*  Stats rendering                                                    */
  /* ------------------------------------------------------------------ */

  private renderStats(stats: ProfileData["stats"]) {
    this.statsGrid.innerHTML = "";

    const statDefs: { key: keyof ProfileData["stats"]; label: string; color: string; max: number }[] = [
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
          const newPct = Math.min(100, (this.editedStats[def.key] / def.max) * 100);
          fill.style.width = `${newPct}%`;
        });
        row.append(label, track, input);
      } else {
        const valueEl = document.createElement("span");
        valueEl.className = "char-stat-value";
        valueEl.textContent = def.key === "hp" ? `${val}/${stats.maxHp}` : String(val);
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

      const nameEl = document.createElement("span");
      nameEl.className = "char-item-name";
      nameEl.textContent = item.name;

      const qtyEl = document.createElement("span");
      qtyEl.className = "char-item-qty";
      qtyEl.textContent = `\u00D7${item.quantity}`;

      el.append(nameEl, qtyEl);

      if (this.isAdmin) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "char-item-remove";
        removeBtn.textContent = "\u00D7";
        removeBtn.title = "Remove item";
        removeBtn.addEventListener("click", () => this.removeItem(item.name));
        el.appendChild(removeBtn);
      }

      this.itemsGrid.appendChild(el);
    }
  }

  private renderAddItemRow() {
    this.addItemRow.innerHTML = "";
    if (!this.isAdmin) {
      this.addItemRow.style.display = "none";
      return;
    }
    this.addItemRow.style.display = "";

    const nameInput = document.createElement("input");
    nameInput.className = "char-add-item-input";
    nameInput.placeholder = "Item name\u2026";

    const qtyInput = document.createElement("input");
    qtyInput.className = "char-add-item-qty";
    qtyInput.type = "number";
    qtyInput.value = "1";
    qtyInput.min = "1";

    const addBtn = document.createElement("button");
    addBtn.className = "char-add-item-btn";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      const qty = parseInt(qtyInput.value) || 1;
      if (!name) return;
      await this.addItem(name, qty);
      nameInput.value = "";
      qtyInput.value = "1";
    });

    // Allow pressing Enter in the item name input
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });

    this.addItemRow.append(nameInput, qtyInput, addBtn);
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
      const frameNames: string[] = animName && json.animations[animName]
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
        this.spriteAnimFrame = (this.spriteAnimFrame + 1) % this.spriteFrames.length;
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
    if (!this.spriteCanvas || !this.spriteImage || this.spriteFrames.length === 0) return;
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

  private async addItem(name: string, quantity: number) {
    if (!this.profile) return;
    const convex = getConvexClient();
    try {
      await convex.mutation(api.profiles.addItem, {
        id: this.profile._id as Id<"profiles">,
        itemName: name,
        quantity,
      });
      // Update local
      const existing = this.profile.items.find((i) => i.name === name);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.profile.items.push({ name, quantity });
      }
      if (this.game) this.game.profile.items = [...this.profile.items];
      this.renderItems(this.profile.items);
    } catch (err) {
      console.error("Failed to add item:", err);
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
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  }
}
