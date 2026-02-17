import {
  Container,
  AnimatedSprite,
  Spritesheet,
  Text,
  TextStyle,
  Graphics,
  ColorMatrixFilter,
} from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Direction } from "./types.ts";
import {
  HIT_SHAKE_DURATION_MS,
  HIT_SHAKE_MAGNITUDE_PX,
  HIT_FLASH_DURATION_MS,
} from "../config/combat-config.ts";

const ANIM_SPEED = 0.08;

/** Default direction-to-animation mapping (villager4 layout) */
const DEFAULT_DIR_ANIM: Record<Direction, string> = {
  down: "row0",
  up: "row1",
  right: "row2",
  left: "row3",
};

/** NPC wander state machine */
type WanderState = "idle" | "walking";

export interface NPCConfig {
  /** Unique id */
  id: string;
  /** Display name */
  name: string;
  /** Stable NPC profile instance identifier (optional) */
  instanceName?: string;
  /** Sprite sheet JSON path (under /assets/sprites/) */
  spriteSheet: string;
  /** Starting position in world pixels */
  x: number;
  y: number;
  /** Movement speed (px/sec) */
  speed?: number;
  /** Maximum wander radius from spawn point (in pixels) */
  wanderRadius?: number;
  /** Direction-to-animation row mapping (override if sheet layout differs) */
  directionMap?: Record<Direction, string>;
  /** Dialogue lines for this NPC */
  dialogue: DialogueLine[];
  /** Sound to play when the player starts chatting (e.g. chicken cluck) */
  interactSoundUrl?: string;
  /** Ambient sound that loops near this NPC */
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  /**
   * When true, the NPC does not run its own wander AI.
   * Position is set externally via setServerPosition().
   */
  serverDriven?: boolean;
}

export interface DialogueLine {
  id: string;
  text: string;
  responses?: { text: string; nextId: string }[];
  nextId?: string;
}

/**
 * A non-player character with animated sprite, simple wander AI,
 * and dialogue data.
 */
export class NPC {
  readonly id: string;
  readonly name: string;
  instanceName?: string;
  readonly container: Container;
  readonly dialogue: DialogueLine[];
  interactSoundUrl?: string;
  ambientSoundUrl?: string;
  ambientSoundRadius: number;
  ambientSoundVolume: number;

  x: number;
  y: number;
  currentHp?: number;
  maxHp?: number;
  direction: Direction = "down";

  private spawnX: number;
  private spawnY: number;
  private speed: number;
  private wanderRadius: number;
  private dirMap: Record<Direction, string>;

  private sprite: AnimatedSprite | null = null;
  private spritesheet: Spritesheet | null = null;
  private nameLabel: Text;
  private promptLabel: Text;
  private fallback: Graphics | null = null;

  // Server-driven mode (position set externally, no local AI)
  readonly serverDriven: boolean;
  /** Server-provided target position for interpolation */
  private serverX: number;
  private serverY: number;
  private serverVX = 0;
  private serverVY = 0;
  private serverTime = 0; // performance.now() when last server update arrived
  private lastServerDir: Direction = "down";
  private serverIsMoving = false;
  private dialogueLocked = false;

  // Wander AI state (only used when !serverDriven)
  private state: WanderState = "idle";
  private stateTimer = 0;
  private moveDir: { dx: number; dy: number } = { dx: 0, dy: 0 };

  // Interaction
  private _showPrompt = false;

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.instanceName = config.instanceName;
    this.x = config.x;
    this.y = config.y;
    this.currentHp = undefined;
    this.maxHp = undefined;
    this.spawnX = config.x;
    this.spawnY = config.y;
    this.speed = config.speed ?? 40;
    this.wanderRadius = config.wanderRadius ?? 80;
    this.dirMap = config.directionMap ?? DEFAULT_DIR_ANIM;
    this.dialogue = config.dialogue;
    this.interactSoundUrl = config.interactSoundUrl;
    this.ambientSoundUrl = config.ambientSoundUrl;
    this.ambientSoundRadius = config.ambientSoundRadius ?? 200;
    this.ambientSoundVolume = config.ambientSoundVolume ?? 0.5;
    this.serverDriven = config.serverDriven ?? false;
    this.serverX = config.x;
    this.serverY = config.y;

    this.container = new Container();
    this.container.x = this.x;
    this.container.y = this.y;

    // Name label
    this.nameLabel = new Text({
      text: this.name,
      style: new TextStyle({
        fontSize: 10,
        fill: 0xffd700, // gold for NPCs
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold",
      }),
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -26;
    this.container.addChild(this.nameLabel);

    // Interaction prompt (hidden by default)
    this.promptLabel = new Text({
      text: "[E] Talk",
      style: new TextStyle({
        fontSize: 9,
        fill: 0xffffff,
        fontFamily: "Inter, sans-serif",
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    this.promptLabel.anchor.set(0.5, 1);
    this.promptLabel.y = -38;
    this.promptLabel.visible = false;
    this.container.addChild(this.promptLabel);

    // Fallback square until sprite loads
    this.fallback = new Graphics();
    this.fallback.rect(-8, -8, 16, 16);
    this.fallback.fill(0xffd700);
    this.container.addChild(this.fallback);

    // Load sprite
    this.loadSprite(config.spriteSheet);

    // Start with a random idle duration
    this.stateTimer = 1 + Math.random() * 3;
  }

  private async loadSprite(sheetPath: string) {
    try {
      const sheet = await loadSpriteSheet(sheetPath);
      this.spritesheet = sheet;

      if (!this.spritesheet.animations) return;

      const frames = this.spritesheet.animations["row0"];
      if (!frames || frames.length === 0) return;

      this.sprite = new AnimatedSprite(frames);
      this.sprite.animationSpeed = ANIM_SPEED;
      this.sprite.anchor.set(0.5, 1);
      this.sprite.gotoAndStop(0); // idle

      // Remove fallback
      if (this.fallback) {
        this.container.removeChild(this.fallback);
        this.fallback.destroy();
        this.fallback = null;
      }

      this.container.addChild(this.sprite);

      // Reposition labels for sprite height
      this.nameLabel.y = -50;
      this.promptLabel.y = -62;
    } catch (err) {
      console.warn(`Failed to load NPC sprite: ${sheetPath}`, err);
    }
  }

  /** Called every frame. Pass a collision checker (px,py) => blocked */
  update(dt: number, isBlocked?: (px: number, py: number) => boolean) {
    if (this.serverDriven) {
      this.updateServerDriven(dt);
    } else {
      this.updateLocalAI(dt, isBlocked);
    }

    this.container.x = this.x;
    this.container.y = this.y;
  }

  /** Server-driven: interpolate toward server position */
  private updateServerDriven(dt: number) {
    if (this.dialogueLocked) {
      // While in conversation, hold position and force standing frame.
      this.stopWalkAnim();
      return;
    }
    const now = performance.now();
    const elapsed = (now - this.serverTime) / 1000;

    // Extrapolate server position based on velocity (clamp to 0.6s)
    const t = Math.min(elapsed, 0.6);
    const predictedX = this.serverX + this.serverVX * t;
    const predictedY = this.serverY + this.serverVY * t;

    // Smoothly blend toward predicted position
    const blend = 1 - Math.pow(0.001, dt);
    this.x += (predictedX - this.x) * blend;
    this.y += (predictedY - this.y) * blend;

    // Update walk animation from server state
    if (this.serverIsMoving && this.sprite && !this.sprite.playing) {
      this.sprite.play();
    } else if (!this.serverIsMoving && this.sprite?.playing) {
      this.sprite.gotoAndStop(0);
    }
  }

  /**
   * Called by EntityLayer when a new server snapshot arrives.
   * Updates the interpolation target and direction.
   */
  setServerPosition(x: number, y: number, vx: number, vy: number, direction: string) {
    this.serverX = x;
    this.serverY = y;
    this.serverVX = vx;
    this.serverVY = vy;
    this.serverTime = performance.now();
    this.serverIsMoving = !this.dialogueLocked && (vx !== 0 || vy !== 0);
    if (this.dialogueLocked) {
      this.stopWalkAnim();
      return;
    }

    // Update facing direction
    const dir = direction as Direction;
    if (dir !== this.lastServerDir) {
      this.lastServerDir = dir;
      this.setDirection(dir);
    }
  }

  /** Local wander AI (original logic, only used when !serverDriven) */
  private updateLocalAI(dt: number, isBlocked?: (px: number, py: number) => boolean) {
    this.stateTimer -= dt;

    if (this.stateTimer <= 0) {
      this.transitionState();
    }

    if (this.state === "walking") {
      const nx = this.x + this.moveDir.dx * this.speed * dt;
      const ny = this.y + this.moveDir.dy * this.speed * dt;

      // Stay within wander radius of spawn
      const distSq =
        (nx - this.spawnX) ** 2 + (ny - this.spawnY) ** 2;
      const hitWall = isBlocked ? isBlocked(nx, ny) : false;

      if (distSq < this.wanderRadius ** 2 && !hitWall) {
        this.x = nx;
        this.y = ny;
      } else {
        // Hit wall or boundary — go idle and pick a new direction next time
        this.state = "idle";
        this.stateTimer = 1 + Math.random() * 2;
        this.stopWalkAnim();
      }
    }
  }

  private transitionState() {
    if (this.state === "idle") {
      // Start walking in a random direction
      this.state = "walking";
      this.stateTimer = 1 + Math.random() * 3;
      this.pickRandomDirection();
      this.startWalkAnim();
    } else {
      // Go idle
      this.state = "idle";
      this.stateTimer = 2 + Math.random() * 4;
      this.stopWalkAnim();
    }
  }

  private pickRandomDirection() {
    const dirs: { dx: number; dy: number; dir: Direction }[] = [
      { dx: 0, dy: -1, dir: "up" },
      { dx: 0, dy: 1, dir: "down" },
      { dx: -1, dy: 0, dir: "left" },
      { dx: 1, dy: 0, dir: "right" },
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    this.moveDir = { dx: pick.dx, dy: pick.dy };
    this.setDirection(pick.dir);
  }

  private setDirection(dir: Direction, play = true) {
    this.direction = dir;
    if (this.sprite && this.spritesheet?.animations) {
      const animKey = this.dirMap[dir];
      const frames = this.spritesheet.animations[animKey];
      if (frames && frames.length > 0) {
        this.sprite.textures = frames;
        if (play) this.sprite.play();
        else this.sprite.gotoAndStop(0);
      }
    }
  }

  private startWalkAnim() {
    if (this.sprite) {
      this.sprite.play();
    }
  }

  private stopWalkAnim() {
    if (this.sprite) {
      this.sprite.gotoAndStop(0);
    }
  }

  /** Distance to a point (for interaction checks) */
  distanceTo(px: number, py: number): number {
    return Math.sqrt((this.x - px) ** 2 + (this.y - py) ** 2);
  }

  /** Show/hide the "[E] Talk" prompt */
  setPromptVisible(visible: boolean) {
    this.setPrompt(this.promptLabel.text, visible);
  }

  /** Set prompt text + visibility in one call */
  setPrompt(text: string, visible: boolean) {
    if (this.promptLabel.text !== text) {
      this.promptLabel.text = text;
    }
    if (this._showPrompt === visible) return;
    this._showPrompt = visible;
    this.promptLabel.visible = visible;

    // Face the player when they're close
    // (We'll handle this from EntityLayer with the player's relative position)
  }

  setCombatHp(currentHp?: number, maxHp?: number) {
    this.currentHp = currentHp;
    this.maxHp = maxHp;
  }

  /** Turn to face a point (the player) */
  faceToward(px: number, py: number) {
    const dx = px - this.x;
    const dy = py - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.setDirection(dx > 0 ? "right" : "left", false);
    } else {
      this.setDirection(dy > 0 ? "down" : "up", false);
    }
    // Stop walking when interacting and hold standing frame (frame 0).
    if (this.state === "walking") {
      this.state = "idle";
      this.stateTimer = 3;
    }
    this.stopWalkAnim();
  }

  setDialogueLocked(locked: boolean) {
    this.dialogueLocked = locked;
    this.serverIsMoving = locked ? false : this.serverVX !== 0 || this.serverVY !== 0;
    if (locked) {
      this.stopWalkAnim();
    }
  }

  /**
   * Quick shake + red flash when this NPC is hit.
   */
  playHitEffect() {
    const target = this.sprite ?? this.fallback;
    if (!target) return;

    // --- Red tint via ColorMatrixFilter ---
    const redFilter = new ColorMatrixFilter();
    // Shift hue and saturate to produce a strong red overlay
    redFilter.matrix = [
      1.6, 0.4, 0.1, 0, 0,
      0.1, 0.3, 0.1, 0, 0,
      0.1, 0.1, 0.3, 0, 0,
      0,   0,   0,   1, 0,
    ];
    target.filters = [redFilter];
    setTimeout(() => {
      if (target.filters) {
        target.filters = [];
      }
    }, HIT_FLASH_DURATION_MS);

    // --- Shake ---
    const origX = target.x;
    const origY = target.y;
    const start = performance.now();
    const shake = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= HIT_SHAKE_DURATION_MS) {
        target.x = origX;
        target.y = origY;
        return;
      }
      const progress = elapsed / HIT_SHAKE_DURATION_MS;
      const mag = HIT_SHAKE_MAGNITUDE_PX * (1 - progress);
      target.x = origX + (Math.random() * 2 - 1) * mag;
      target.y = origY + (Math.random() * 2 - 1) * mag;
      requestAnimationFrame(shake);
    };
    requestAnimationFrame(shake);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
