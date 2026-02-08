/**
 * Lore / quest journal splash – tabbed view.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

interface LoreEntry {
  key: string;
  title: string;
  content: string;
  category: "world" | "character" | "item";
}

interface QuestEntry {
  name: string;
  description: string;
  status: "active" | "completed" | "failed";
  currentStep?: number;
  totalSteps?: number;
}

export interface LoreSplashProps extends SplashScreenCallbacks {
  loreEntries?: LoreEntry[];
  quests?: QuestEntry[];
}

export function createLoreSplash(props: LoreSplashProps): SplashScreen {
  const { loreEntries = [], quests = [], onClose } = props;
  let tab: "quests" | "lore" = "quests";

  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:24px 32px;min-width:480px;max-width:600px;max-height:70vh;display:flex;flex-direction:column;";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;";

  const tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:8px;";
  const questTab = createTabBtn("Quests", true);
  const loreTab = createTabBtn("Lore", false);
  tabs.append(questTab, loreTab);

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "background:none;color:var(--text-muted);font-size:20px;cursor:pointer;border:none;";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => onClose());

  header.append(tabs, closeBtn);
  card.appendChild(header);

  // Content
  const content = document.createElement("div");
  content.style.cssText = "overflow-y:auto;flex:1;";
  card.appendChild(content);

  el.appendChild(card);

  function createTabBtn(text: string, active: boolean): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.style.cssText =
      `padding:6px 14px;background:${active ? "var(--accent)" : "var(--bg-hover)"};` +
      `color:${active ? "white" : "var(--text-secondary)"};border-radius:var(--radius-sm);font-size:13px;cursor:pointer;border:none;`;
    btn.textContent = text;
    return btn;
  }

  function setTab(newTab: "quests" | "lore") {
    tab = newTab;
    questTab.style.background = tab === "quests" ? "var(--accent)" : "var(--bg-hover)";
    questTab.style.color = tab === "quests" ? "white" : "var(--text-secondary)";
    loreTab.style.background = tab === "lore" ? "var(--accent)" : "var(--bg-hover)";
    loreTab.style.color = tab === "lore" ? "white" : "var(--text-secondary)";
    renderContent();
  }

  questTab.addEventListener("click", () => setTab("quests"));
  loreTab.addEventListener("click", () => setTab("lore"));

  function renderContent() {
    content.innerHTML = "";
    if (tab === "quests") {
      if (quests.length === 0) {
        content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:24px">No active quests.</p>`;
      } else {
        for (const q of quests) {
          const row = document.createElement("div");
          row.style.cssText = "padding:12px;background:var(--bg-hover);border-radius:var(--radius-sm);margin-bottom:8px;";
          const statusColor = q.status === "active" ? "var(--success)" : q.status === "completed" ? "var(--accent)" : "var(--danger)";
          row.innerHTML =
            `<div style="display:flex;justify-content:space-between"><span style="font-weight:500">${q.name}</span>` +
            `<span style="font-size:11px;color:${statusColor}">${q.status}</span></div>` +
            `<p style="font-size:13px;color:var(--text-secondary);margin-top:4px">${q.description}</p>` +
            (q.totalSteps ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Step ${(q.currentStep ?? 0) + 1} / ${q.totalSteps}</div>` : "");
          content.appendChild(row);
        }
      }
    } else {
      if (loreEntries.length === 0) {
        content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:24px">No lore discovered yet.</p>`;
      } else {
        for (const l of loreEntries) {
          const row = document.createElement("div");
          row.style.cssText = "padding:12px;background:var(--bg-hover);border-radius:var(--radius-sm);margin-bottom:8px;";
          row.innerHTML =
            `<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">${l.category}</div>` +
            `<div style="font-weight:500;margin-top:4px">${l.title}</div>` +
            `<p style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.5">${l.content}</p>`;
          content.appendChild(row);
        }
      }
    }
  }

  renderContent();

  return {
    el,
    destroy() { el.remove(); },
  };
}
