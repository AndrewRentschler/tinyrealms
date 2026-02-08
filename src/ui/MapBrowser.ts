/**
 * MapBrowser – overlay to browse, travel to, and create maps.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import "./MapBrowser.css";

// Available tilesets for the "New Map" form
const TILESET_OPTIONS = [
  { label: "Fantasy Interior",  url: "/assets/tilesets/fantasy-interior.png", pw: 768, ph: 7056, tw: 24, th: 24 },
  { label: "Fantasy Exterior",  url: "/assets/tilesets/fantasy-exterior.png", pw: 768, ph: 7056, tw: 24, th: 24 },
  { label: "Forest",            url: "/assets/tilesets/forest.png",           pw: 384, ph: 384,  tw: 24, th: 24 },
  { label: "Gentle",            url: "/assets/tilesets/gentle.png",           pw: 384, ph: 2040, tw: 24, th: 24 },
  { label: "Gentle Objects",    url: "/assets/tilesets/gentle-obj.png",       pw: 384, ph: 2040, tw: 24, th: 24 },
  { label: "Mage City",         url: "/assets/tilesets/magecity.png",         pw: 384, ph: 384,  tw: 24, th: 24 },
  { label: "Mage Objects",      url: "/assets/tilesets/mage-obj.png",         pw: 384, ph: 1536, tw: 24, th: 24 },
  { label: "Overworld Palma",   url: "/assets/tilesets/overworld_palma.png",  pw: 512, ph: 512,  tw: 16, th: 16 },
  { label: "PS1 Camineet",      url: "/assets/tilesets/ps1-camineet.png",     pw: 832, ph: 640,  tw: 16, th: 16 },
  { label: "Mage City (32px)",  url: "/assets/tilesets/mage-city.png",        pw: 256, ph: 1408, tw: 32, th: 32 },
];

// Available background music
const MUSIC_OPTIONS = [
  { label: "(None)", url: "" },
  { label: "Cozy Cottage", url: "/assets/audio/cozy.m4a" },
  { label: "PS1 Town", url: "/assets/audio/ps1-town.mp3" },
  { label: "PS1 Shop", url: "/assets/audio/ps1-shop.mp3" },
  { label: "PS1 Palma", url: "/assets/audio/ps1-palma.mp3" },
  { label: "Battle", url: "/assets/audio/battle.mp3" },
  { label: "Vinyl", url: "/assets/audio/vinyl.mp3" },
  { label: "Rain", url: "/assets/audio/rain.mp3" },
  { label: "Title", url: "/assets/audio/title.mp3" },
  { label: "Mage City", url: "/assets/audio/magecity.mp3" },
];

export interface MapBrowserCallbacks {
  onTravel: (mapName: string) => void;
  getCurrentMap: () => string;
  getProfileId: () => string;
  isAdmin: boolean;
}

interface MapSummary {
  _id: string;
  name: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  status: string;
  isHub: boolean;
  combatEnabled: boolean;
  musicUrl?: string;
  creatorProfileId?: string;
  editors: string[];
  portalCount: number;
  updatedAt: number;
}

export class MapBrowser {
  readonly el: HTMLElement;
  private bodyEl: HTMLElement;
  private callbacks: MapBrowserCallbacks;
  private maps: MapSummary[] = [];
  private createFormVisible = false;

  constructor(callbacks: MapBrowserCallbacks) {
    this.callbacks = callbacks;

    // Overlay
    this.el = document.createElement("div");
    this.el.className = "map-browser-overlay";
    this.el.style.display = "none";
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.hide();
    });

    // Dialog box
    const dialog = document.createElement("div");
    dialog.className = "map-browser";

    // Header
    const header = document.createElement("div");
    header.className = "map-browser-header";
    const h2 = document.createElement("h2");
    h2.textContent = "World Maps";
    const closeBtn = document.createElement("button");
    closeBtn.className = "map-browser-close";
    closeBtn.textContent = "\u2715"; // ✕
    closeBtn.addEventListener("click", () => this.hide());
    header.append(h2, closeBtn);

    // Body
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "map-browser-body";

    dialog.append(header, this.bodyEl);
    this.el.appendChild(dialog);
  }

  async show() {
    this.el.style.display = "flex";
    await this.refresh();
  }

  hide() {
    this.el.style.display = "none";
  }

  toggle() {
    if (this.el.style.display === "none") {
      this.show();
    } else {
      this.hide();
    }
  }

  private async refresh() {
    this.bodyEl.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Loading maps...</div>';

    try {
      const convex = getConvexClient();
      this.maps = (await convex.query(api.maps.listSummaries, {})) as MapSummary[];
      this.render();
    } catch (err) {
      this.bodyEl.innerHTML = `<div style="padding:20px;color:#e74c3c;">Failed to load maps: ${err}</div>`;
    }
  }

  private render() {
    this.bodyEl.innerHTML = "";
    const currentMap = this.callbacks.getCurrentMap();

    if (this.maps.length === 0) {
      this.bodyEl.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No maps yet. Create one below!</div>';
    } else {
      const list = document.createElement("div");
      list.className = "map-list";

      for (const m of this.maps) {
        const card = document.createElement("div");
        card.className = `map-card ${m.name === currentMap ? "current" : ""}`;

        // Icon
        const iconEl = document.createElement("div");
        iconEl.className = "map-card-icon";
        iconEl.textContent = m.isHub ? "\uD83C\uDFE0" : m.combatEnabled ? "\u2694" : "\uD83D\uDDFA"; // 🏠⚔🗺

        // Info
        const info = document.createElement("div");
        info.className = "map-card-info";

        const nameEl = document.createElement("div");
        nameEl.className = "map-card-name";
        nameEl.textContent = m.name;

        const meta = document.createElement("div");
        meta.className = "map-card-meta";
        meta.textContent = `${m.width}x${m.height} tiles  ·  ${m.portalCount} portal${m.portalCount !== 1 ? "s" : ""}`;

        info.append(nameEl, meta);

        // Badges
        const badges = document.createElement("div");
        badges.className = "map-card-badges";
        if (m.isHub) {
          const b = document.createElement("span");
          b.className = "map-badge hub";
          b.textContent = "Hub";
          badges.appendChild(b);
        }
        if (m.status === "draft") {
          const b = document.createElement("span");
          b.className = "map-badge draft";
          b.textContent = "Draft";
          badges.appendChild(b);
        }
        if (m.combatEnabled) {
          const b = document.createElement("span");
          b.className = "map-badge combat";
          b.textContent = "Combat";
          badges.appendChild(b);
        }

        // Travel button
        const travelBtn = document.createElement("button");
        travelBtn.className = "map-card-travel";
        if (m.name === currentMap) {
          travelBtn.textContent = "Current";
          travelBtn.disabled = true;
          travelBtn.style.opacity = "0.5";
        } else {
          travelBtn.textContent = "Travel";
          travelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.callbacks.onTravel(m.name);
            this.hide();
          });
        }

        card.append(iconEl, info, badges, travelBtn);
        list.appendChild(card);
      }

      this.bodyEl.appendChild(list);
    }

    // Create new map section (admin only)
    if (this.callbacks.isAdmin) {
      const section = document.createElement("div");
      section.className = "map-create-section";

      if (!this.createFormVisible) {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "map-create-toggle";
        toggleBtn.textContent = "+ Create New Map";
        toggleBtn.addEventListener("click", () => {
          this.createFormVisible = true;
          this.render();
        });
        section.appendChild(toggleBtn);
      } else {
        section.appendChild(this.buildCreateForm());
      }

      this.bodyEl.appendChild(section);
    }
  }

  private buildCreateForm(): HTMLElement {
    const form = document.createElement("div");
    form.className = "map-create-form";

    // Name
    const nameLabel = document.createElement("label");
    nameLabel.className = "full-width";
    nameLabel.textContent = "Map Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. forest-clearing";
    nameLabel.appendChild(nameInput);

    // Size
    const widthLabel = document.createElement("label");
    widthLabel.textContent = "Width (tiles)";
    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.value = "30";
    widthInput.min = "10";
    widthInput.max = "200";
    widthLabel.appendChild(widthInput);

    const heightLabel = document.createElement("label");
    heightLabel.textContent = "Height (tiles)";
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.value = "30";
    heightInput.min = "10";
    heightInput.max = "200";
    heightLabel.appendChild(heightInput);

    // Tileset (optional — can be changed later in the editor)
    const tsLabel = document.createElement("label");
    tsLabel.className = "full-width";
    tsLabel.textContent = "Tileset (change anytime in editor)";
    const tsSelect = document.createElement("select");
    // Default blank option — uses Fantasy Interior 24x24
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "(Default — pick later)";
    defaultOpt.dataset.pw = "768";
    defaultOpt.dataset.ph = "7056";
    defaultOpt.dataset.tw = "24";
    defaultOpt.dataset.th = "24";
    tsSelect.appendChild(defaultOpt);
    for (const ts of TILESET_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = ts.url;
      opt.textContent = `${ts.label} (${ts.tw}px)`;
      opt.dataset.pw = String(ts.pw);
      opt.dataset.ph = String(ts.ph);
      opt.dataset.tw = String(ts.tw);
      opt.dataset.th = String(ts.th);
      tsSelect.appendChild(opt);
    }

    // Tile size indicator (read-only, derived from tileset)
    const tileSizeEl = document.createElement("div");
    tileSizeEl.style.cssText = "font-size:11px;color:var(--text-muted);margin-top:4px;";
    const updateTileSizeDisplay = () => {
      const sel = tsSelect.options[tsSelect.selectedIndex];
      tileSizeEl.textContent = `Tile size: ${sel.dataset.tw}×${sel.dataset.th}px`;
    };
    updateTileSizeDisplay();
    tsSelect.addEventListener("change", updateTileSizeDisplay);

    tsLabel.appendChild(tsSelect);
    tsLabel.appendChild(tileSizeEl);

    // Music
    const musicLabel = document.createElement("label");
    musicLabel.className = "full-width";
    musicLabel.textContent = "Background Music";
    const musicSelect = document.createElement("select");
    for (const m of MUSIC_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = m.url;
      opt.textContent = m.label;
      musicSelect.appendChild(opt);
    }
    musicLabel.appendChild(musicSelect);

    // Combat toggle
    const combatLabel = document.createElement("label");
    combatLabel.innerHTML = `<span>Combat Enabled</span>`;
    const combatCheck = document.createElement("input");
    combatCheck.type = "checkbox";
    combatLabel.appendChild(combatCheck);

    // Hub toggle
    const hubLabel = document.createElement("label");
    hubLabel.innerHTML = `<span>Is Hub (spawn map)</span>`;
    const hubCheck = document.createElement("input");
    hubCheck.type = "checkbox";
    hubLabel.appendChild(hubCheck);

    // Status message
    const statusEl = document.createElement("div");
    statusEl.className = "map-create-status full-width";

    // Buttons
    const actions = document.createElement("div");
    actions.className = "map-create-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "map-create-btn secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      this.createFormVisible = false;
      this.render();
    });

    const createBtn = document.createElement("button");
    createBtn.className = "map-create-btn primary";
    createBtn.textContent = "Create Map";
    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) {
        statusEl.className = "map-create-status full-width error";
        statusEl.textContent = "Name is required";
        return;
      }

      const selectedTileset = tsSelect.options[tsSelect.selectedIndex];
      // Use Fantasy Interior as fallback when no tileset is explicitly picked
      const tilesetUrl = tsSelect.value || "/assets/tilesets/fantasy-interior.png";
      const tilesetPxW = parseInt(selectedTileset.dataset.pw ?? "768");
      const tilesetPxH = parseInt(selectedTileset.dataset.ph ?? "7056");
      // Tile size is derived from the tileset — not user-editable
      const tileWidth = parseInt(selectedTileset.dataset.tw ?? "24");
      const tileHeight = parseInt(selectedTileset.dataset.th ?? "24");

      createBtn.disabled = true;
      createBtn.textContent = "Creating...";

      try {
        const convex = getConvexClient();
        await convex.mutation(api.maps.create, {
          profileId: this.callbacks.getProfileId() as Id<"profiles">,
          name,
          width: parseInt(widthInput.value) || 30,
          height: parseInt(heightInput.value) || 30,
          tileWidth,
          tileHeight,
          tilesetUrl,
          tilesetPxW,
          tilesetPxH,
          musicUrl: musicSelect.value || undefined,
          combatEnabled: combatCheck.checked,
          isHub: hubCheck.checked,
        });

        statusEl.className = "map-create-status full-width success";
        statusEl.textContent = `Map "${name}" created!`;
        this.createFormVisible = false;

        // Refresh the list
        await this.refresh();
      } catch (err: any) {
        statusEl.className = "map-create-status full-width error";
        statusEl.textContent = err.message || String(err);
        createBtn.disabled = false;
        createBtn.textContent = "Create Map";
      }
    });

    actions.append(cancelBtn, createBtn);

    form.append(
      nameLabel,
      widthLabel, heightLabel,
      tsLabel,
      musicLabel,
      combatLabel, hubLabel,
      statusEl,
      actions,
    );

    return form;
  }
}
