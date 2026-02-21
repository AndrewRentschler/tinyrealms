/**
 * HUD overlay – shows the current mode label.
 */
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { AppMode } from "../engine/types.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import "./HUD.css";

type ActiveQuestRow = {
  _id: string;
  status: "active" | "completed" | "failed" | "abandoned";
  acceptedAt: number;
  deadlineAt?: number;
  rewardClaimedAt?: number;
  progress: Array<{
    type: "collect_item" | "kill_npc";
    targetKey: string;
    currentCount: number;
    requiredCount: number;
  }>;
  questDef: null | {
    key: string;
    title: string;
    description: string;
  };
};

const QUEST_SUCCESS_SFX = "/assets/audio/quest-success.mp3";

type HUDOptions = {
  profileId?: Id<"profiles">;
  isGuest?: boolean;
  getMapName?: () => string | undefined;
};

export class HUD {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private profileId: Id<"profiles"> | null = null;
  private getMapName: (() => string | undefined) | null = null;
  private questsListEl: HTMLElement | null = null;
  private questStatusEl: HTMLElement | null = null;
  private requestBtn: HTMLButtonElement | null = null;
  private questCollapseBtn: HTMLButtonElement | null = null;
  private questBodyEl: HTMLElement | null = null;
  private questsUnsub: (() => void) | null = null;
  private activeQuests: ActiveQuestRow[] = [];
  private questsCollapsed = false;
  private questBannerTimer: number | null = null;
  private claimingQuestIds = new Set<string>();
  private questPickerOverlayEl: HTMLElement | null = null;

  constructor(mode: AppMode, options?: HUDOptions) {
    this.el = document.createElement("div");
    this.el.className = "hud";

    this.label = document.createElement("div");
    this.label.className = "hud-mode-label";
    this.label.textContent = `${mode.toUpperCase()} MODE`;
    this.el.appendChild(this.label);

    const canShowQuests = !!options?.profileId && !options?.isGuest;
    if (canShowQuests) {
      this.profileId = options!.profileId!;
      this.getMapName = options?.getMapName ?? null;

      const questWrap = document.createElement("div");
      questWrap.className = "hud-quests";

      const questHeader = document.createElement("div");
      questHeader.className = "hud-quests-header";

      const questTitle = document.createElement("div");
      questTitle.className = "hud-quests-title";
      questTitle.textContent = "Quests";
      questHeader.appendChild(questTitle);

      this.requestBtn = document.createElement("button");
      this.requestBtn.className = "hud-quest-btn";
      this.requestBtn.textContent = "Request Quest";
      this.requestBtn.addEventListener("click", () => this.requestQuest());
      questHeader.appendChild(this.requestBtn);

      this.questCollapseBtn = document.createElement("button");
      this.questCollapseBtn.className = "hud-quest-collapse-btn";
      this.questCollapseBtn.type = "button";
      this.questCollapseBtn.title = "Collapse quests";
      this.questCollapseBtn.addEventListener("click", () => {
        this.setQuestsCollapsed(!this.questsCollapsed);
      });
      questHeader.appendChild(this.questCollapseBtn);

      questWrap.appendChild(questHeader);

      this.questBodyEl = document.createElement("div");
      this.questBodyEl.className = "hud-quests-body";

      this.questStatusEl = document.createElement("div");
      this.questStatusEl.className = "hud-quest-status";
      this.questBodyEl.appendChild(this.questStatusEl);

      this.questsListEl = document.createElement("div");
      this.questsListEl.className = "hud-quests-list";
      this.questBodyEl.appendChild(this.questsListEl);
      questWrap.appendChild(this.questBodyEl);

      this.el.appendChild(questWrap);
      this.setQuestsCollapsed(false);
      this.subscribeQuests();
    }
  }

  setMode(mode: AppMode) {
    this.label.textContent = `${mode.toUpperCase()} MODE`;
  }

  private subscribeQuests() {
    if (!this.profileId) return;
    this.questsUnsub?.();
    const convex = getConvexClient();
    this.questsUnsub = convex.onUpdate(
      api.story.quests.listActive,
      { profileId: this.profileId as Id<"profiles"> },
      (rows: any[]) => {
        this.activeQuests = (rows ?? []) as ActiveQuestRow[];
        this.renderQuests();
        void this.autoClaimCompletedQuests();
      },
    );
  }

  private async autoClaimCompletedQuests() {
    for (const q of this.activeQuests) {
      if (q.status !== "completed") continue;
      if (q.rewardClaimedAt) continue;
      if (this.claimingQuestIds.has(q._id)) continue;
      this.claimingQuestIds.add(q._id);
      try {
        await this.claimReward(q._id);
      } finally {
        this.claimingQuestIds.delete(q._id);
      }
    }
  }

  private formatDeadline(deadlineAt?: number): string {
    if (!deadlineAt) return "";
    const ms = deadlineAt - Date.now();
    if (ms <= 0) return "expired";
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")} left`;
  }

  private setQuestsCollapsed(collapsed: boolean) {
    this.questsCollapsed = collapsed;
    if (this.questBodyEl) {
      this.questBodyEl.style.display = collapsed ? "none" : "";
    }
    if (this.requestBtn) {
      this.requestBtn.style.display = collapsed ? "none" : "";
    }
    if (this.questCollapseBtn) {
      this.questCollapseBtn.textContent = collapsed ? "▸" : "▾";
      this.questCollapseBtn.title = collapsed
        ? "Expand quests"
        : "Collapse quests";
      this.questCollapseBtn.setAttribute(
        "aria-label",
        this.questCollapseBtn.title,
      );
    }
  }

  private renderQuests() {
    if (!this.questsListEl) return;
    this.questsListEl.innerHTML = "";
    if (this.activeQuests.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hud-quest-empty";
      empty.textContent = "No active quests";
      this.questsListEl.appendChild(empty);
      return;
    }

    for (const q of this.activeQuests) {
      const card = document.createElement("div");
      card.className = "hud-quest-card";

      const name = document.createElement("div");
      name.className = "hud-quest-name";
      name.textContent = q.questDef?.title ?? q.questDef?.key ?? "Quest";
      card.appendChild(name);

      if (q.status === "active") {
        const actions = document.createElement("div");
        actions.className = "hud-quest-actions";
        const abandonBtn = document.createElement("button");
        abandonBtn.className = "hud-quest-action-btn danger";
        abandonBtn.type = "button";
        abandonBtn.textContent = "Abandon";
        abandonBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.abandonQuest(
            q._id as Id<"playerQuests">,
            q.questDef?.title ?? "this quest",
          );
        });
        actions.appendChild(abandonBtn);
        card.appendChild(actions);
      }

      if (q.questDef?.description) {
        const desc = document.createElement("div");
        desc.className = "hud-quest-desc";
        desc.textContent = q.questDef.description;
        card.appendChild(desc);
      }

      for (const p of q.progress ?? []) {
        const row = document.createElement("div");
        row.className = "hud-quest-progress";
        const label =
          p.type === "collect_item"
            ? `Collect ${p.targetKey}`
            : `Defeat ${p.targetKey}`;
        row.textContent = `${label}: ${p.currentCount}/${p.requiredCount}`;
        card.appendChild(row);
      }

      const deadlineText = this.formatDeadline(q.deadlineAt);
      if (deadlineText) {
        const deadline = document.createElement("div");
        deadline.className = "hud-quest-deadline";
        deadline.textContent = deadlineText;
        card.appendChild(deadline);
      }

      this.questsListEl.appendChild(card);
    }
  }

  private showQuestStatus(text: string, isError = false) {
    if (!this.questStatusEl) return;
    this.questStatusEl.textContent = text;
    this.questStatusEl.style.color = isError ? "#ff8080" : "#9fd6ff";
    window.setTimeout(() => {
      if (this.questStatusEl?.textContent === text)
        this.questStatusEl.textContent = "";
    }, 2500);
  }

  private showQuestRewardBanner(text: string, durationMs = 4200) {
    const div = document.createElement("div");
    div.className = "hud-quest-reward-banner";
    div.textContent = text;
    document.body.appendChild(div);
    if (this.questBannerTimer != null) {
      window.clearTimeout(this.questBannerTimer);
      this.questBannerTimer = null;
    }
    this.questBannerTimer = window.setTimeout(() => {
      div.remove();
      this.questBannerTimer = null;
    }, durationMs);
  }

  private playQuestSuccessSound() {
    const audio = new Audio(QUEST_SUCCESS_SFX);
    audio.volume = 0.8;
    void audio.play().catch(() => {
      // Ignore autoplay restrictions/failures.
    });
  }

  private async requestQuest() {
    if (!this.profileId) return;
    if (!this.requestBtn) return;
    this.requestBtn.disabled = true;
    try {
      const convex = getConvexClient();
      const mapName = this.getMapName?.();
      const available = await convex.query(api.story.quests.listAvailable, {
        profileId: this.profileId as Id<"profiles">,
        sourceType: "hud",
        mapName,
      });
      if (!available || available.length === 0) {
        this.showQuestStatus("No quests available right now.");
        return;
      }
      this.openQuestPicker(available, mapName);
    } catch (err: any) {
      this.showQuestStatus(err?.message ?? "Failed to request quest", true);
    } finally {
      this.requestBtn.disabled = false;
    }
  }

  private closeQuestPicker() {
    if (!this.questPickerOverlayEl) return;
    this.questPickerOverlayEl.remove();
    this.questPickerOverlayEl = null;
  }

  private openQuestPicker(
    available: Array<{
      key: string;
      title: string;
      description?: string;
      objectives?: Array<{
        type: "collect_item" | "kill_npc";
        itemDefName?: string;
        targetNpcProfileName?: string;
        requiredCount: number;
      }>;
    }>,
    mapName: string | undefined,
  ) {
    this.closeQuestPicker();

    const overlay = document.createElement("div");
    overlay.className = "hud-quest-picker-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeQuestPicker();
    });

    const modal = document.createElement("div");
    modal.className = "hud-quest-picker-modal";

    const header = document.createElement("div");
    header.className = "hud-quest-picker-header";
    const title = document.createElement("div");
    title.className = "hud-quest-picker-title";
    title.textContent = "Choose a Quest";
    const closeBtn = document.createElement("button");
    closeBtn.className = "hud-quest-picker-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.closeQuestPicker());
    header.append(title, closeBtn);

    const list = document.createElement("div");
    list.className = "hud-quest-picker-list";

    for (const q of available) {
      const card = document.createElement("div");
      card.className = "hud-quest-picker-card";

      const name = document.createElement("div");
      name.className = "hud-quest-picker-card-title";
      name.textContent = q.title;
      card.appendChild(name);

      if (q.description) {
        const desc = document.createElement("div");
        desc.className = "hud-quest-picker-card-desc";
        desc.textContent = q.description;
        card.appendChild(desc);
      }

      if (Array.isArray(q.objectives) && q.objectives.length > 0) {
        const objList = document.createElement("div");
        objList.className = "hud-quest-picker-objectives";
        for (const obj of q.objectives) {
          const objRow = document.createElement("div");
          objRow.className = "hud-quest-picker-objective";
          if (obj.type === "collect_item") {
            objRow.textContent = `Collect ${obj.itemDefName} ×${obj.requiredCount}`;
          } else {
            objRow.textContent = `Defeat ${obj.targetNpcProfileName} ×${obj.requiredCount}`;
          }
          objList.appendChild(objRow);
        }
        card.appendChild(objList);
      }

      const actions = document.createElement("div");
      actions.className = "hud-quest-picker-actions";
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "hud-quest-picker-accept";
      acceptBtn.type = "button";
      acceptBtn.textContent = "Accept Quest";
      acceptBtn.addEventListener("click", async () => {
        if (!this.profileId) return;
        acceptBtn.disabled = true;
        try {
          const convex = getConvexClient();
          await convex.mutation(api.story.quests.accept, {
            profileId: this.profileId as Id<"profiles">,
            questDefKey: q.key,
            source: { type: "hud" },
            mapName,
          });
          this.showQuestStatus(`Accepted: ${q.title}`);
          this.closeQuestPicker();
        } catch (err: any) {
          this.showQuestStatus(err?.message ?? "Failed to accept quest", true);
          acceptBtn.disabled = false;
        }
      });
      actions.appendChild(acceptBtn);
      card.appendChild(actions);

      list.appendChild(card);
    }

    modal.append(header, list);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.questPickerOverlayEl = overlay;
  }

  private async claimReward(playerQuestId: string) {
    if (!this.profileId) return;
    const quest = this.activeQuests.find((q) => q._id === playerQuestId);
    if (!quest) return;
    if (quest.status !== "completed" || quest.rewardClaimedAt) return;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(api.story.quests.claimReward, {
        profileId: this.profileId as Id<"profiles">,
        playerQuestId: playerQuestId as Id<"playerQuests">,
      });
      const rewards = result?.rewards ?? {};
      const gold = Number(rewards.gold ?? 0);
      const xp = Number(rewards.xp ?? 0);
      const hp = Number(rewards.hp ?? 0);
      const parts: string[] = [];
      if (hp > 0) parts.push(`+${hp} HP`);
      if (gold > 0) parts.push(`+${gold} gold`);
      if (xp > 0) parts.push(`+${xp} XP`);
      if (parts.length > 0) {
        this.showQuestRewardBanner(`Quest complete: ${parts.join(" • ")}`);
      } else {
        this.showQuestRewardBanner("Quest complete");
      }
      this.playQuestSuccessSound();
      // Remove claimed quest from HUD immediately (subscription will also confirm).
      this.activeQuests = this.activeQuests.filter(
        (q) => q._id !== playerQuestId,
      );
      this.renderQuests();
      this.showQuestStatus("Reward claimed");
    } catch (err: any) {
      this.showQuestStatus(err?.message ?? "Failed to claim reward", true);
    }
  }

  private async abandonQuest(
    playerQuestId: Id<"playerQuests">,
    questTitle: string,
  ) {
    if (!this.profileId) return;
    const confirm = window.confirm(`Abandon "${questTitle}"?`);
    if (!confirm) return;
    try {
      const convex = getConvexClient();
      await convex.mutation(api.story.quests.abandon, {
        profileId: this.profileId as Id<"profiles">,
        playerQuestId,
      });
      this.showQuestStatus(`Abandoned: ${questTitle}`);
    } catch (err: any) {
      this.showQuestStatus(err?.message ?? "Failed to abandon quest", true);
    }
  }

  show() {
    this.el.style.display = "";
  }
  hide() {
    this.el.style.display = "none";
  }
  destroy() {
    if (this.questBannerTimer != null) {
      window.clearTimeout(this.questBannerTimer);
      this.questBannerTimer = null;
    }
    this.closeQuestPicker();
    this.questsUnsub?.();
    this.el.remove();
  }
}
