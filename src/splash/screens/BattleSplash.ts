/**
 * Battle splash – turn-based combat UI.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface Combatant {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
}

export interface BattleSplashProps extends SplashScreenCallbacks {
  player: Combatant;
  enemies: Combatant[];
  onAction?: (action: string, targetIndex?: number) => void;
}

export function createBattleSplash(props: BattleSplashProps): SplashScreen {
  const { player, enemies, onAction, onClose } = props;
  const log: string[] = ["Battle begins!"];

  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:24px;min-width:500px;";

  const title = document.createElement("h2");
  title.style.cssText = "font-size:18px;font-weight:600;margin-bottom:16px;text-align:center;";
  title.textContent = "Battle";
  card.appendChild(title);

  // Enemies
  const enemyRow = document.createElement("div");
  enemyRow.style.cssText = "display:flex;gap:16px;justify-content:center;margin-bottom:20px;";
  for (const e of enemies) {
    const box = document.createElement("div");
    box.style.cssText =
      "text-align:center;padding:12px;background:var(--bg-hover);border-radius:var(--radius-sm);min-width:100px;";
    box.innerHTML =
      `<div style="font-size:14px;font-weight:500">${e.name}</div>` +
      `<div style="font-size:12px;color:var(--danger)">HP: ${e.hp}/${e.maxHp}</div>`;
    enemyRow.appendChild(box);
  }
  card.appendChild(enemyRow);

  // Player
  const playerBox = document.createElement("div");
  playerBox.style.cssText =
    "text-align:center;padding:12px;background:var(--bg-hover);border-radius:var(--radius-sm);margin-bottom:16px;";
  playerBox.innerHTML =
    `<div style="font-size:14px;font-weight:500">${player.name}</div>` +
    `<div style="font-size:12px;color:var(--success)">HP: ${player.hp}/${player.maxHp}</div>`;
  card.appendChild(playerBox);

  // Actions
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;justify-content:center;margin-bottom:16px;";
  for (const action of ["Attack", "Defend", "Item", "Flee"]) {
    const btn = document.createElement("button");
    btn.style.cssText =
      `padding:8px 18px;background:${action === "Flee" ? "var(--warning)" : "var(--accent)"};` +
      "border-radius:var(--radius-sm);color:white;font-size:13px;cursor:pointer;border:none;";
    btn.textContent = action;
    btn.addEventListener("click", () => {
      onAction?.(action.toLowerCase(), 0);
      log.push(`You used ${action}!`);
      renderLog();
    });
    actions.appendChild(btn);
  }
  card.appendChild(actions);

  // Log
  const logEl = document.createElement("div");
  logEl.style.cssText =
    "max-height:100px;overflow-y:auto;padding:8px;background:var(--bg-primary);" +
    "border-radius:var(--radius-sm);font-size:12px;font-family:var(--font-mono);color:var(--text-secondary);";

  function renderLog() {
    logEl.innerHTML = log.map((m) => `<div>${m}</div>`).join("");
    logEl.scrollTop = logEl.scrollHeight;
  }
  renderLog();
  card.appendChild(logEl);

  // End battle (debug)
  const endBtn = document.createElement("button");
  endBtn.style.cssText =
    "margin-top:12px;padding:6px 14px;background:none;border:1px solid var(--border);" +
    "border-radius:var(--radius-sm);color:var(--text-muted);font-size:12px;cursor:pointer;display:block;margin-left:auto;";
  endBtn.textContent = "End Battle (debug)";
  endBtn.addEventListener("click", () => onClose());
  card.appendChild(endBtn);

  el.appendChild(card);

  return {
    el,
    destroy() { el.remove(); },
  };
}
