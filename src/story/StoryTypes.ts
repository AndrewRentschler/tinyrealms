/**
 * TypeScript types for the story/narrative system.
 * These types are shared between content files and the runtime engine.
 */

export interface QuestStep {
  id: string;
  description: string;
  objective: string;
  conditions?: QuestCondition[];
  onComplete?: QuestEffect[];
}

export interface QuestCondition {
  type: "has-item" | "at-location" | "talked-to" | "flag-set" | "quest-complete";
  target: string;
  value?: string | number | boolean;
}

export interface QuestEffect {
  type: "give-item" | "remove-item" | "set-flag" | "start-quest" | "add-xp" | "add-currency" | "trigger-event";
  target: string;
  value?: string | number;
}

export interface QuestDef {
  name: string;
  description: string;
  steps: QuestStep[];
  prerequisites: string[]; // quest names
  rewards: {
    items?: { name: string; quantity: number }[];
    xp?: number;
    currency?: Record<string, number>;
  };
}

export interface DialogueNode {
  id: string;
  text: string;
  speaker?: string;
  responses?: DialogueResponse[];
  nextNodeId?: string;
  conditions?: QuestCondition[];
  effects?: QuestEffect[];
}

export interface DialogueResponse {
  text: string;
  nextNodeId: string;
  conditions?: QuestCondition[];
  effect?: string;
}

export interface DialogueTreeDef {
  npcName?: string;
  triggerId?: string;
  startNodeId: string;
  nodes: DialogueNode[];
}

export interface StoryEventDef {
  triggerId: string;
  type: "enter-zone" | "interact" | "combat-end" | "item-use" | "quest-complete";
  mapName?: string;
  conditions?: QuestCondition[];
  script: StoryAction[];
}

export type StoryAction =
  | { type: "dialogue"; treeId: string }
  | { type: "cutscene"; frames: { text: string; imageUrl?: string }[] }
  | { type: "give-item"; item: string; quantity: number }
  | { type: "start-quest"; questName: string }
  | { type: "set-flag"; flag: string; value: boolean }
  | { type: "teleport"; mapName: string; label: string }
  | { type: "combat"; encounterId: string };

export interface LoreDef {
  key: string;
  title: string;
  content: string;
  category: "world" | "character" | "item";
  discoverable: boolean;
}
