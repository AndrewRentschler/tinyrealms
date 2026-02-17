/**
 * ProfileScreen -- displayed on startup. Lists existing profiles,
 * allows creating new ones, deleting them, and viewing account info.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { ProfileData } from "../engine/types.ts";
import { PROFILE_SPRITE_OPTIONS } from "../config/spritesheet-config.ts";
import "./ProfileScreen.css";

// Available character sprites the player can pick from
const SPRITE_OPTIONS = PROFILE_SPRITE_OPTIONS;

const PROFILE_COLORS = [
  "#6c5ce7", "#e74c3c", "#2ecc71", "#f39c12", "#00cec9", "#fd79a8",
];

// Trash icon SVG
const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>`;

export class ProfileScreen {
  readonly el: HTMLElement;
  private onSelect: (profile: ProfileData) => void;
  private onSignOut: (() => void) | null;

  // Sub-views
  private formEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private accountEl: HTMLElement | null = null;
  private superuserEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private startMapSelect: HTMLSelectElement | null = null;
  private startLabelSelect: HTMLSelectElement | null = null;
  /** Map name → list of label names (populated by loadStartMaps) */
  private mapLabels = new Map<string, string[]>();
  private selectedSpriteUrl = SPRITE_OPTIONS[0]?.url ?? "/assets/characters/villager2.json";
  private statusEl: HTMLElement | null = null;
  private profilesUnsub: (() => void) | null = null;
  private titleEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private superuserBtn: HTMLButtonElement | null = null;
  private actingSuperuserProfileId: string | null = null;

  // Confirm dialog
  private confirmOverlay: HTMLElement | null = null;
  private deleteStatusEl: HTMLElement | null = null;

  constructor(
    onSelect: (profile: ProfileData) => void,
    onSignOut?: () => void,
  ) {
    this.onSelect = onSelect;
    this.onSignOut = onSignOut ?? null;

    this.el = document.createElement("div");
    this.el.className = "profile-screen";

    // Top bar with account link + sign-out
    const topBar = document.createElement("div");
    topBar.className = "profile-top-bar";

    const accountBtn = document.createElement("button");
    accountBtn.className = "profile-btn secondary";
    accountBtn.textContent = "Account";
    accountBtn.style.fontSize = "12px";
    accountBtn.style.padding = "6px 14px";
    accountBtn.addEventListener("click", () => this.showAccountInfo());
    topBar.appendChild(accountBtn);

    this.superuserBtn = document.createElement("button");
    this.superuserBtn.className = "profile-btn secondary";
    this.superuserBtn.textContent = "Superuser";
    this.superuserBtn.style.fontSize = "12px";
    this.superuserBtn.style.padding = "6px 14px";
    this.superuserBtn.style.display = "none";
    this.superuserBtn.addEventListener("click", () => this.toggleSuperuserPanel());
    topBar.appendChild(this.superuserBtn);

    if (this.onSignOut) {
      const signOutBtn = document.createElement("button");
      signOutBtn.className = "profile-btn secondary";
      signOutBtn.textContent = "Sign Out";
      signOutBtn.style.fontSize = "12px";
      signOutBtn.style.padding = "6px 14px";
      signOutBtn.addEventListener("click", () => this.handleSignOut());
      topBar.appendChild(signOutBtn);
    }
    this.el.appendChild(topBar);

    this.titleEl = document.createElement("h1");
    this.titleEl.textContent = "Choose Your Character";
    this.el.appendChild(this.titleEl);

    this.subEl = document.createElement("div");
    this.subEl.className = "subtitle";
    this.subEl.textContent = "Select an existing profile or create a new one";
    this.el.appendChild(this.subEl);

    this.listEl = document.createElement("div");
    this.listEl.className = "profile-list";
    this.el.appendChild(this.listEl);

    this.formEl = this.buildCreateForm();
    this.formEl.style.display = "none";
    this.el.appendChild(this.formEl);

    // Account info panel (hidden by default)
    this.accountEl = document.createElement("div");
    this.accountEl.className = "profile-account-panel";
    this.accountEl.style.display = "none";
    this.el.appendChild(this.accountEl);

    // Superuser panel (hidden by default)
    this.superuserEl = document.createElement("div");
    this.superuserEl.className = "profile-account-panel";
    this.superuserEl.style.display = "none";
    this.el.appendChild(this.superuserEl);

    // Confirm dialog overlay (hidden)
    this.confirmOverlay = document.createElement("div");
    this.confirmOverlay.className = "profile-confirm-overlay";
    this.confirmOverlay.style.display = "none";
    this.el.appendChild(this.confirmOverlay);

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

    const superusers = profiles.filter((p) => p.role === "superuser");
    this.actingSuperuserProfileId = superusers.length > 0 ? String(superusers[0]._id) : null;
    if (this.superuserBtn) {
      this.superuserBtn.style.display = this.actingSuperuserProfileId ? "" : "none";
    }

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
    const card = document.createElement("div");
    card.className = "profile-card";

    // Delete button (top-right corner)
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "profile-delete-btn";
    deleteBtn.innerHTML = TRASH_ICON;
    deleteBtn.title = "Delete character";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.confirmDelete(profile);
    });
    card.appendChild(deleteBtn);

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
    if (profile.role === "superuser") {
      const badge = document.createElement("span");
      badge.className = "role-badge admin";
      badge.textContent = "superuser";
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
    meta.textContent = `${itemCount} items`;
    card.appendChild(meta);

    card.addEventListener("click", () => this.selectProfile(profile));
    return card;
  }

  // ---------------------------------------------------------------------------
  // Delete confirmation
  // ---------------------------------------------------------------------------

  private confirmDelete(profile: ProfileData) {
    if (!this.confirmOverlay) return;

    this.confirmOverlay.innerHTML = "";
    this.confirmOverlay.style.display = "flex";
    this.deleteStatusEl = null;

    const dialog = document.createElement("div");
    dialog.className = "profile-confirm-dialog";

    const msg = document.createElement("p");
    msg.innerHTML =
      `Are you sure you want to delete <strong>${profile.name}</strong>?` +
      `<br><span class="confirm-warning">This cannot be undone. All stats, items, and progress will be lost.</span>`;
    dialog.appendChild(msg);

    const btnRow = document.createElement("div");
    btnRow.className = "profile-btn-row";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "profile-btn secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.hideConfirm());

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "profile-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => this.doDelete(profile, deleteBtn));

    btnRow.append(cancelBtn, deleteBtn);
    dialog.appendChild(btnRow);

    const status = document.createElement("div");
    status.className = "profile-status error";
    status.style.marginTop = "8px";
    status.textContent = "";
    dialog.appendChild(status);
    this.deleteStatusEl = status;

    this.confirmOverlay.appendChild(dialog);
  }

  private hideConfirm() {
    if (this.confirmOverlay) {
      this.confirmOverlay.style.display = "none";
      this.confirmOverlay.innerHTML = "";
    }
    this.deleteStatusEl = null;
  }

  private async doDelete(profile: ProfileData, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
    if (this.deleteStatusEl) this.deleteStatusEl.textContent = "";
    try {
      const convex = getConvexClient();
      await convex.mutation(api.profiles.remove, { id: profile._id as any });
      this.hideConfirm();
      // List will auto-update via subscription
    } catch (err: any) {
      btn.disabled = false;
      btn.textContent = "Delete";
      const message = err?.message || "Failed to delete profile";
      if (this.deleteStatusEl) {
        this.deleteStatusEl.textContent = message;
      }
      console.warn("Failed to delete profile:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Profile selection
  // ---------------------------------------------------------------------------

  /** Select the profile and start the game */
  private async selectProfile(profile: ProfileData) {
    try {
      this.profilesUnsub?.();
      this.profilesUnsub = null;
      this.onSelect(profile);
    } catch (err: any) {
      console.warn("Failed to select profile:", err);
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

    // Starting world
    const startMapField = document.createElement("div");
    startMapField.className = "field";
    const startMapLabel = document.createElement("label");
    startMapLabel.textContent = "Starting world";
    this.startMapSelect = document.createElement("select");
    this.startMapSelect.className = "profile-select";
    this.startMapSelect.innerHTML = `<option value="cozy-cabin">cozy-cabin</option>`;
    startMapField.append(startMapLabel, this.startMapSelect);
    form.appendChild(startMapField);

    // Starting spawn label
    const startLabelField = document.createElement("div");
    startLabelField.className = "field";
    const startLabelLabel = document.createElement("label");
    startLabelLabel.textContent = "Starting position";
    this.startLabelSelect = document.createElement("select");
    this.startLabelSelect.className = "profile-select";
    this.startLabelSelect.innerHTML = `<option value="start1">start1</option>`;
    startLabelField.append(startLabelLabel, this.startLabelSelect);
    form.appendChild(startLabelField);

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
    this.loadStartMaps();
    this.nameInput?.focus();
  }

  private hideCreateForm() {
    if (this.formEl) this.formEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.statusEl) this.statusEl.textContent = "";
  }

  private async loadStartMaps() {
    if (!this.startMapSelect) return;
    try {
      const convex = getConvexClient();
      // listStartMaps returns system maps + current user's own maps
      const maps = await convex.query(api.maps.listStartMaps, {});

      // Build label lookup and deduplicate map names
      this.mapLabels.clear();
      const seenNames = new Set<string>();
      const names: string[] = [];
      for (const m of maps as any[]) {
        const name = String(m.name);
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        names.push(name);
        this.mapLabels.set(name, (m.labelNames as string[]) ?? []);
      }

      const preferred = names.includes("cozy-cabin")
        ? "cozy-cabin"
        : names[0] ?? "cozy-cabin";

      this.startMapSelect.innerHTML = "";
      for (const name of names.length ? names : ["cozy-cabin"]) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        this.startMapSelect.appendChild(opt);
      }
      this.startMapSelect.value = preferred;

      // Wire up change event to update label dropdown
      this.startMapSelect.addEventListener("change", () => {
        this.updateLabelDropdown(this.startMapSelect!.value);
      });

      // Populate labels for the initially selected map
      this.updateLabelDropdown(preferred);
    } catch {
      this.startMapSelect.innerHTML = `<option value="cozy-cabin">cozy-cabin</option>`;
      this.startMapSelect.value = "cozy-cabin";
      this.mapLabels.clear();
      this.updateLabelDropdown("cozy-cabin");
    }
  }

  /** Refresh the starting-position dropdown with labels for the given map */
  private updateLabelDropdown(mapName: string) {
    if (!this.startLabelSelect) return;
    const labels = this.mapLabels.get(mapName) ?? [];
    this.startLabelSelect.innerHTML = "";

    if (labels.length === 0) {
      const opt = document.createElement("option");
      opt.value = "start1";
      opt.textContent = "start1 (default)";
      this.startLabelSelect.appendChild(opt);
      return;
    }

    for (const label of labels) {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      this.startLabelSelect.appendChild(opt);
    }

    // Prefer "start1" if it exists, otherwise use the first label
    if (labels.includes("start1")) {
      this.startLabelSelect.value = "start1";
    } else {
      this.startLabelSelect.value = labels[0];
    }
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
      const startMapName = this.startMapSelect?.value?.trim() || "cozy-cabin";
      const startLabel = this.startLabelSelect?.value?.trim() || "start1";
      const profileId = await convex.mutation(api.profiles.create, {
        name,
        spriteUrl: this.selectedSpriteUrl,
        color,
        startMapName,
        startLabel,
      });

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

  // ---------------------------------------------------------------------------
  // Account info panel
  // ---------------------------------------------------------------------------

  private async showAccountInfo() {
    if (!this.accountEl) return;

    // Hide other views
    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "none";
    if (this.titleEl) this.titleEl.style.display = "none";
    if (this.subEl) this.subEl.style.display = "none";
    this.accountEl.style.display = "";
    this.accountEl.innerHTML = `<div class="profile-status">Loading account info...</div>`;

    try {
      const convex = getConvexClient();
      const info = await convex.query(api.admin.myAccountInfo, {});
      if (!info) {
        this.accountEl.innerHTML = `<div class="profile-status error">Could not load account info.</div>`;
        return;
      }

      this.accountEl.innerHTML = "";

      const h2 = document.createElement("h2");
      h2.textContent = "Account";
      this.accountEl.appendChild(h2);

      // Info rows
      const addRow = (label: string, value: string) => {
        const row = document.createElement("div");
        row.className = "account-row";
        row.innerHTML = `<span class="account-label">${label}</span><span class="account-value">${value}</span>`;
        this.accountEl!.appendChild(row);
      };

      addRow("Email", info.email || "(none)");
      addRow("Auth type", this.formatProviders(info.providers));
      addRow("Profiles", String(info.profileCount));
      if (info.createdAt) {
        addRow("Member since", new Date(info.createdAt).toLocaleDateString());
      }

      // Profiles section
      if (info.profiles.length > 0) {
        const profilesHeader = document.createElement("h3");
        profilesHeader.textContent = "Characters";
        this.accountEl.appendChild(profilesHeader);

        for (const p of info.profiles) {
          const row = document.createElement("div");
          row.className = "account-row";
          const roleTag = p.role === "superuser"
            ? ` <span class="role-badge admin">superuser</span>`
            : "";
          row.innerHTML = `<span class="account-label">${p.name}${roleTag}</span><span class="account-value">Lv ${p.level}</span>`;
          this.accountEl.appendChild(row);
        }
      }

      // Maps section
      if (info.mapsCreated.length > 0) {
        const mapsHeader = document.createElement("h3");
        mapsHeader.textContent = "Maps Created";
        this.accountEl.appendChild(mapsHeader);

        for (const m of info.mapsCreated) {
          const row = document.createElement("div");
          row.className = "account-row";
          const tags: string[] = [];
          if (m.mapType === "system") tags.push(`<span class="role-badge admin">system</span>`);
          if (m.status === "draft") tags.push(`<span class="role-badge in-use">draft</span>`);
          row.innerHTML = `<span class="account-label">${m.name} ${tags.join("")}</span><span class="account-value">${m.status}</span>`;
          this.accountEl.appendChild(row);
        }
      } else {
        const noMaps = document.createElement("div");
        noMaps.className = "account-row";
        noMaps.innerHTML = `<span class="account-label" style="color:var(--text-muted)">No maps created yet</span>`;
        this.accountEl.appendChild(noMaps);
      }

      // Back button
      const btnRow = document.createElement("div");
      btnRow.className = "profile-btn-row";
      btnRow.style.marginTop = "18px";
      const backBtn = document.createElement("button");
      backBtn.className = "profile-btn secondary";
      backBtn.textContent = "Back";
      backBtn.addEventListener("click", () => this.hideAccountInfo());
      btnRow.appendChild(backBtn);
      this.accountEl.appendChild(btnRow);
    } catch (err: any) {
      this.accountEl.innerHTML = `<div class="profile-status error">Failed to load account info.</div>`;
      console.warn("Account info error:", err);
    }
  }

  private formatProviders(providers: string[]): string {
    if (!providers || providers.length === 0) return "Unknown";
    return providers.map((p) => {
      if (p === "password") return "Email/Password";
      if (p === "github") return "GitHub";
      return p;
    }).join(", ");
  }

  private hideAccountInfo() {
    if (this.accountEl) this.accountEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.titleEl) this.titleEl.style.display = "";
    if (this.subEl) this.subEl.style.display = "";
  }

  // ---------------------------------------------------------------------------
  // Superuser panel
  // ---------------------------------------------------------------------------

  private async showSuperuserPanel() {
    if (!this.superuserEl) return;
    if (!this.actingSuperuserProfileId) return;

    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "none";
    if (this.accountEl) this.accountEl.style.display = "none";
    if (this.titleEl) this.titleEl.style.display = "none";
    if (this.subEl) this.subEl.style.display = "none";
    this.superuserEl.style.display = "";
    this.superuserEl.innerHTML = `<div class="profile-status">Loading superuser panel...</div>`;

    try {
      const convex = getConvexClient();
      const superApi = (api as any).superuser;
      const data = await convex.query(superApi.dashboard, {
        profileId: this.actingSuperuserProfileId as any,
      });

      this.superuserEl.innerHTML = "";
      const h2 = document.createElement("h2");
      h2.textContent = "Superuser Panel";
      this.superuserEl.appendChild(h2);

      // Users section
      const usersHeader = document.createElement("h3");
      usersHeader.textContent = "Users & Permissions";
      this.superuserEl.appendChild(usersHeader);

      for (const u of data.users as any[]) {
        const userWrap = document.createElement("div");
        userWrap.className = "superuser-block";
        const email = u.email ?? "(no email)";
        userWrap.innerHTML = `<div class="account-row"><span class="account-label">${email}</span><span class="account-value">account</span></div>`;

        for (const p of u.profiles) {
          const row = document.createElement("div");
          row.className = "account-row";
          const roleSelect = document.createElement("select");
          roleSelect.className = "superuser-select";
          roleSelect.innerHTML = `<option value="player">player</option><option value="superuser">superuser</option>`;
          roleSelect.value = p.role;

          const saveBtn = document.createElement("button");
          saveBtn.className = "profile-btn secondary";
          saveBtn.textContent = "Save";
          saveBtn.style.padding = "4px 10px";
          saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            try {
              await convex.mutation(superApi.setRole, {
                profileId: this.actingSuperuserProfileId as any,
                targetProfileId: p._id,
                role: roleSelect.value,
              });
              saveBtn.textContent = "Saved";
              setTimeout(() => (saveBtn.textContent = "Save"), 1000);
            } catch (err: any) {
              saveBtn.textContent = "Error";
              console.warn("setRole failed", err);
            } finally {
              saveBtn.disabled = false;
            }
          });

          row.innerHTML = `<span class="account-label">${p.name}</span>`;
          const right = document.createElement("span");
          right.className = "account-value";
          right.style.display = "flex";
          right.style.gap = "6px";
          right.append(roleSelect, saveBtn);
          row.appendChild(right);
          userWrap.appendChild(row);
        }

        const delRow = document.createElement("div");
        delRow.className = "profile-btn-row";
        delRow.style.marginTop = "6px";
        const delUserBtn = document.createElement("button");
        delUserBtn.className = "profile-btn danger";
        delUserBtn.style.padding = "6px 10px";
        delUserBtn.textContent = "Delete User";
        delUserBtn.addEventListener("click", async () => {
          if (!confirm(`Delete user ${email} and all their profiles?`)) return;
          delUserBtn.disabled = true;
          try {
            await convex.mutation(superApi.removeUser, {
              profileId: this.actingSuperuserProfileId as any,
              targetUserId: u._id,
            });
            await this.showSuperuserPanel();
          } catch (err) {
            console.warn("removeUser failed", err);
            delUserBtn.disabled = false;
          }
        });
        delRow.appendChild(delUserBtn);
        userWrap.appendChild(delRow);

        this.superuserEl.appendChild(userWrap);
      }

      // Maps section
      const mapsHeader = document.createElement("h3");
      mapsHeader.textContent = "Maps & Permissions";
      this.superuserEl.appendChild(mapsHeader);

      for (const m of data.maps as any[]) {
        const block = document.createElement("div");
        block.className = "superuser-block";
        block.innerHTML = `<div class="account-row"><span class="account-label">${m.name}${m.mapType === "system" ? ' <span class="role-badge admin">system</span>' : ""}</span><span class="account-value">${m.status}</span></div>`;

        // Map type selector
        const typeRow = document.createElement("div");
        typeRow.className = "account-row";
        typeRow.innerHTML = `<span class="account-label">Type</span>`;
        const typeRight = document.createElement("span");
        typeRight.className = "account-value";
        typeRight.style.display = "flex";
        typeRight.style.gap = "6px";
        const typeSelect = document.createElement("select");
        typeSelect.className = "superuser-select";
        typeSelect.innerHTML = `<option value="private">private</option><option value="public">public</option><option value="system">system</option>`;
        typeSelect.value = m.mapType ?? "private";
        const saveTypeBtn = document.createElement("button");
        saveTypeBtn.className = "profile-btn secondary";
        saveTypeBtn.textContent = "Save";
        saveTypeBtn.style.padding = "4px 10px";
        saveTypeBtn.addEventListener("click", async () => {
          saveTypeBtn.disabled = true;
          try {
            await convex.mutation(superApi.setMapType, {
              profileId: this.actingSuperuserProfileId as any,
              mapName: m.name,
              mapType: typeSelect.value,
            });
            saveTypeBtn.textContent = "Saved";
            setTimeout(() => (saveTypeBtn.textContent = "Save"), 1000);
          } catch (err: any) {
            saveTypeBtn.textContent = "Error";
            console.warn("setMapType failed", err);
          } finally {
            saveTypeBtn.disabled = false;
          }
        });
        typeRight.append(typeSelect, saveTypeBtn);
        typeRow.appendChild(typeRight);
        block.appendChild(typeRow);

        const editorsInput = document.createElement("input");
        editorsInput.className = "superuser-input";
        editorsInput.placeholder = "Editors: email:name, email:name";
        editorsInput.value = (m.editors as any[]).map((e) => e.label).join(", ");
        block.appendChild(editorsInput);

        const row = document.createElement("div");
        row.className = "profile-btn-row";
        row.style.marginTop = "8px";

        const saveEditorsBtn = document.createElement("button");
        saveEditorsBtn.className = "profile-btn secondary";
        saveEditorsBtn.style.padding = "6px 10px";
        saveEditorsBtn.textContent = "Save Editors";
        saveEditorsBtn.addEventListener("click", async () => {
          const specs = editorsInput.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const idx = s.lastIndexOf(":");
              if (idx < 1) return null;
              return { email: s.slice(0, idx), name: s.slice(idx + 1) };
            })
            .filter((x): x is { email: string; name: string } => !!x && !!x.email && !!x.name);

          saveEditorsBtn.disabled = true;
          try {
            await convex.mutation(superApi.setMapEditors, {
              profileId: this.actingSuperuserProfileId as any,
              mapName: m.name,
              editorSpecs: specs,
            });
            saveEditorsBtn.textContent = "Saved";
            setTimeout(() => (saveEditorsBtn.textContent = "Save Editors"), 1000);
          } catch (err) {
            console.warn("setMapEditors failed", err);
            saveEditorsBtn.textContent = "Error";
          } finally {
            saveEditorsBtn.disabled = false;
          }
        });

        const delMapBtn = document.createElement("button");
        delMapBtn.className = "profile-btn danger";
        delMapBtn.style.padding = "6px 10px";
        delMapBtn.textContent = "Delete Map";
        delMapBtn.addEventListener("click", async () => {
          if (!confirm(`Delete map "${m.name}" and all map data?`)) return;
          delMapBtn.disabled = true;
          try {
            await convex.mutation(superApi.removeMap, {
              profileId: this.actingSuperuserProfileId as any,
              name: m.name,
            });
            await this.showSuperuserPanel();
          } catch (err) {
            console.warn("removeMap failed", err);
            delMapBtn.disabled = false;
          }
        });

        row.append(saveEditorsBtn, delMapBtn);
        block.appendChild(row);
        this.superuserEl.appendChild(block);
      }

      const backRow = document.createElement("div");
      backRow.className = "profile-btn-row";
      const backBtn = document.createElement("button");
      backBtn.className = "profile-btn secondary";
      backBtn.textContent = "Back";
      backBtn.addEventListener("click", () => this.hideSuperuserPanel());
      backRow.appendChild(backBtn);
      this.superuserEl.appendChild(backRow);
    } catch (err) {
      this.superuserEl.innerHTML = `<div class="profile-status error">Failed to load superuser panel.</div>`;
      console.warn("superuser panel error:", err);
    }
  }

  private toggleSuperuserPanel() {
    if (!this.superuserEl) return;
    if (this.superuserEl.style.display === "none") {
      this.showSuperuserPanel();
      return;
    }
    this.hideSuperuserPanel();
  }

  private hideSuperuserPanel() {
    if (this.superuserEl) this.superuserEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.titleEl) this.titleEl.style.display = "";
    if (this.subEl) this.subEl.style.display = "";
  }

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

  private async handleSignOut() {
    try {
      const { getAuthManager } = await import("../lib/convexClient.ts");
      const auth = getAuthManager();
      await auth.signOut();
    } catch (err) {
      console.warn("Sign-out error:", err);
    }
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    this.onSignOut?.();
  }

  destroy() {
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    this.el.remove();
  }
}
