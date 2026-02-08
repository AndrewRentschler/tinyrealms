/**
 * ProfileScreen – displayed on startup. Lists existing profiles,
 * allows creating new ones, and returns the selected profile to App.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { ProfileData } from "../engine/types.ts";
import "./ProfileScreen.css";

// Available character sprites the player can pick from
const SPRITE_OPTIONS = [
  { label: "Villager 1", url: "/assets/sprites/villager2.json" },
  { label: "Villager 2", url: "/assets/sprites/villager3.json" },
  { label: "Villager 3", url: "/assets/sprites/villager4.json" },
  { label: "Villager 4", url: "/assets/sprites/villager5.json" },
  { label: "Woman", url: "/assets/sprites/woman-med.json" },
];

const PROFILE_COLORS = [
  "#6c5ce7", "#e74c3c", "#2ecc71", "#f39c12", "#00cec9", "#fd79a8",
];

export class ProfileScreen {
  readonly el: HTMLElement;
  private onSelect: (profile: ProfileData) => void;

  // Create-form state
  private formEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private selectedSpriteUrl = SPRITE_OPTIONS[0].url;
  private statusEl: HTMLElement | null = null;
  private profilesUnsub: (() => void) | null = null;

  constructor(onSelect: (profile: ProfileData) => void) {
    this.onSelect = onSelect;

    this.el = document.createElement("div");
    this.el.className = "profile-screen";

    const title = document.createElement("h1");
    title.textContent = "⚔ Choose Your Character";
    this.el.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "subtitle";
    sub.textContent = "Select an existing profile or create a new one";
    this.el.appendChild(sub);

    this.listEl = document.createElement("div");
    this.listEl.className = "profile-list";
    this.el.appendChild(this.listEl);

    this.formEl = this.buildCreateForm();
    this.formEl.style.display = "none";
    this.el.appendChild(this.formEl);

    this.loadProfiles();
    this.subscribeToProfiles();
  }

  // ---------------------------------------------------------------------------
  // Load & render profiles
  // ---------------------------------------------------------------------------

  private async loadProfiles() {
    try {
      const convex = getConvexClient();
      const profiles = await convex.query(api.profiles.list, {});
      const mapped = (profiles as any[]).map((p) => ({
        ...p,
        role: p.role ?? "player",
      })) as ProfileData[];
      this.renderList(mapped);
    } catch (err) {
      console.warn("Failed to load profiles:", err);
      this.renderList([]);
    }
  }

  /** Subscribe to profile changes so in-use state updates live */
  private subscribeToProfiles() {
    const convex = getConvexClient();
    this.profilesUnsub = convex.onUpdate(
      api.profiles.list,
      {},
      (profiles: any[]) => {
        const mapped = profiles.map((p) => ({
          ...p,
          role: p.role ?? "player",
        })) as ProfileData[];
        this.renderList(mapped);
      },
      (err) => console.warn("Profile subscription error:", err),
    );
  }

  private renderList(profiles: ProfileData[]) {
    if (!this.listEl) return;
    this.listEl.innerHTML = "";

    for (const p of profiles) {
      const card = this.buildProfileCard(p);
      this.listEl.appendChild(card);
    }

    // "New" card
    const newCard = document.createElement("div");
    newCard.className = "profile-card new-profile";
    newCard.innerHTML = `<div class="plus">+</div><div>New Character</div>`;
    newCard.addEventListener("click", () => this.showCreateForm());
    this.listEl.appendChild(newCard);
  }

  private buildProfileCard(profile: ProfileData): HTMLElement {
    const p = profile as any;
    const isInUse = !!p.inUse;

    const card = document.createElement("div");
    card.className = `profile-card${isInUse ? " in-use" : ""}`;

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.borderColor = profile.color;
    this.renderSpritePreview(avatar, profile.spriteUrl);
    card.appendChild(avatar);

    // Name + role badge + in-use indicator
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = profile.name;
    if (profile.role === "admin") {
      const badge = document.createElement("span");
      badge.className = "role-badge admin";
      badge.textContent = "admin";
      name.appendChild(badge);
    }
    if (isInUse) {
      const badge = document.createElement("span");
      badge.className = "role-badge in-use";
      badge.textContent = "in use";
      name.appendChild(badge);
    }
    card.appendChild(name);

    // Stats row
    const statsRow = document.createElement("div");
    statsRow.className = "stats-row";
    statsRow.innerHTML =
      `<span>Lv ${profile.stats.level}</span>` +
      `<span>HP ${profile.stats.hp}/${profile.stats.maxHp}</span>` +
      `<span>${profile.npcsChatted.length} NPCs</span>`;
    card.appendChild(statsRow);

    // Meta
    const meta = document.createElement("div");
    meta.className = "meta";
    const itemCount = profile.items.reduce((s, i) => s + i.quantity, 0);
    meta.textContent = isInUse ? "Currently playing" : `${itemCount} items`;
    card.appendChild(meta);

    if (isInUse) {
      card.style.cursor = "not-allowed";
    } else {
      card.addEventListener("click", () => this.selectProfile(profile));
    }
    return card;
  }

  /** Claim the profile and start the game */
  private async selectProfile(profile: ProfileData) {
    try {
      const convex = getConvexClient();
      await convex.mutation(api.profiles.claim, { id: profile._id as any });
      // Unsubscribe from profile list updates before entering the game
      this.profilesUnsub?.();
      this.profilesUnsub = null;
      this.onSelect(profile);
    } catch (err: any) {
      console.warn("Failed to claim profile:", err);
      // Show a brief status on the card — reload to reflect current state
      this.loadProfiles();
    }
  }

  // ---------------------------------------------------------------------------
  // Sprite preview (render first frame of the sprite sheet onto a tiny canvas)
  // ---------------------------------------------------------------------------

  private async renderSpritePreview(container: HTMLElement, spriteUrl: string) {
    try {
      const resp = await fetch(spriteUrl);
      const json = await resp.json();
      const imgPath = spriteUrl.replace(/[^/]+$/, "") + (json.meta?.image ?? "");
      const img = new Image();
      img.src = imgPath;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      // Get the first frame
      const frameKeys = Object.keys(json.frames);
      if (frameKeys.length === 0) return;
      const firstFrame = json.frames[frameKeys[0]];
      const f = firstFrame.frame ?? firstFrame;
      const fw = f.w;
      const fh = f.h;

      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = fw * scale;
      canvas.height = fh * scale;
      canvas.style.width = `${fw * scale}px`;
      canvas.style.height = `${fh * scale}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, f.x, f.y, fw, fh, 0, 0, fw * scale, fh * scale);
      container.appendChild(canvas);
    } catch {
      // Fallback: colored circle
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:var(--accent);";
      container.appendChild(dot);
    }
  }

  // ---------------------------------------------------------------------------
  // Create form
  // ---------------------------------------------------------------------------

  private buildCreateForm(): HTMLElement {
    const form = document.createElement("div");
    form.className = "profile-create-form";

    const h2 = document.createElement("h2");
    h2.textContent = "Create Character";
    form.appendChild(h2);

    // Name field
    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = "Enter character name...";
    this.nameInput.maxLength = 24;
    nameField.append(nameLabel, this.nameInput);
    form.appendChild(nameField);

    // Sprite picker
    const spriteField = document.createElement("div");
    spriteField.className = "field";
    const spriteLabel = document.createElement("label");
    spriteLabel.textContent = "Choose Sprite";
    spriteField.appendChild(spriteLabel);

    const picker = document.createElement("div");
    picker.className = "sprite-picker";

    for (const opt of SPRITE_OPTIONS) {
      const btn = document.createElement("div");
      btn.className = `sprite-option${opt.url === this.selectedSpriteUrl ? " selected" : ""}`;
      btn.title = opt.label;
      this.renderSpritePreview(btn, opt.url);
      btn.addEventListener("click", () => {
        this.selectedSpriteUrl = opt.url;
        picker.querySelectorAll(".sprite-option").forEach((el) =>
          el.classList.remove("selected"),
        );
        btn.classList.add("selected");
      });
      picker.appendChild(btn);
    }
    spriteField.appendChild(picker);
    form.appendChild(spriteField);

    // Status
    this.statusEl = document.createElement("div");
    this.statusEl.className = "profile-status";
    form.appendChild(this.statusEl);

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "profile-btn-row";

    const createBtn = document.createElement("button");
    createBtn.className = "profile-btn primary";
    createBtn.textContent = "Create & Play";
    createBtn.addEventListener("click", () => this.doCreate());

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "profile-btn secondary";
    cancelBtn.textContent = "Back";
    cancelBtn.addEventListener("click", () => this.hideCreateForm());

    btnRow.append(createBtn, cancelBtn);
    form.appendChild(btnRow);

    return form;
  }

  private showCreateForm() {
    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "";
    this.nameInput?.focus();
  }

  private hideCreateForm() {
    if (this.formEl) this.formEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.statusEl) this.statusEl.textContent = "";
  }

  private async doCreate() {
    const name = this.nameInput?.value.trim();
    if (!name) {
      this.showStatus("Name is required", true);
      return;
    }

    this.showStatus("Creating...");

    try {
      const convex = getConvexClient();
      const color = PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
      const profileId = await convex.mutation(api.profiles.create, {
        name,
        spriteUrl: this.selectedSpriteUrl,
        color,
      });

      // Fetch the full profile and start the game
      const profile = await convex.query(api.profiles.get, { id: profileId });
      if (profile) {
        const p = { ...profile, role: (profile as any).role ?? "player" } as unknown as ProfileData;
        this.onSelect(p);
      }
    } catch (err: any) {
      this.showStatus(err.message || "Failed to create profile", true);
    }
  }

  private showStatus(text: string, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `profile-status${isError ? " error" : ""}`;
  }

  destroy() {
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    this.el.remove();
  }
}
