import {
  OBJ_INTERACT_RADIUS_SQ,
  DEFAULT_AMBIENT_VOLUME,
  GLOW_BASE_ALPHA,
  GLOW_PULSE_AMPLITUDE,
  GLOW_PULSE_FREQUENCY,
} from "./constants.ts";
import type { AmbientToggleContext } from "./types.ts";

/**
 * Single pass: find nearest toggleable, update glow/prompt, and update ambient volumes.
 * Use in play mode. In build mode use updateAmbientVolumes only.
 */
export function updateToggleAndAmbient(
  layer: AmbientToggleContext,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  layer.elapsed += dt;

  let nearest: AmbientToggleContext["rendered"][number] | null = null;
  let nearestDistSq = OBJ_INTERACT_RADIUS_SQ;

  for (const r of layer.rendered) {
    if (r.ambientRadius) {
      const dx = r.x - playerX;
      const dy = r.y - playerY;
      const distSq = dx * dx + dy * dy;
      const radiusSq = r.ambientRadius * r.ambientRadius;
      if (distSq >= radiusSq) {
        if (r.sfxHandle) r.sfxHandle.setVolume(0);
        if (r.onSfxHandle) r.onSfxHandle.setVolume(0);
      } else {
        const dist = Math.sqrt(distSq);
        const vol = (1 - dist / r.ambientRadius) * (r.ambientBaseVolume ?? DEFAULT_AMBIENT_VOLUME);
        if (r.sfxHandle) r.sfxHandle.setVolume(vol);
        if (r.onSfxHandle) r.onSfxHandle.setVolume(vol);
      }
    }

    if (!r.toggleable && !r.isDoor) continue;
    if (r.isDoor && (r.doorState === "opening" || r.doorState === "closing")) continue;
    if (r.isDoor && r.isOn && r.doorCollisionTiles && r.doorCollisionTiles.length > 0) {
      const ptx = Math.floor(playerX / layer.tileWidth);
      const pty = Math.floor(playerY / layer.tileHeight);
      if (r.doorCollisionTiles.some((t) => t.x === ptx && t.y === pty)) continue;
    }
    const dx = r.x - playerX;
    const def = layer.defCache.get(r.defName);
    const spriteHalfH = def ? (def.frameHeight * def.scale) / 2 : 0;
    const dy = (r.y - spriteHalfH) - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearest = r;
      nearestDistSq = distSq;
    }
  }

  if (layer.nearestToggleable && layer.nearestToggleable !== nearest) {
    if (layer.nearestToggleable.glow) layer.nearestToggleable.glow.visible = false;
    if (layer.nearestToggleable.prompt) layer.nearestToggleable.prompt.visible = false;
  }

  layer.nearestToggleable = nearest;
  if (nearest) {
    if (nearest.glow) {
      nearest.glow.visible = true;
      nearest.glow.alpha = GLOW_BASE_ALPHA + GLOW_PULSE_AMPLITUDE * Math.sin(layer.elapsed * GLOW_PULSE_FREQUENCY);
    }
    if (nearest.prompt) nearest.prompt.visible = true;
  }
}
