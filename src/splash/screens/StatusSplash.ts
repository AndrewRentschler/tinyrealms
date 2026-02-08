/**
 * Status splash – player stats, level, XP bar.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface StatusSplashProps extends SplashScreenCallbacks {
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: Record<string, number>;
}

export function createStatusSplash(props: StatusSplashProps): SplashScreen {
  const { name, level, xp, xpToNext, stats, onClose } = props;

  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:24px 32px;min-width:320px;";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;";
  const h2 = document.createElement("h2");
  h2.style.cssText = "font-size:18px;font-weight:600;";
  h2.textContent = name;
  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:none;color:var(--text-muted);font-size:20px;cursor:pointer;border:none;";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => onClose());
  header.append(h2, closeBtn);
  card.appendChild(header);

  // Level
  const levelEl = document.createElement("div");
  levelEl.style.cssText = "font-size:13px;color:var(--text-secondary);margin-bottom:12px;";
  levelEl.textContent = `Level ${level}`;
  card.appendChild(levelEl);

  // XP bar
  const xpWrap = document.createElement("div");
  xpWrap.style.marginBottom = "20px";
  const xpLabel = document.createElement("div");
  xpLabel.style.cssText = "font-size:12px;color:var(--text-muted);margin-bottom:4px;";
  xpLabel.textContent = `XP: ${xp} / ${xpToNext}`;
  const xpTrack = document.createElement("div");
  xpTrack.style.cssText = "height:8px;background:var(--bg-hover);border-radius:4px;overflow:hidden;";
  const xpFill = document.createElement("div");
  xpFill.style.cssText = `height:100%;width:${(xp / xpToNext) * 100}%;background:var(--accent);border-radius:4px;transition:width 0.3s;`;
  xpTrack.appendChild(xpFill);
  xpWrap.append(xpLabel, xpTrack);
  card.appendChild(xpWrap);

  // Stats grid
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";
  for (const [key, value] of Object.entries(stats)) {
    const cell = document.createElement("div");
    cell.style.cssText = "padding:8px 12px;background:var(--bg-hover);border-radius:var(--radius-sm);";
    const label = document.createElement("div");
    label.style.cssText = "font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;";
    label.textContent = key;
    const val = document.createElement("div");
    val.style.cssText = "font-size:18px;font-weight:600;";
    val.textContent = String(value);
    cell.append(label, val);
    grid.appendChild(cell);
  }
  card.appendChild(grid);

  el.appendChild(card);

  return {
    el,
    destroy() { el.remove(); },
  };
}
