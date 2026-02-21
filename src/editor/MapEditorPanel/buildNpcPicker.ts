/**
 * NPC picker (NPC sprite definitions) builder.
 */
import type { SpriteDef } from "./types.ts";
import { visibilityLabel } from "./visibilityLabel.ts";
import {
  createEmptyStateMessage,
  createPickerListItem,
} from "./helpers.ts";

export interface NpcPickerContext {
  spriteDefs: SpriteDef[];
  selectedSpriteDef: SpriteDef | null;
  npcListEl: HTMLElement;
  tileInfoEl: HTMLDivElement;
  loadSpriteDefs(): void;
  renderNpcList(): void;
  updateGhostForCurrentSelection(): void;
}

export function buildNpcPicker(ctx: NpcPickerContext): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "tileset-picker";

  const header = document.createElement("div");
  header.className = "tileset-picker-header";

  const label = document.createElement("div");
  label.className = "tileset-picker-label";
  label.textContent = "NPCs";
  header.appendChild(label);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "editor-tool-btn";
  refreshBtn.textContent = "↻ Refresh";
  refreshBtn.style.fontSize = "11px";
  refreshBtn.addEventListener("click", () => ctx.loadSpriteDefs());
  header.appendChild(refreshBtn);

  picker.appendChild(header);

  const npcListEl = document.createElement("div");
  npcListEl.className = "object-list";
  picker.appendChild(npcListEl);
  (ctx as { npcListEl: HTMLElement }).npcListEl = npcListEl;

  return picker;
}

export function renderNpcList(ctx: NpcPickerContext): void {
  if (!ctx.npcListEl) return;
  ctx.npcListEl.innerHTML = "";

  const npcDefs = ctx.spriteDefs.filter((d) => d.category === "npc");

  if (npcDefs.length === 0) {
    ctx.npcListEl.appendChild(
      createEmptyStateMessage(
        "No NPC sprites yet. Create some in the NPC Editor → NPC Sprites tab!",
      ),
    );
    return;
  }

  for (const def of npcDefs) {
    const vis = visibilityLabel(def.visibilityType);
    const row = createPickerListItem({
      id: def._id,
      label: def.name,
      sublabel: "npc",
      sublabel2: vis,
      sublabel2Class: `object-list-vis ${vis}`,
      isActive: ctx.selectedSpriteDef?._id === def._id,
      onClick: () => {
        (ctx as { selectedSpriteDef: SpriteDef | null }).selectedSpriteDef = def;
        ctx.tileInfoEl.textContent = `NPC: ${def.name}`;
        ctx.renderNpcList();
        ctx.updateGhostForCurrentSelection();
      },
    });
    ctx.npcListEl.appendChild(row);
  }
}
