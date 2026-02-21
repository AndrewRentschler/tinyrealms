import type { IEntityLayer, NpcSoundConfig } from "./types.ts";
import { DEFAULT_AMBIENT_RADIUS, DEFAULT_AMBIENT_VOLUME, AMBIENT_INITIAL_VOLUME } from "./constants.ts";

export function refreshNPCSounds(
  layer: IEntityLayer,
  defName: string,
  sounds: NpcSoundConfig,
): void {
  for (const npc of layer.npcs) {
    if (npc.name !== defName) continue;

    npc.interactSoundUrl = sounds.interactSoundUrl;

    const oldHandle = layer.npcAmbientHandles.get(npc.id);
    const hadAmbient = !!oldHandle;
    const wantsAmbient = !!sounds.ambientSoundUrl;

    if (hadAmbient) {
      oldHandle!.stop();
      layer.npcAmbientHandles.delete(npc.id);
    }

    npc.ambientSoundUrl = sounds.ambientSoundUrl;
    npc.ambientSoundRadius = sounds.ambientSoundRadius ?? DEFAULT_AMBIENT_RADIUS;
    npc.ambientSoundVolume = sounds.ambientSoundVolume ?? DEFAULT_AMBIENT_VOLUME;

    if (wantsAmbient) {
      layer.game.audio.playAmbient(sounds.ambientSoundUrl!, AMBIENT_INITIAL_VOLUME).then((handle) => {
        if (handle) layer.npcAmbientHandles.set(npc.id, handle);
      });
    }
  }
}
