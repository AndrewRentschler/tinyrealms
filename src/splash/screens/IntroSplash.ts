/**
 * Intro splash screen – click anywhere to begin.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";
import "./IntroSplash.css";

export interface IntroSplashProps extends SplashScreenCallbacks {}

export function createIntroSplash(props: IntroSplashProps): SplashScreen {
  const el = document.createElement("div");
  el.className = "intro-splash";

  const title = document.createElement("h1");
  title.className = "intro-title";
  title.textContent = "Tiny Realms";

  const tagline = document.createElement("p");
  tagline.className = "intro-tagline";
  tagline.textContent = "A persistent shared world";

  const prompt = document.createElement("p");
  prompt.className = "intro-prompt";
  prompt.textContent = "Click anywhere to begin";

  el.append(title, tagline, prompt);
  el.addEventListener("click", () => props.onClose());

  return {
    el,
    destroy() { el.remove(); },
  };
}
