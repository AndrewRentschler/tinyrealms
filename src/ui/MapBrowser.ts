/**
 * MapBrowser – overlay to browse, travel to, and create maps.
 */
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAP_BROWSER_TILESET_OPTIONS } from "../config/tilesheet-config.ts";
import { getConvexClient } from "../lib/convexClient.ts";
// TODO: Uncomment this when music is implemented
// import { MUSIC_OPTIONS } from "../config/music-config.ts";
import "./MapBrowser.css";

// Available tilesets for the "New Map" form
const TILESET_OPTIONS = MAP_BROWSER_TILESET_OPTIONS;

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
  mapType: string;
  combatEnabled: boolean;
  musicUrl?: string;
  creatorProfileId?: string;
  ownedByCurrentUser?: boolean;
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
    this.bodyEl.innerHTML =
      '<div style="padding:20px;text-align:center;color:#888;">Loading maps...</div>';

    try {
      const convex = getConvexClient();
      this.maps = (await convex.query(
        api.maps.listSummaries,
        {},
      )) as MapSummary[];
      this.render();
    } catch (err) {
      this.bodyEl.innerHTML = `<div style="padding:20px;color:#e74c3c;">Failed to load maps: ${err}</div>`;
    }
  }

  private render() {
    this.bodyEl.innerHTML = "";
    const currentMap = this.callbacks.getCurrentMap();

    if (this.maps.length === 0) {
      this.bodyEl.innerHTML =
        '<div style="padding:20px;text-align:center;color:#888;">No maps yet. Create one below!</div>';
    } else {
      const legend = document.createElement("div");
      legend.className = "map-visibility-legend";
      legend.innerHTML = `
        <span class="map-legend-item"><span class="map-badge private">Private</span> owner-only portal targets</span>
        <span class="map-legend-item"><span class="map-badge public">Public</span> superusers can link portals</span>
        <span class="map-legend-item"><span class="map-badge system">System</span> global/start-map eligible</span>
      `;
      this.bodyEl.appendChild(legend);

      const list = document.createElement("div");
      list.className = "map-list";

      for (const m of this.maps) {
        const card = document.createElement("div");
        card.className = `map-card ${m.name === currentMap ? "current" : ""}`;

        // Icon
        const iconEl = document.createElement("div");
        iconEl.className = "map-card-icon";
        iconEl.textContent =
          m.mapType === "system"
            ? "\uD83C\uDFE0"
            : m.combatEnabled
              ? "\u2694"
              : "\uD83D\uDDFA"; // 🏠⚔🗺

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
        if (m.mapType === "system") {
          const b = document.createElement("span");
          b.className = "map-badge system";
          b.textContent = "System";
          badges.appendChild(b);
        } else if (m.mapType === "public") {
          const b = document.createElement("span");
          b.className = "map-badge public";
          b.textContent = "Public";
          badges.appendChild(b);
        } else {
          const b = document.createElement("span");
          b.className = "map-badge private";
          b.textContent = "Private";
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

        // Type controls: owners can set public/private on their own maps.
        // System maps can only be changed by superusers via CLI.
        const isSystemMap = m.mapType === "system";
        const canEditType =
          !isSystemMap && (!!m.ownedByCurrentUser || this.callbacks.isAdmin);
        if (canEditType) {
          const typeWrap = document.createElement("div");
          typeWrap.className = "map-card-badges";
          typeWrap.style.gap = "6px";

          const typeSelect = document.createElement("select");
          typeSelect.className = "profile-select";
          typeSelect.style.maxWidth = "110px";
          typeSelect.innerHTML = `<option value="private">private</option><option value="public">public</option>`;
          typeSelect.value = m.mapType ?? "private";

          const saveTypeBtn = document.createElement("button");
          saveTypeBtn.className = "map-card-travel";
          saveTypeBtn.textContent = "Save Type";
          saveTypeBtn.style.width = "auto";
          saveTypeBtn.style.padding = "8px 10px";
          saveTypeBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            saveTypeBtn.disabled = true;
            const original = saveTypeBtn.textContent;
            saveTypeBtn.textContent = "Saving...";
            try {
              const convex = getConvexClient();
              await convex.mutation((api as any).maps.updateMetadata, {
                profileId: this.callbacks.getProfileId() as Id<"profiles">,
                name: m.name,
                mapType: typeSelect.value,
              } as any);
              saveTypeBtn.textContent = "Saved";
              await this.refresh();
            } catch (err: any) {
              saveTypeBtn.textContent = "Error";
              console.warn("set map type failed:", err);
              setTimeout(() => {
                saveTypeBtn.textContent = original || "Save Type";
                saveTypeBtn.disabled = false;
              }, 900);
              return;
            }
            setTimeout(() => {
              saveTypeBtn.textContent = original || "Save Type";
              saveTypeBtn.disabled = false;
            }, 900);
          });

          typeWrap.append(typeSelect, saveTypeBtn);
          info.appendChild(typeWrap);
        }

        // Actions
        const actionsEl = document.createElement("div");
        actionsEl.className = "map-card-actions";

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

        actionsEl.appendChild(travelBtn);

        // Delete button (owner or superuser only)
        const canDelete = !!m.ownedByCurrentUser || this.callbacks.isAdmin;
        if (canDelete) {
          const deleteBtn = document.createElement("button");
          deleteBtn.className = "map-card-delete";
          deleteBtn.textContent = "Delete";
          if (m.name === currentMap) {
            deleteBtn.disabled = true;
            deleteBtn.title = "Travel to another map before deleting this one.";
          }
          deleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (m.name === currentMap) return;

            const confirmed = window.confirm(
              `Delete map "${m.name}"?\n\nThis will permanently remove the map and its placed objects/items/messages.`,
            );
            if (!confirmed) return;

            const original = deleteBtn.textContent;
            deleteBtn.disabled = true;
            deleteBtn.textContent = "Deleting...";
            try {
              const convex = getConvexClient();
              await convex.mutation((api as any).maps.remove, {
                profileId: this.callbacks.getProfileId() as Id<"profiles">,
                name: m.name,
              });
              await this.refresh();
            } catch (err: any) {
              console.warn("delete map failed:", err);
              window.alert(err?.message ?? "Failed to delete map");
              deleteBtn.textContent = original || "Delete";
              deleteBtn.disabled = false;
            }
          });
          actionsEl.appendChild(deleteBtn);
        }

        card.append(iconEl, info, badges, actionsEl);
        list.appendChild(card);
      }

      this.bodyEl.appendChild(list);
    }

    // Create new map section (any authenticated profile)
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
    widthInput.max = "400";
    widthLabel.appendChild(widthInput);

    const heightLabel = document.createElement("label");
    heightLabel.textContent = "Height (tiles)";
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.value = "30";
    heightInput.min = "10";
    heightInput.max = "400";
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
    tileSizeEl.style.cssText =
      "font-size:11px;color:var(--text-muted);margin-top:4px;";
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
    // TODO: Uncomment this when music is implemented
    // for (const m of MUSIC_OPTIONS) {
    //   const opt = document.createElement("option");
    //   opt.value = m.url;
    //   opt.textContent = m.label;
    //   musicSelect.appendChild(opt);
    // }
    musicLabel.appendChild(musicSelect);

    // Combat toggle
    const combatLabel = document.createElement("label");
    combatLabel.innerHTML = `<span>Combat Enabled</span>`;
    const combatCheck = document.createElement("input");
    combatCheck.type = "checkbox";
    combatLabel.appendChild(combatCheck);

    // Map type (owners: public/private, superusers: +system)
    const mapTypeLabel = document.createElement("label");
    mapTypeLabel.className = "full-width";
    mapTypeLabel.textContent = "Map Type";
    const mapTypeSelect = document.createElement("select");
    mapTypeSelect.innerHTML = `<option value="private">private</option><option value="public">public</option>`;
    mapTypeLabel.appendChild(mapTypeSelect);

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
      const tilesetUrl =
        tsSelect.value || "/assets/tilesets/fantasy-interior.png";
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
          mapType: mapTypeSelect.value,
        } as any);

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
      widthLabel,
      heightLabel,
      tsLabel,
      musicLabel,
      combatLabel,
      mapTypeLabel,
      statusEl,
      actions,
    );

    return form;
  }
}
