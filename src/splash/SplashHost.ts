/**
 * SplashHost – renders the active splash screen stack as DOM overlays.
 * Subscribes to splashManager and rebuilds layers on change.
 */
import { splashManager } from "./SplashManager.ts";
import type { SplashConfig, SplashScreen, SplashScreenCallbacks } from "./SplashTypes.ts";
import "./SplashHost.css";

interface LayerEntry {
  config: SplashConfig;
  screen: SplashScreen;
  wrapper: HTMLElement;
}

export class SplashHost {
  readonly el: HTMLElement;
  private layers: LayerEntry[] = [];
  private unsub: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "splash-host";
    this.el.style.display = "none";

    // Escape closes the top splash immediately
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && splashManager.isActive()) {
        e.preventDefault();
        e.stopPropagation();
        splashManager.pop();
      }
    };
    document.addEventListener("keydown", this.keyHandler);

    this.unsub = splashManager.subscribe(() => this.sync());
    this.sync();
  }

  private sync() {
    const stack = splashManager.getStack();

    // Tear down any layers that were removed
    const stackIds = new Set(stack.map((c) => c.id));
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (!stackIds.has(this.layers[i].config.id)) {
        this.layers[i].screen.destroy();
        this.layers[i].wrapper.remove();
        this.layers.splice(i, 1);
      }
    }

    // Build new layers for any configs not yet rendered
    const existingIds = new Set(this.layers.map((l) => l.config.id));
    for (let i = 0; i < stack.length; i++) {
      const config = stack[i];
      if (!existingIds.has(config.id)) {
        const callbacks: SplashScreenCallbacks = {
          onClose: () => splashManager.pop(),
          onReplace: (c) => splashManager.replace(c),
          onPush: (c) => splashManager.push(c),
        };
        const screen = config.create({ ...(config.props ?? {}), ...callbacks });

        const wrapper = document.createElement("div");
        wrapper.className = `splash-layer ${config.transparent ? "splash-transparent" : ""}`;
        wrapper.style.zIndex = String(1000 + i);

        if (!config.transparent) {
          const backdrop = document.createElement("div");
          backdrop.className = "splash-backdrop";
          wrapper.appendChild(backdrop);
        }

        const content = document.createElement("div");
        content.className = "splash-content";
        content.appendChild(screen.el);
        wrapper.appendChild(content);

        this.el.appendChild(wrapper);
        this.layers.push({ config, screen, wrapper });
      }
    }

    // Mark the top layer
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].wrapper.classList.toggle("splash-top", i === this.layers.length - 1);
    }

    // Show/hide the host
    this.el.style.display = stack.length > 0 ? "" : "none";
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }

  destroy() {
    this.unsub?.();
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    for (const l of this.layers) l.screen.destroy();
    this.layers = [];
    this.el.remove();
  }
}
