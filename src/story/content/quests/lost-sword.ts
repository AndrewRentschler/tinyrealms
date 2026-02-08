import type { QuestDef } from "../../StoryTypes.ts";

export const lostSwordQuest: QuestDef = {
  name: "The Lost Sword",
  description: "The village elder has lost his ancestral sword in the cave to the north.",
  steps: [
    {
      id: "talk-elder",
      description: "Speak with the elder",
      objective: "Talk to the village elder about the missing sword.",
    },
    {
      id: "find-cave",
      description: "Find the northern cave",
      objective: "Travel to the cave north of the village.",
      conditions: [{ type: "at-location", target: "cave-entrance" }],
    },
    {
      id: "retrieve-sword",
      description: "Retrieve the sword",
      objective: "Find the elder's sword inside the cave.",
      conditions: [{ type: "has-item", target: "Elder's Sword" }],
    },
    {
      id: "return-sword",
      description: "Return the sword",
      objective: "Bring the sword back to the village elder.",
      conditions: [{ type: "talked-to", target: "elder" }],
      onComplete: [
        { type: "remove-item", target: "Elder's Sword" },
        { type: "add-xp", target: "player", value: 50 },
        { type: "add-currency", target: "gold", value: 100 },
      ],
    },
  ],
  prerequisites: [],
  rewards: {
    xp: 50,
    currency: { gold: 100 },
  },
};
