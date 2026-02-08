import type { TransitionType } from "./SplashTypes.ts";

/** CSS class names for splash transitions */
export function getTransitionClass(
  type: TransitionType = "fade",
  phase: "enter" | "exit"
): string {
  return `splash-transition-${type}-${phase}`;
}

/** Duration of each transition type in ms */
export const TRANSITION_DURATIONS: Record<TransitionType, number> = {
  fade: 300,
  "slide-up": 350,
  "slide-down": 350,
  iris: 500,
  pixelate: 400,
  none: 0,
};
