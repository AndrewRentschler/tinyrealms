import {
  INTERACT_KEY,
  INTERACT_KEY_ALT,
} from "../../constants/keybindings.ts";
import { StoragePanel } from "../../ui/StoragePanel.ts";
import type { IGame } from "./types.ts";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Handle E key press to open storage UI when near a storage object.
 */
export function handleStorageInteraction(game: IGame): void {
  // Skip if already interacting with storage
  if ((game as IGame & { accessingStorage?: boolean }).accessingStorage) return;

  // Check if we're in dialogue (can't open storage while talking)
  if (game.entityLayer.inDialogue) return;

  // Check for E key press
  const ePressed =
    game.input.wasJustPressed(INTERACT_KEY) ||
    game.input.wasJustPressed(INTERACT_KEY_ALT);
  if (!ePressed) return;

  // Check for nearby storage
  const playerX = game.entityLayer.playerX;
  const playerY = game.entityLayer.playerY;
  const nearbyStorage = game.objectLayer.findNearbyStorage(playerX, playerY);

  if (!nearbyStorage?.storageId) return;

  // Open storage UI
  openStorage(game, nearbyStorage.storageId);
}

/**
 * Open the storage UI panel for the given storage ID.
 */
function openStorage(game: IGame, storageId: Id<"storages">): void {
  const gameWithPanel = game as IGame & {
    storagePanel: StoragePanel | null;
    accessingStorage: boolean;
  };

  // Close existing panel if open
  if (gameWithPanel.storagePanel) {
    gameWithPanel.storagePanel.el.remove();
    gameWithPanel.storagePanel = null;
  }

  gameWithPanel.accessingStorage = true;

  // Create and show new panel
  gameWithPanel.storagePanel = new StoragePanel(storageId, {
    onClose: () => {
      if (gameWithPanel.storagePanel) {
        gameWithPanel.storagePanel.el.remove();
        gameWithPanel.storagePanel = null;
      }
      gameWithPanel.accessingStorage = false;
    },
    getProfileId: () => game.profile._id as string,
    getProfileItems: () => game.profile.items || [],
  });

  document.body.appendChild(gameWithPanel.storagePanel.el);
}
