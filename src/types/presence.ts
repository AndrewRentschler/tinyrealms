/**
 * Presence (remote player) data types.
 */

export interface PresenceData {
  profileId: string;
  name: string;
  spriteUrl: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  animation: string;
  lastSeen: number;
}
