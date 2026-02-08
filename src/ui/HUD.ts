/**
 * HUD overlay – shows the current mode label.
 */
import type { AppMode } from "../engine/types.ts";
import "./HUD.css";

export class HUD {
  readonly el: HTMLElement;
  private label: HTMLElement;

  constructor(mode: AppMode) {
    this.el = document.createElement("div");
    this.el.className = "hud";

    this.label = document.createElement("div");
    this.label.className = "hud-mode-label";
    this.label.textContent = `${mode.toUpperCase()} MODE`;
    this.el.appendChild(this.label);
  }

  setMode(mode: AppMode) {
    this.label.textContent = `${mode.toUpperCase()} MODE`;
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }
  destroy() { this.el.remove(); }
}
