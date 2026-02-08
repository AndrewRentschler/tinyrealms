import type { DialogueTreeDef } from "../../StoryTypes.ts";

export const elderDialogue: DialogueTreeDef = {
  npcName: "Village Elder",
  triggerId: "elder-talk",
  startNodeId: "greeting",
  nodes: [
    {
      id: "greeting",
      text: "Ah, a traveler! Welcome to our humble village. I am the elder here.",
      speaker: "Village Elder",
      responses: [
        { text: "What can you tell me about this place?", nextNodeId: "about-village" },
        { text: "Do you need help with anything?", nextNodeId: "quest-hook" },
        { text: "Goodbye.", nextNodeId: "farewell" },
      ],
    },
    {
      id: "about-village",
      text: "This village has stood for generations, nestled between the great forest and the northern mountains. We live simply, but we are proud of our heritage.",
      speaker: "Village Elder",
      nextNodeId: "greeting",
    },
    {
      id: "quest-hook",
      text: "Actually, yes... My ancestral sword was lost in the cave to the north. A group of goblins drove me out before I could retrieve it. Would you be brave enough to fetch it?",
      speaker: "Village Elder",
      responses: [
        { text: "I'll help you get it back!", nextNodeId: "accept-quest", effect: "start-quest:lost-sword" },
        { text: "That sounds too dangerous for me.", nextNodeId: "decline" },
      ],
    },
    {
      id: "accept-quest",
      text: "Thank you, brave one! The cave is just north of here, past the old bridge. Be careful — those goblins are fierce.",
      speaker: "Village Elder",
    },
    {
      id: "decline",
      text: "I understand. The offer remains if you change your mind.",
      speaker: "Village Elder",
      nextNodeId: "greeting",
    },
    {
      id: "farewell",
      text: "Safe travels, friend. May the forest guide your path.",
      speaker: "Village Elder",
    },
  ],
};
