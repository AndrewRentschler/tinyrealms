import type { SplashConfig } from "./SplashTypes.ts";

type Listener = () => void;

/**
 * Stack-based overlay manager. Singleton accessible via useSplash() hook.
 */
class SplashManagerImpl {
  private stack: SplashConfig[] = [];
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Push a new splash onto the stack */
  push(config: SplashConfig) {
    this.stack = [...this.stack, config];
    this.notify();
  }

  /** Remove the top splash */
  pop() {
    if (this.stack.length === 0) return;
    const top = this.stack[this.stack.length - 1];
    this.stack = this.stack.slice(0, -1);
    top.onClose?.();
    this.notify();
  }

  /** Replace the top splash with a new one */
  replace(config: SplashConfig) {
    if (this.stack.length === 0) {
      this.push(config);
      return;
    }
    const top = this.stack[this.stack.length - 1];
    top.onClose?.();
    this.stack = [...this.stack.slice(0, -1), config];
    this.notify();
  }

  /** Dismiss all splashes */
  clear() {
    for (const s of this.stack) {
      s.onClose?.();
    }
    this.stack = [];
    this.notify();
  }

  getStack(): readonly SplashConfig[] {
    return this.stack;
  }

  /** Whether any splash is currently active */
  isActive(): boolean {
    return this.stack.length > 0;
  }

  /** Whether the game should be paused (any splash with pausesGame !== false) */
  shouldPauseGame(): boolean {
    return this.stack.some((s) => s.pausesGame !== false);
  }
}

export const splashManager = new SplashManagerImpl();
