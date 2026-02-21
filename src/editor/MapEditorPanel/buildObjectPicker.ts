/**
 * Object picker (sprite definitions) builder.
 */
import type { SpriteDef } from "./types.ts";
import { visibilityLabel } from "./visibilityLabel.ts";
import {
  createEmptyStateMessage,
  createPickerListItem,
} from "./helpers.ts";

export interface ObjectPickerContext {
  spriteDefs: SpriteDef[];
  selectedSpriteDef: SpriteDef | null;
  objectListEl: HTMLElement;
  tileInfoEl: HTMLDivElement;
  loadSpriteDefs(): void;
  renderObjectList(): void;
  renderNpcList(): void;
  updateGhostForCurrentSelection(): void;
}

export function buildObjectPicker(ctx: ObjectPickerContext): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "tileset-picker";

  const header = document.createElement("div");
  header.className = "tileset-picker-header";

  const label = document.createElement("div");
  label.className = "tileset-picker-label";
  label.textContent = "Sprites";
  header.appendChild(label);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "editor-tool-btn";
  refreshBtn.textContent = "↻ Refresh";
  refreshBtn.style.fontSize = "11px";
  refreshBtn.addEventListener("click", () => ctx.loadSpriteDefs());
  header.appendChild(refreshBtn);

  picker.appendChild(header);

  const objectListEl = document.createElement("div");
  objectListEl.className = "object-list";
  picker.appendChild(objectListEl);
  (ctx as { objectListEl: HTMLElement }).objectListEl = objectListEl;

  return picker;
}

export function renderObjectList(ctx: ObjectPickerContext): void {
  ctx.objectListEl.innerHTML = "";

  const nonNpcDefs = ctx.spriteDefs.filter((d) => d.category !== "npc");

  if (nonNpcDefs.length === 0) {
    ctx.objectListEl.appendChild(
      createEmptyStateMessage(
        "No object sprites yet. Create some in the Sprite Editor!",
      ),
    );
    return;
  }

  for (const def of nonNpcDefs) {
    const vis = visibilityLabel(def.visibilityType);
    const row = createPickerListItem({
      id: def._id,
      label: def.name,
      sublabel: def.category,
      sublabel2: vis,
      sublabel2Class: `object-list-vis ${vis}`,
      isActive: ctx.selectedSpriteDef?._id === def._id,
      onClick: () => {
        (ctx as { selectedSpriteDef: SpriteDef | null }).selectedSpriteDef = def;
        ctx.tileInfoEl.textContent = `Obj: ${def.name}`;
        ctx.renderObjectList();
        ctx.updateGhostForCurrentSelection();
      },
    });
    ctx.objectListEl.appendChild(row);
  }
}
