/**
 * Map editor DOM helpers: form rows, empty states, picker list items, dropdown close.
 */

/** Shared input/select style for editor form controls */
export const EDITOR_INPUT_STYLE =
  "flex:1;padding:4px;background:#181825;color:#eee;border:1px solid #444;border-radius:4px;font-size:12px;";

/** Shared empty state message style */
const EMPTY_STATE_STYLE =
  "color:var(--text-muted);font-size:12px;padding:12px;font-style:italic;";

/** Inline empty state (for portal/label lists that use innerHTML) */
const EMPTY_STATE_INLINE_STYLE = "color:#888;font-size:12px;";

export interface EditorFormRowOptions {
  labelMinWidth?: string;
  inputType?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  /** For select: array of {value, label} */
  selectOptions?: { value: string; label: string }[];
  /** Assign input/select to a ref (e.g. this.mapNameInput = inp) */
  assignRef?: (el: HTMLInputElement | HTMLSelectElement) => void;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
}

/**
 * Create a form row with label + input or select.
 * Use for map picker, portal form, etc.
 */
export function createEditorFormRow(
  labelText: string,
  options: EditorFormRowOptions = {},
): HTMLElement {
  const {
    labelMinWidth = "80px",
    inputType = "text",
    inputPlaceholder = "",
    inputValue,
    selectOptions,
    assignRef,
    onInput,
    onChange,
  } = options;

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:4px;align-items:center;";

  const lbl = document.createElement("span");
  lbl.textContent = labelText;
  lbl.style.minWidth = labelMinWidth;

  if (selectOptions) {
    const sel = document.createElement("select");
    sel.style.cssText = EDITOR_INPUT_STYLE;
    for (const opt of selectOptions) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    if (inputValue !== undefined) sel.value = inputValue;
    sel.addEventListener("change", () => {
      onChange?.(sel.value);
      onInput?.(sel.value);
    });
    assignRef?.(sel as HTMLSelectElement);
    row.append(lbl, sel);
    return row;
  }

  const inp = document.createElement("input");
  inp.type = inputType;
  inp.placeholder = inputPlaceholder;
  if (inputValue !== undefined) {
    inp.value = inputValue;
    onChange?.(inputValue);
  }
  inp.style.cssText = EDITOR_INPUT_STYLE;
  inp.addEventListener("input", () => {
    onChange?.(inp.value);
    onInput?.(inp.value);
  });
  assignRef?.(inp);
  row.append(lbl, inp);
  return row;
}

/**
 * Create an empty state message div (for object/NPC/item lists).
 */
export function createEmptyStateMessage(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.style.cssText = EMPTY_STATE_STYLE;
  empty.textContent = message;
  return empty;
}

/**
 * Create inline empty state HTML (for portal/label lists that replace innerHTML).
 */
export function createEmptyStateInline(message: string): string {
  return `<div style="${EMPTY_STATE_INLINE_STYLE}">${message}</div>`;
}

export interface PickerListItemConfig {
  id: string;
  label: string;
  sublabel?: string;
  sublabel2?: string;
  sublabel2Class?: string;
  isActive: boolean;
  onClick: () => void;
  /** Optional content before label (e.g. icon span) */
  leadingContent?: HTMLElement;
}

/**
 * Create a picker list item (object-list-item) for object/NPC/item pickers.
 */
export function createPickerListItem(config: PickerListItemConfig): HTMLButtonElement {
  const { id, label, sublabel, sublabel2, sublabel2Class, isActive, onClick, leadingContent } =
    config;

  const row = document.createElement("button");
  row.className = `object-list-item ${isActive ? "active" : ""}`;
  row.dataset.id = id;

  if (leadingContent) row.appendChild(leadingContent);

  const nameSpan = document.createElement("span");
  nameSpan.className = "object-list-name";
  nameSpan.textContent = label;
  row.appendChild(nameSpan);

  if (sublabel !== undefined) {
    const catSpan = document.createElement("span");
    catSpan.className = "object-list-cat";
    catSpan.textContent = sublabel;
    row.appendChild(catSpan);
  }

  if (sublabel2 !== undefined) {
    const visSpan = document.createElement("span");
    visSpan.className = sublabel2Class ?? "object-list-vis";
    visSpan.textContent = sublabel2;
    row.appendChild(visSpan);
  }

  row.addEventListener("click", onClick);
  return row;
}

/**
 * Setup document click listener to close dropdown when clicking outside.
 * Returns an unbind function to remove the listener (call in destroy()).
 */
export function setupDropdownCloseOnClickOutside(
  wrapEl: HTMLElement,
  menuEl: HTMLElement,
  onClose?: () => void,
): () => void {
  const handler = (e: MouseEvent) => {
    if (!wrapEl.contains(e.target as Node)) {
      menuEl.style.display = "none";
      onClose?.();
    }
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
