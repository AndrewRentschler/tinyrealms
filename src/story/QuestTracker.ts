import type { QuestDef } from "./StoryTypes.ts";

export interface QuestState {
  questName: string;
  currentStep: number;
  status: "active" | "completed" | "failed";
  choices: Record<string, any>;
}

/**
 * Client-side quest tracker. Maintains quest state and checks prerequisites.
 */
export class QuestTracker {
  private quests: Map<string, QuestDef> = new Map();
  private progress: Map<string, QuestState> = new Map();

  registerQuest(quest: QuestDef) {
    this.quests.set(quest.name, quest);
  }

  loadProgress(states: QuestState[]) {
    this.progress.clear();
    for (const s of states) {
      this.progress.set(s.questName, s);
    }
  }

  canStartQuest(questName: string): boolean {
    const quest = this.quests.get(questName);
    if (!quest) return false;
    if (this.progress.has(questName)) return false;

    return quest.prerequisites.every((prereq) => {
      const state = this.progress.get(prereq);
      return state?.status === "completed";
    });
  }

  getActiveQuests(): QuestState[] {
    return Array.from(this.progress.values()).filter(
      (s) => s.status === "active"
    );
  }

  getCompletedQuests(): QuestState[] {
    return Array.from(this.progress.values()).filter(
      (s) => s.status === "completed"
    );
  }

  getQuestDef(name: string): QuestDef | undefined {
    return this.quests.get(name);
  }

  getProgress(name: string): QuestState | undefined {
    return this.progress.get(name);
  }
}

export const questTracker = new QuestTracker();
