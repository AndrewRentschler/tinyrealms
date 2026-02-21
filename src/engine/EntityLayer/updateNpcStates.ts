import type { DialogueLine } from "../NPC.ts";
import type { IEntityLayer, NpcStateRow, NpcSpriteDef } from "./types.ts";
import { DEFAULT_NPC_SPEED, DEFAULT_NPC_WANDER_RADIUS } from "./constants.ts";

function buildDefaultDialogue(greeting: string): DialogueLine[] {
  return [
    {
      id: "greet",
      text: greeting,
      responses: [
        { text: "Nice to meet you!", nextId: "bye" },
        { text: "Tell me more about this place.", nextId: "lore" },
        { text: "See you around.", nextId: "bye" },
      ],
    },
    {
      id: "lore",
      text: "There's not much I know yet... but I'm sure the world will reveal its secrets in time.",
      responses: [
        { text: "I'll keep exploring then.", nextId: "bye" },
        { text: "Thanks for the hint.", nextId: "bye" },
      ],
    },
    {
      id: "bye",
      text: "Take care! Come chat anytime.",
    },
  ];
}

export function updateNpcStates(
  layer: IEntityLayer,
  states: NpcStateRow[],
  defsMap: Map<string, NpcSpriteDef>,
): void {
  const activeIds = new Set<string>();

  for (const s of states) {
    const npcId = s._id;
    activeIds.add(npcId);

    const existing = layer.npcs.find((n) => n.id === npcId);

    if (existing) {
      if (existing.serverDriven) {
        existing.setServerPosition(s.x, s.y, s.vx, s.vy, s.direction);
      }
      existing.setCombatHp(s.currentHp, s.maxHp);
      if (s.instanceName && existing.instanceName !== s.instanceName) {
        existing.instanceName = s.instanceName;
      }
    } else {
      const def = defsMap.get(s.spriteDefName);
      if (!def) continue;

      const displayName = s.instanceName || def.name;
      const greeting =
        def.npcGreeting || `Hello! I'm ${displayName}. I don't have much to say yet.`;
      const dialogue = buildDefaultDialogue(greeting);

      layer.addNPC({
        id: npcId,
        name: displayName,
        instanceName: s.instanceName,
        spriteSheet: def.spriteSheetUrl,
        x: s.x,
        y: s.y,
        speed: def.npcSpeed ?? DEFAULT_NPC_SPEED,
        wanderRadius: def.npcWanderRadius ?? DEFAULT_NPC_WANDER_RADIUS,
        directionMap: {
          down: def.npcDirDown ?? "row0",
          up: def.npcDirUp ?? "row1",
          left: def.npcDirLeft ?? "row3",
          right: def.npcDirRight ?? "row2",
        },
        interactSoundUrl: def.interactSoundUrl,
        ambientSoundUrl: def.ambientSoundUrl,
        ambientSoundRadius: def.ambientSoundRadius,
        ambientSoundVolume: def.ambientSoundVolume,
        dialogue,
        serverDriven: true,
      });
      const created = layer.npcs.find((n) => n.id === npcId);
      if (created) created.setCombatHp(s.currentHp, s.maxHp);
    }
  }

  const toRemove = layer.npcs.filter(
    (n) => n.serverDriven && !activeIds.has(n.id),
  );
  for (const npc of toRemove) {
    layer.removeNPC(npc.id);
  }
}
