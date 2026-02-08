/**
 * Manages keyboard and mouse input state.
 */
export class InputManager {
  private keys: Set<string> = new Set();
  private justPressed: Set<string> = new Set();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private canvas: HTMLCanvasElement;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!this.keys.has(e.key)) {
        this.justPressed.add(e.key);
      }
      this.keys.add(e.key);
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key);
    };

    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    };

    this.onMouseDown = () => {
      this.mouseDown = true;
    };

    this.onMouseUp = () => {
      this.mouseDown = false;
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("mouseup", this.onMouseUp);
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  wasJustPressed(key: string): boolean {
    return this.justPressed.has(key);
  }

  getMousePos() {
    return { x: this.mouseX, y: this.mouseY };
  }

  isMouseDown(): boolean {
    return this.mouseDown;
  }

  /** Call at end of frame to clear just-pressed state */
  endFrame() {
    this.justPressed.clear();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
  }
}
