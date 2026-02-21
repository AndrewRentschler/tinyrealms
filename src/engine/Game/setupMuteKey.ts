import { MUTE_KEY, MUTE_KEY_ALT } from "../../constants/keybindings.ts";
import type { IGame } from "./types.ts";

/**
 * Add keydown listener for mute toggle.
 */
export function setupMuteKey(game: IGame): void {
  document.addEventListener("keydown", (e) => {
    if (e.key === MUTE_KEY || e.key === MUTE_KEY_ALT) {
      game.audio.toggleMute();
    }
  });
}
