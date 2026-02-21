/**
 * Manages the player entity, NPCs, and other players (from presence data).
 */
import {
  Container,
  Graphics,
  Text,
  TextStyle,
  AnimatedSprite,
  Spritesheet,
} from "pixi.js";
import { loadSpriteSheet } from "../SpriteLoader.ts";
import type { Game } from "../Game/index.ts";
import type { InputManager } from "../InputManager.ts";
import type { PresenceData, Direction } from "../types.ts";
import { NPC } from "../NPC.ts";
import type { NPCConfig } from "../NPC.ts";
import { NpcDialogueController } from "../../npc/dialogue/NpcDialogueController.ts";

import type { IEntityLayer, NpcSoundConfig, RemotePlayerEntry } from "./types.ts";
import {
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
  ENTITY_CONTAINER_Z_INDEX,
  PLAYER_LABEL_FONT_SIZE,
  PLAYER_LABEL_FILL,
  PLAYER_LABEL_FONT_FAMILY,
  PLAYER_LABEL_ANCHOR_X,
  PLAYER_LABEL_ANCHOR_Y,
  AMBIENT_INITIAL_VOLUME,
} from "./constants.ts";
import { isBlocked } from "./isBlocked.ts";
import { setDirection } from "./setDirection.ts";
import { findNearestNPCAt } from "./findNearestNPCAt.ts";
import { removeAllPlacedNPCs } from "./removeAllPlacedNPCs.ts";
import { refreshNPCSounds } from "./refreshNPCSounds.ts";
import { updateNpcStates } from "./updateNpcStates.ts";
import { updatePlayerMovement } from "./updatePlayerMovement.ts";
import { updateNPCInteraction } from "./updateNPCInteraction.ts";
import { startDialogue } from "./startDialogue.ts";
import { updatePresence } from "./updatePresence.ts";
import { updateRemotePlayers } from "./updateRemotePlayers.ts";
import { updateNpcAmbientVolumes } from "./updateNpcAmbientVolumes.ts";
import { playPlayerHitEffect } from "./playPlayerHitEffect.ts";
import { showFallback } from "./showFallback.ts";
import { loadCharacterSprite } from "./loadCharacterSprite.ts";

export class EntityLayer implements IEntityLayer {
  container: Container;
  game: Game;

  playerX = PLAYER_SPAWN_X;
  playerY = PLAYER_SPAWN_Y;
  playerDirection: Direction = "down";
  private _isMoving = false;
  playerVX = 0;
  playerVY = 0;

  playerContainer: Container;
  playerSprite: AnimatedSprite | null = null;
  playerFallback: Graphics | null = null;
  playerLabel: Text;
  spritesheet: Spritesheet | null = null;

  npcs: NPC[] = [];
  nearestNPC: NPC | null = null;
  inDialogue = false;
  engagedNpcId: string | null = null;
  npcAmbientHandles = new Map<string, import("../AudioManager/index.ts").SfxHandle>();
  npcDialogueController = new NpcDialogueController();
  npcInteractionHintByInstanceName = new Map<string, "chat" | "attack" | "none">();
  npcInteractionHintPending = new Set<string>();

  remotePlayers: Map<string, RemotePlayerEntry> = new Map();

  get isMoving(): boolean {
    return this._isMoving;
  }

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.label = "entities";
    this.container.zIndex = ENTITY_CONTAINER_Z_INDEX;

    this.playerContainer = new Container();
    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;

    this.playerLabel = new Text({
      text: this.game.profile?.name ?? "You",
      style: new TextStyle({
        fontSize: PLAYER_LABEL_FONT_SIZE,
        fill: PLAYER_LABEL_FILL,
        fontFamily: PLAYER_LABEL_FONT_FAMILY,
      }),
    });
    this.playerLabel.anchor.set(PLAYER_LABEL_ANCHOR_X, PLAYER_LABEL_ANCHOR_Y);
    this.playerContainer.addChild(this.playerLabel);

    showFallback(this);
    this.container.addChild(this.playerContainer);

    void loadCharacterSprite(this);
  }

  isBlocked(px: number, py: number): boolean {
    return isBlocked(this, px, py);
  }

  addNPC(config: NPCConfig): NPC {
    const npc = new NPC(config);
    this.npcs.push(npc);
    this.container.addChild(npc.container);

    if (npc.ambientSoundUrl) {
      this.game.audio.playAmbient(npc.ambientSoundUrl, AMBIENT_INITIAL_VOLUME).then((handle) => {
        if (handle) this.npcAmbientHandles.set(npc.id, handle);
      });
    }

    return npc;
  }

  removeNPC(id: string): void {
    const idx = this.npcs.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const npc = this.npcs[idx];
      this.container.removeChild(npc.container);
      npc.destroy();
      this.npcs.splice(idx, 1);
      const handle = this.npcAmbientHandles.get(id);
      if (handle) {
        handle.stop();
        this.npcAmbientHandles.delete(id);
      }
    }
  }

  findNearestNPCAt(worldX: number, worldY: number, maxRadius: number) {
    return findNearestNPCAt(this, worldX, worldY, maxRadius);
  }

  refreshNPCSounds(defName: string, sounds: NpcSoundConfig): void {
    return refreshNPCSounds(this, defName, sounds);
  }

  removeAllPlacedNPCs(): void {
    return removeAllPlacedNPCs(this);
  }

  updateNpcStates(
    states: import("./types.ts").NpcStateRow[],
    defsMap: Map<string, import("./types.ts").NpcSpriteDef>,
  ): void {
    return updateNpcStates(this, states, defsMap);
  }

  update(dt: number, input: InputManager): void {
    if (!this.inDialogue) {
      updatePlayerMovement(this, dt, input, this._isMoving, (v) => {
        this._isMoving = v;
      });
      updateNPCInteraction(this, input, (npc) => startDialogue(this, npc));
    }

    const collisionCheck = (px: number, py: number) => this.isBlocked(px, py);
    for (const npc of this.npcs) {
      if (!(this.inDialogue && this.engagedNpcId === npc.id)) {
        npc.update(dt, collisionCheck);
      }
    }

    updateNpcAmbientVolumes(this);

    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;

    this.game.camera.follow(this.playerX, this.playerY);

    updateRemotePlayers(this);
  }

  updatePresence(presenceList: PresenceData[], localProfileId: string): void {
    return updatePresence(this, presenceList, localProfileId);
  }

  getPlayerPosition() {
    return {
      x: this.playerX,
      y: this.playerY,
      vx: this.playerVX,
      vy: this.playerVY,
      direction: this.playerDirection,
    };
  }

  isPlayerMoving(): boolean {
    return this._isMoving;
  }

  getNpcByInstanceName(instanceName: string): NPC | null {
    return this.npcs.find((n) => n.instanceName === instanceName) ?? null;
  }

  playPlayerHitEffect(): void {
    return playPlayerHitEffect(this);
  }
}
