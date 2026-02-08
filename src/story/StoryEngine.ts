import type { StoryEventDef, QuestCondition } from "./StoryTypes.ts";

/**
 * Runtime story engine. Evaluates event triggers and conditions.
 * Fires story actions when conditions are met.
 */
export class StoryEngine {
  private events: StoryEventDef[] = [];
  private flags: Map<string, boolean> = new Map();

  loadEvents(events: StoryEventDef[]) {
    this.events = events;
  }

  setFlag(flag: string, value: boolean) {
    this.flags.set(flag, value);
  }

  getFlag(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }

  /**
   * Evaluate events for a given trigger type.
   * Returns the list of actions to execute.
   */
  evaluate(
    triggerType: string,
    context: {
      mapName?: string;
      triggerId?: string;
      inventory?: string[];
      questStatus?: Map<string, string>;
    }
  ): StoryEventDef[] {
    return this.events.filter((event) => {
      if (event.type !== triggerType) return false;
      if (event.mapName && event.mapName !== context.mapName) return false;
      if (event.triggerId && event.triggerId !== context.triggerId) return false;
      if (event.conditions) {
        return event.conditions.every((c) =>
          this.checkCondition(c, context)
        );
      }
      return true;
    });
  }

  private checkCondition(
    condition: QuestCondition,
    context: {
      inventory?: string[];
      questStatus?: Map<string, string>;
    }
  ): boolean {
    switch (condition.type) {
      case "has-item":
        return context.inventory?.includes(condition.target) ?? false;
      case "flag-set":
        return this.getFlag(condition.target) === (condition.value ?? true);
      case "quest-complete":
        return context.questStatus?.get(condition.target) === "completed";
      default:
        return true;
    }
  }
}
