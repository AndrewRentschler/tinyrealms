/**
 * Object picker (sprite definitions) builder.
 */
import { createEmptyStateMessage, createPickerListItem } from "./helpers.ts";
import type { SpriteDef } from "./types.ts";
import { visibilityLabel } from "./visibilityLabel.ts";

export interface ObjectPickerContext {
  spriteDefs: SpriteDef[];
  selectedSpriteDef: SpriteDef | null;
  objectListEl: HTMLElement;
  tileInfoEl: HTMLDivElement;
  placementStorageConfig?: {
    hasStorage: boolean;
    storageCapacity: number;
    storageOwnerType: "public" | "player";
  };
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

  // Storage config section
  const storageConfigEl = document.createElement("div");
  storageConfigEl.className = "object-picker-storage-config";
  storageConfigEl.style.cssText =
    "padding: 8px; border-bottom: 1px solid #333; display: none;";

  const storageTitle = document.createElement("div");
  storageTitle.textContent = "Placement Storage";
  storageTitle.style.cssText =
    "font-size: 11px; font-weight: bold; margin-bottom: 4px; color: #aaa;";
  storageConfigEl.appendChild(storageTitle);

  const hasStorageRow = document.createElement("div");
  hasStorageRow.style.cssText =
    "display: flex; align-items: center; gap: 4px; margin-bottom: 4px;";
  const hasStorageCheck = document.createElement("input");
  hasStorageCheck.type = "checkbox";
  hasStorageCheck.id = "placement-has-storage";
  const hasStorageLabel = document.createElement("label");
  hasStorageLabel.htmlFor = "placement-has-storage";
  hasStorageLabel.textContent = "Add storage";
  hasStorageLabel.style.fontSize = "11px";
  hasStorageRow.append(hasStorageCheck, hasStorageLabel);
  storageConfigEl.appendChild(hasStorageRow);

  const storageFields = document.createElement("div");
  storageFields.style.display = "none";
  storageFields.style.flexDirection = "column";
  storageFields.style.gap = "4px";

  const capacityRow = document.createElement("div");
  capacityRow.style.cssText = "display: flex; align-items: center; gap: 4px;";
  const capacityLabel = document.createElement("span");
  capacityLabel.textContent = "Cap:";
  capacityLabel.style.fontSize = "11px";
  capacityLabel.style.minWidth = "30px";
  const capacityInput = document.createElement("input");
  capacityInput.type = "number";
  capacityInput.value = "10";
  capacityInput.style.cssText =
    "width: 40px; background: #222; border: 1px solid #444; color: white; font-size: 11px; padding: 2px;";
  capacityRow.append(capacityLabel, capacityInput);
  storageFields.appendChild(capacityRow);

  const ownerRow = document.createElement("div");
  ownerRow.style.cssText = "display: flex; align-items: center; gap: 4px;";
  const ownerLabel = document.createElement("span");
  ownerLabel.textContent = "Own:";
  ownerLabel.style.fontSize = "11px";
  ownerLabel.style.minWidth = "30px";
  const ownerSelect = document.createElement("select");
  ownerSelect.style.cssText =
    "flex: 1; background: #222; border: 1px solid #444; color: white; font-size: 11px; padding: 2px;";
  const pubOpt = document.createElement("option");
  pubOpt.value = "public";
  pubOpt.textContent = "Public";
  const privOpt = document.createElement("option");
  privOpt.value = "player";
  privOpt.textContent = "Player";
  ownerSelect.append(pubOpt, privOpt);
  ownerRow.append(ownerLabel, ownerSelect);
  storageFields.appendChild(ownerRow);

  storageConfigEl.appendChild(storageFields);
  picker.appendChild(storageConfigEl);

  const updateConfig = () => {
    ctx.placementStorageConfig = {
      hasStorage: hasStorageCheck.checked,
      storageCapacity: parseInt(capacityInput.value) || 10,
      storageOwnerType: ownerSelect.value as "public" | "player",
    };
    storageFields.style.display = hasStorageCheck.checked ? "flex" : "none";
  };

  hasStorageCheck.addEventListener("change", updateConfig);
  capacityInput.addEventListener("input", updateConfig);
  ownerSelect.addEventListener("change", updateConfig);

  // Expose elements to context for dynamic updates
  (ctx as any)._storageConfigEl = storageConfigEl;
  (ctx as any)._hasStorageCheck = hasStorageCheck;
  (ctx as any)._capacityInput = capacityInput;
  (ctx as any)._ownerSelect = ownerSelect;

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

  // Show storage config if an object is selected
  const storageConfigEl = (ctx as any)._storageConfigEl;
  if (storageConfigEl) {
    storageConfigEl.style.display = ctx.selectedSpriteDef ? "block" : "none";
    if (ctx.selectedSpriteDef) {
      const hasStorageCheck = (ctx as any)._hasStorageCheck;
      const capacityInput = (ctx as any)._capacityInput;
      const ownerSelect = (ctx as any)._ownerSelect;

      // Update defaults from selected sprite
      hasStorageCheck.checked = !!ctx.selectedSpriteDef.hasStorage;
      capacityInput.value = String(ctx.selectedSpriteDef.storageCapacity ?? 10);
      ownerSelect.value = ctx.selectedSpriteDef.storageOwnerType ?? "public";

      ctx.placementStorageConfig = {
        hasStorage: hasStorageCheck.checked,
        storageCapacity: parseInt(capacityInput.value) || 10,
        storageOwnerType: ownerSelect.value as "public" | "player",
      };

      const storageFields = storageConfigEl.querySelector(
        "div:last-child",
      ) as HTMLElement;
      if (storageFields)
        storageFields.style.display = hasStorageCheck.checked ? "flex" : "none";
    }
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
        (ctx as { selectedSpriteDef: SpriteDef | null }).selectedSpriteDef =
          def;
        ctx.tileInfoEl.textContent = `Obj: ${def.name}`;
        ctx.renderObjectList();
        ctx.updateGhostForCurrentSelection();
      },
    });
    ctx.objectListEl.appendChild(row);
  }
}
