import type { IGame } from "./types.ts";

/**
 * Add click/keydown listeners to unlock audio on first user interaction.
 * Removes listeners after first unlock.
 */
export function setupAudioUnlock(game: IGame): void {
  game.unlockHandler = () => {
    game.audio.unlock();
    document.removeEventListener("click", game.unlockHandler!);
    document.removeEventListener("keydown", game.unlockHandler!);
  };
  document.addEventListener("click", game.unlockHandler);
  document.addEventListener("keydown", game.unlockHandler);
}
