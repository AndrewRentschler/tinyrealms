/**
 * Inventory splash – grid of item slots with use/drop.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface InventorySlot {
  name: string;
  quantity: number;
  type: string;
  description?: string;
}

export interface InventorySplashProps extends SplashScreenCallbacks {
  slots: InventorySlot[];
  onUse?: (index: number) => void;
  onDrop?: (index: number) => void;
}

export function createInventorySplash(props: InventorySplashProps): SplashScreen {
  const { slots, onUse, onDrop, onClose } = props;

  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:24px 32px;min-width:400px;max-width:480px;";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;";
  const h2 = document.createElement("h2");
  h2.style.cssText = "font-size:18px;font-weight:600;";
  h2.textContent = "Inventory";
  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:none;color:var(--text-muted);font-size:20px;cursor:pointer;border:none;";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => onClose());
  header.append(h2, closeBtn);
  card.appendChild(header);

  if (slots.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "color:var(--text-muted);font-size:14px;text-align:center;padding:24px;";
    empty.textContent = "Your inventory is empty.";
    card.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";
    slots.forEach((slot, i) => {
      const cell = document.createElement("div");
      cell.style.cssText = "padding:10px;background:var(--bg-hover);border-radius:var(--radius-sm);position:relative;";

      const name = document.createElement("div");
      name.style.cssText = "font-size:13px;font-weight:500;";
      name.textContent = slot.name;

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:11px;color:var(--text-muted);";
      meta.textContent = `x${slot.quantity} \u00B7 ${slot.type}`;

      const btns = document.createElement("div");
      btns.style.cssText = "display:flex;gap:4px;margin-top:6px;";

      const useBtn = document.createElement("button");
      useBtn.style.cssText = "padding:2px 8px;background:var(--accent);color:white;border-radius:2px;font-size:11px;cursor:pointer;border:none;";
      useBtn.textContent = "Use";
      useBtn.addEventListener("click", () => onUse?.(i));

      const dropBtn = document.createElement("button");
      dropBtn.style.cssText = "padding:2px 8px;background:var(--danger);color:white;border-radius:2px;font-size:11px;cursor:pointer;border:none;";
      dropBtn.textContent = "Drop";
      dropBtn.addEventListener("click", () => onDrop?.(i));

      btns.append(useBtn, dropBtn);
      cell.append(name, meta, btns);
      grid.appendChild(cell);
    });
    card.appendChild(grid);
  }

  el.appendChild(card);

  return {
    el,
    destroy() { el.remove(); },
  };
}
