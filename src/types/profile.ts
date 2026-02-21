/**
 * Profile and player data types.
 */
import type { Direction } from "./direction.ts";

export interface PlayerData {
  id: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  direction: Direction;
  animation: string;
}

export interface ProfileData {
  _id: string;
  name: string;
  spriteUrl: string;
  color: string;
  role: string;
  stats: {
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    level: number;
    xp: number;
  };
  items: { name: string; quantity: number }[];
  npcsChatted: string[];
  mapName?: string;
  startLabel?: string;
  x?: number;
  y?: number;
  direction?: string;
  createdAt: number;
}
