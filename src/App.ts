/**
 * Root application controller.
 * Shows a profile selection screen on startup, then launches the game
 * with the chosen profile. No real auth — profiles are stored in Convex.
 */
import type { ConvexClient } from "convex/browser";
import { ProfileScreen } from "./ui/ProfileScreen.ts";
import { GameShell } from "./ui/GameShell.ts";
import { SplashHost } from "./splash/SplashHost.ts";
import type { ProfileData } from "./engine/types.ts";

export class App {
  private root: HTMLElement;
  private convex: ConvexClient;
  private profileScreen: ProfileScreen | null = null;
  private gameShell: GameShell | null = null;
  private splashHost: SplashHost | null = null;

  constructor(root: HTMLElement, convex: ConvexClient) {
    this.root = root;
    this.convex = convex;
  }

  start() {
    this.showProfileScreen();
  }

  // ---------------------------------------------------------------------------
  // Profile selection
  // ---------------------------------------------------------------------------

  private showProfileScreen() {
    this.clear();
    this.profileScreen = new ProfileScreen((profile) => {
      this.showGame(profile);
    });
    this.root.appendChild(this.profileScreen.el);
  }

  // ---------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------

  private showGame(profile: ProfileData) {
    this.clear();
    this.gameShell = new GameShell(profile);
    this.root.appendChild(this.gameShell.el);

    this.splashHost = new SplashHost();
    this.root.appendChild(this.splashHost.el);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clear() {
    if (this.profileScreen) {
      this.profileScreen.destroy();
      this.profileScreen = null;
    }
    if (this.gameShell) {
      this.gameShell.destroy();
      this.gameShell = null;
    }
    if (this.splashHost) {
      this.splashHost.destroy();
      this.splashHost = null;
    }
    this.root.innerHTML = "";
  }

  destroy() {
    this.clear();
  }
}
