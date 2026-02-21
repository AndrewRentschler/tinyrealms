/**
 * Chat panel – collapsible message list and input, wired to Convex.
 */
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ProfileData } from "../engine/types.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import "./ChatPanel.css";

interface ChatMessage {
  _id: string;
  senderName: string;
  profileId?: Id<"profiles">;
  text: string;
  type: "chat" | "npc" | "system";
  timestamp: number;
}

export class ChatPanel {
  readonly el: HTMLElement;
  private isOpen = false;
  private toggleBtn: HTMLButtonElement;
  private panel: HTMLElement;
  private input: HTMLInputElement;
  private messagesEl: HTMLElement;
  private emptyEl: HTMLElement;

  private profile: ProfileData | null = null;
  private mapName: string | null = null;
  private unsub: (() => void) | null = null;
  private messages: ChatMessage[] = [];
  private unreadCount = 0;
  private badgeEl: HTMLElement;
  private joinedAt = Date.now();
  private didHydrate = false;
  private seenMessageIds = new Set<string>();

  constructor() {
    this.el = document.createElement("div");

    // Toggle button (shown when closed)
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "chat-toggle";
    this.toggleBtn.title = "Open Chat";
    this.toggleBtn.textContent = "\uD83D\uDCAC"; // 💬

    this.badgeEl = document.createElement("span");
    this.badgeEl.className = "chat-badge";
    this.badgeEl.style.display = "none";
    this.toggleBtn.appendChild(this.badgeEl);

    this.toggleBtn.addEventListener("click", () => this.open());
    this.el.appendChild(this.toggleBtn);

    // Panel (shown when open)
    this.panel = document.createElement("div");
    this.panel.className = "chat-panel";
    this.panel.style.display = "none";

    // Header
    const header = document.createElement("div");
    header.className = "chat-header";
    const headerLabel = document.createElement("span");
    headerLabel.textContent = "Chat";
    const closeBtn = document.createElement("button");
    closeBtn.className = "chat-close";
    closeBtn.textContent = "\u00D7"; // ×
    closeBtn.addEventListener("click", () => this.close());
    header.append(headerLabel, closeBtn);
    this.panel.appendChild(header);

    // Messages
    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "chat-messages";
    this.emptyEl = document.createElement("p");
    this.emptyEl.className = "chat-empty";
    this.emptyEl.textContent = "No messages yet. Say hello!";
    this.messagesEl.appendChild(this.emptyEl);
    this.panel.appendChild(this.messagesEl);

    // Input row
    const form = document.createElement("form");
    form.className = "chat-input-row";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.sendMessage();
    });

    this.input = document.createElement("input");
    this.input.className = "chat-input";
    this.input.placeholder = "Type a message...";
    // Prevent game input while typing; Escape closes chat
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        this.close();
        this.input.blur();
      }
    });

    const sendBtn = document.createElement("button");
    sendBtn.type = "submit";
    sendBtn.className = "chat-send";
    sendBtn.textContent = "Send";

    form.append(this.input, sendBtn);
    this.panel.appendChild(form);

    this.el.appendChild(this.panel);
  }

  // ---------------------------------------------------------------------------
  // Wire to game
  // ---------------------------------------------------------------------------

  /** Called by GameShell after the game initializes */
  setContext(profile: ProfileData, mapName: string) {
    const isSameProfile = this.profile?._id === profile._id;
    this.profile = profile;
    this.mapName = mapName;
    // World chat is global per world (not map-scoped).
    // Avoid resetting unread state on map changes for the same profile.
    if (isSameProfile && this.unsub) return;

    this.joinedAt = Date.now();
    this.didHydrate = false;
    this.seenMessageIds.clear();
    this.unreadCount = 0;
    this.updateBadge();
    this.subscribe();
  }

  private subscribe() {
    // Unsubscribe from previous
    this.unsub?.();

    const convex = getConvexClient();
    this.unsub = convex.onUpdate(
      api.chat.listRecent,
      { mapName: undefined, limit: 50 },
      (msgs) => {
        const next = msgs as unknown as ChatMessage[];

        // Initial hydration should never count as "new messages".
        if (!this.didHydrate) {
          this.messages = next;
          this.renderMessages();
          for (const m of next) this.seenMessageIds.add(String(m._id));
          this.didHydrate = true;
          return;
        }

        let newUnread = 0;
        for (const m of next) {
          const id = String(m._id);
          const isNewForClient = !this.seenMessageIds.has(id);
          if (isNewForClient && m.timestamp > this.joinedAt && !this.isOpen) {
            newUnread += 1;
          }
        }

        this.messages = next;
        this.renderMessages();
        for (const m of next) this.seenMessageIds.add(String(m._id));

        if (newUnread > 0) {
          this.unreadCount += newUnread;
          this.updateBadge();
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  private async sendMessage() {
    const text = this.input.value.trim();
    if (!text || !this.profile) return;

    this.input.value = "";

    try {
      const convex = getConvexClient();
      await convex.mutation(api.chat.send, {
        // World-level chat channel (shared across maps in this world)
        mapName: undefined,
        profileId: this.profile._id as Id<"profiles">,
        senderName: this.profile.name,
        text,
        type: "chat",
      });
    } catch (err) {
      console.warn("Failed to send message:", err);
      // Show error inline
      this.addLocalMessage("system", "Failed to send message", "System");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private renderMessages() {
    this.messagesEl.innerHTML = "";

    if (this.messages.length === 0) {
      this.messagesEl.appendChild(this.emptyEl);
      return;
    }

    let lastDateKey: string | null = null;
    for (const msg of this.messages) {
      const currentDateKey = this.dateKey(msg.timestamp);
      if (currentDateKey !== lastDateKey) {
        const divider = document.createElement("div");
        divider.className = "chat-date-divider";
        divider.textContent = this.formatDateDivider(msg.timestamp);
        this.messagesEl.appendChild(divider);
        lastDateKey = currentDateKey;
      }

      const row = document.createElement("div");
      row.className = `chat-msg chat-msg--${msg.type}`;

      const isMe = this.profile && msg.profileId === this.profile._id;

      if (msg.type === "system") {
        row.classList.add("chat-msg--system");
        row.textContent = msg.text;
      } else {
        const nameEl = document.createElement("span");
        nameEl.className = "chat-msg-name";
        nameEl.textContent = isMe ? "You" : msg.senderName;
        if (isMe) nameEl.classList.add("chat-msg-name--me");

        const textEl = document.createElement("span");
        textEl.className = "chat-msg-text";
        textEl.textContent = msg.text;

        const timeEl = document.createElement("span");
        timeEl.className = "chat-msg-time";
        timeEl.textContent = this.formatTime(msg.timestamp);

        row.append(nameEl, textEl, timeEl);
      }

      this.messagesEl.appendChild(row);
    }

    // Scroll to bottom
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Add a local-only message (not sent to Convex) */
  private addLocalMessage(
    type: "system" | "chat",
    text: string,
    sender: string,
  ) {
    this.messages.push({
      _id: `local-${Date.now()}`,
      senderName: sender,
      text,
      type,
      timestamp: Date.now(),
    });
    this.renderMessages();
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private dateKey(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private formatDateDivider(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const msgDay = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    ).getTime();
    const diffDays = Math.floor((today - msgDay) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ---------------------------------------------------------------------------
  // Open / close / badge
  // ---------------------------------------------------------------------------

  private open() {
    this.isOpen = true;
    this.toggleBtn.style.display = "none";
    this.panel.style.display = "";
    this.unreadCount = 0;
    this.updateBadge();
    // Scroll to bottom
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
    this.input.focus();
  }

  private close() {
    this.isOpen = false;
    this.toggleBtn.style.display = "";
    this.panel.style.display = "none";
  }

  private updateBadge() {
    if (this.unreadCount > 0) {
      this.badgeEl.textContent = String(this.unreadCount);
      this.badgeEl.style.display = "";
    } else {
      this.badgeEl.style.display = "none";
    }
  }

  /** Show/hide the entire chat (for mode switching) */
  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
  }

  show() {
    this.el.style.display = "";
  }
  hide() {
    this.el.style.display = "none";
  }

  destroy() {
    this.unsub?.();
    this.el.remove();
  }
}
