/**
 * Cutscene splash – sequential text frames, click to advance.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface CutsceneFrame {
  text: string;
  imageUrl?: string;
  duration?: number;
}

export interface CutsceneSplashProps extends SplashScreenCallbacks {
  frames: CutsceneFrame[];
  title?: string;
}

export function createCutsceneSplash(props: CutsceneSplashProps): SplashScreen {
  const { frames, title, onClose } = props;
  let currentFrame = 0;

  const el = document.createElement("div");
  el.className = "cutscene-splash";
  el.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "width:100vw;height:100vh;cursor:pointer;padding:48px;";

  function render() {
    el.innerHTML = "";
    const frame = frames[currentFrame];
    if (!frame) { onClose(); return; }

    if (title) {
      const h = document.createElement("h2");
      h.style.cssText =
        "color:var(--text-secondary);font-size:14px;margin-bottom:24px;" +
        "letter-spacing:2px;text-transform:uppercase;";
      h.textContent = title;
      el.appendChild(h);
    }

    if (frame.imageUrl) {
      const img = document.createElement("img");
      img.src = frame.imageUrl;
      img.alt = "";
      img.style.cssText =
        "max-width:400px;max-height:300px;margin-bottom:24px;" +
        "image-rendering:pixelated;border-radius:var(--radius-md);";
      el.appendChild(img);
    }

    const p = document.createElement("p");
    p.style.cssText =
      "font-size:20px;color:var(--text-primary);text-align:center;max-width:600px;line-height:1.6;";
    p.textContent = frame.text;
    el.appendChild(p);

    const counter = document.createElement("p");
    counter.style.cssText = "font-size:12px;color:var(--text-muted);margin-top:32px;";
    counter.textContent = `${currentFrame + 1} / ${frames.length} — click to continue`;
    el.appendChild(counter);
  }

  el.addEventListener("click", () => {
    if (currentFrame < frames.length - 1) {
      currentFrame++;
      render();
    } else {
      onClose();
    }
  });

  render();

  return {
    el,
    destroy() { el.remove(); },
  };
}
