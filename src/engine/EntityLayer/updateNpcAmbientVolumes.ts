import type { IEntityLayer } from "./types.ts";
import { DEFAULT_AMBIENT_RADIUS, DEFAULT_AMBIENT_VOLUME } from "./constants.ts";
import { distance, volumeFromDistance } from "./math.ts";

export function updateNpcAmbientVolumes(layer: IEntityLayer): void {
  for (const npc of layer.npcs) {
    const ambHandle = layer.npcAmbientHandles.get(npc.id);
    if (!ambHandle) continue;

    const dist = distance(layer.playerX, layer.playerY, npc.x, npc.y);
    const radius = npc.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
    const vol = volumeFromDistance(dist, radius, npc.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME);
    ambHandle.setVolume(vol);
  }
}
