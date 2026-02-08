export type TransitionType =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "iris"
  | "pixelate"
  | "none";

/** Base interface that every splash screen class must implement */
export interface SplashScreen {
  /** Root DOM element for this splash */
  readonly el: HTMLElement;
  /** Called when the splash is popped or replaced – clean up listeners etc. */
  destroy(): void;
}

/** Factory function signature for creating a splash screen instance */
export type SplashScreenFactory<P = any> = (
  props: P & SplashScreenCallbacks
) => SplashScreen;

/** Callbacks injected into every splash screen */
export interface SplashScreenCallbacks {
  onClose: () => void;
  onReplace: (config: SplashConfig) => void;
  onPush: (config: SplashConfig) => void;
}

export interface SplashConfig<P = any> {
  /** Unique identifier for this splash instance */
  id: string;
  /** Factory that creates the splash screen DOM */
  create: SplashScreenFactory<P>;
  /** Props passed to the factory */
  props?: P;
  /** Entry/exit animation */
  transition?: TransitionType;
  /** Whether the game world freezes while this splash is active (default: true) */
  pausesGame?: boolean;
  /** Whether this splash captures keyboard/mouse events (default: true) */
  capturesInput?: boolean;
  /** Whether the game world is visible behind this splash (default: false) */
  transparent?: boolean;
  /** Callback when the splash is dismissed */
  onClose?: () => void;
}
