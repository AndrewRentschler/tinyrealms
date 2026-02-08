/**
 * Shop splash – item list with buy buttons.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface ShopItem {
  name: string;
  price: number;
  currency: string;
  description?: string;
  stock?: number;
}

export interface ShopSplashProps extends SplashScreenCallbacks {
  shopName?: string;
  items: ShopItem[];
  playerCurrency?: Record<string, number>;
  onBuy?: (index: number) => void;
}

export function createShopSplash(props: ShopSplashProps): SplashScreen {
  const { shopName, items, playerCurrency, onBuy, onClose } = props;

  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:24px 32px;min-width:400px;max-width:560px;";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;";
  const h2 = document.createElement("h2");
  h2.style.cssText = "font-size:18px;font-weight:600;";
  h2.textContent = shopName ?? "Shop";
  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:none;color:var(--text-muted);font-size:20px;cursor:pointer;border:none;";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => onClose());
  header.append(h2, closeBtn);
  card.appendChild(header);

  // Currency display
  if (playerCurrency) {
    const cur = document.createElement("div");
    cur.style.cssText = "font-size:13px;color:var(--text-secondary);margin-bottom:16px;";
    cur.textContent = Object.entries(playerCurrency).map(([k, v]) => `${k}: ${v}`).join(" | ");
    card.appendChild(cur);
  }

  // Items
  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:8px;";
  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;" +
      "background:var(--bg-hover);border-radius:var(--radius-sm);";

    const info = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-size:14px;font-weight:500;";
    nameEl.textContent = item.name;
    info.appendChild(nameEl);
    if (item.description) {
      const desc = document.createElement("div");
      desc.style.cssText = "font-size:12px;color:var(--text-muted);";
      desc.textContent = item.description;
      info.appendChild(desc);
    }

    const buyBtn = document.createElement("button");
    buyBtn.style.cssText =
      "padding:6px 14px;background:var(--accent);border-radius:var(--radius-sm);" +
      "color:white;font-size:13px;cursor:pointer;border:none;";
    buyBtn.textContent = `${item.price} ${item.currency}`;
    buyBtn.addEventListener("click", () => onBuy?.(i));

    row.append(info, buyBtn);
    list.appendChild(row);
  });
  card.appendChild(list);
  el.appendChild(card);

  return {
    el,
    destroy() { el.remove(); },
  };
}
