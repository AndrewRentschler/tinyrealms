import type { Container, AnimatedSprite, Spritesheet, Text, Graphics } from "pixi.js";
import type { InputManager } from "../InputManager.ts";
import type { NPC } from "../NPC.ts";
import type { NPCConfig } from "../NPC.ts";
import type { PresenceData } from "../types.ts";

export interface NpcSoundConfig {
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  interactSoundUrl?: string;
}

export interface FindNearestResult {
  id: string;
  dist: number;
}

export interface RemoteSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  animation: string;
  time: number;
}

export interface RemotePlayerEntry {
  container: Container;
  sprite: AnimatedSprite | null;
  spritesheet: Spritesheet | null;
  spriteUrl: string;
  label: Text;
  snapshots: RemoteSnapshot[];
  renderX: number;
  renderY: number;
  direction: string;
  animation: string;
  directionHoldFrames: number;
}

/** Minimal game interface for EntityLayer to avoid circular imports */
export interface IEntityLayerGame {
  mapRenderer: {
    worldToTile: (wx: number, wy: number) => { tileX: number; tileY: number };
    isCollision: (tx: number, ty: number) => boolean;
  };
  audio: {
    playAmbient: (url: string, volume: number) => Promise<import("../AudioManager.ts").SfxHandle | null>;
    playOneShot: (url: string, volume: number) => void;
  };
  profile: { name?: string; spriteUrl?: string };
  currentMapData: { combatEnabled?: boolean } | null;
  currentMapName: string;
}

export interface IEntityLayer {
  game: IEntityLayerGame;
  container: Container;
  playerX: number;
  playerY: number;
  playerDirection: import("../types.ts").Direction;
  playerVX: number;
  playerVY: number;
  inDialogue: boolean;

  playerContainer: Container;
  playerSprite: AnimatedSprite | null;
  playerFallback: Graphics | null;
  playerLabel: Text;
  spritesheet: Spritesheet | null;

  npcs: NPC[];
  nearestNPC: NPC | null;
  engagedNpcId: string | null;
  npcAmbientHandles: Map<string, import("../AudioManager.ts").SfxHandle>;
  npcDialogueController: import("../../npc/dialogue/NpcDialogueController.ts").NpcDialogueController;
  npcInteractionHintByInstanceName: Map<string, "chat" | "attack" | "none">;
  npcInteractionHintPending: Set<string>;

  remotePlayers: Map<string, RemotePlayerEntry>;

  isMoving: boolean;

  isBlocked(px: number, py: number): boolean;
  addNPC(config: NPCConfig): NPC;
  removeNPC(id: string): void;
  update(dt: number, input: InputManager): void;
  updatePresence(presenceList: PresenceData[], localProfileId: string): void;
  getPlayerPosition(): { x: number; y: number; vx: number; vy: number; direction: string };
  isPlayerMoving(): boolean;
  getNpcByInstanceName(instanceName: string): NPC | null;
  playPlayerHitEffect(): void;
  findNearestNPCAt(worldX: number, worldY: number, maxRadius: number): FindNearestResult | null;
  refreshNPCSounds(defName: string, sounds: NpcSoundConfig): void;
  removeAllPlacedNPCs(): void;
  updateNpcStates(states: NpcStateRow[], defsMap: Map<string, NpcSpriteDef>): void;
}

export interface NpcStateRow {
  _id: string;
  mapObjectId: string;
  spriteDefName: string;
  instanceName?: string;
  currentHp?: number;
  maxHp?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  speed: number;
  wanderRadius: number;
}

export interface NpcSpriteDef extends NpcSoundConfig {
  name: string;
  spriteSheetUrl: string;
  npcSpeed?: number;
  npcWanderRadius?: number;
  npcDirDown?: string;
  npcDirUp?: string;
  npcDirLeft?: string;
  npcDirRight?: string;
  npcGreeting?: string;
}

