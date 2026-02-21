/**
 * AI Chat splash – in-game NPC conversation with LLM-backed responses.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface AiChatSplashProps extends SplashScreenCallbacks {
  npcName: string;
  /** Sends a message and returns the NPC's reply text */
  onSend: (message: string) => Promise<string>;
}

export function createAiChatSplash(props: AiChatSplashProps): SplashScreen {
  const { npcName, onSend, onClose } = props;

  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;padding:24px;display:flex;justify-content:center;pointer-events:auto;";

  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);" +
    "padding:20px 28px;max-width:640px;width:100%;box-shadow:0 -4px 24px rgba(0,0,0,0.5);" +
    "display:flex;flex-direction:column;gap:16px;max-height:60vh;";

  // Header with NPC name and close
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;";
  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:600;color:var(--accent);";
  title.textContent = npcName;
  const closeBtn = document.createElement("button");
  closeBtn.style.cssText =
    "background:none;color:var(--text-muted);font-size:20px;cursor:pointer;border:none;padding:0 4px;";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => onClose());
  header.append(title, closeBtn);
  card.appendChild(header);

  // Messages area (scrollable)
  const messagesEl = document.createElement("div");
  messagesEl.style.cssText =
    "flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;min-height:80px;max-height:240px;";
  card.appendChild(messagesEl);

  // Input row
  const form = document.createElement("form");
  form.style.cssText = "display:flex;gap:8px;";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message...";
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onClose();
      input.blur();
    }
  });
  input.style.cssText =
    "flex:1;padding:10px 14px;background:var(--bg-hover);border:1px solid var(--border);" +
    "border-radius:var(--radius-sm);color:var(--text-primary);font-size:14px;";
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  sendBtn.style.cssText =
    "padding:10px 18px;background:var(--accent);border-radius:var(--radius-sm);" +
    "color:white;font-size:14px;cursor:pointer;border:none;";
  form.append(input, sendBtn);

  let sending = false;

  function appendMessage(text: string, isUser: boolean) {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "padding:8px 12px;border-radius:var(--radius-sm);max-width:85%;" +
      "align-self:" + (isUser ? "flex-end" : "flex-start") + ";";
    wrap.style.background = isUser ? "var(--accent)" : "var(--bg-hover)";
    wrap.style.color = isUser ? "white" : "var(--text-primary)";
    const p = document.createElement("p");
    p.style.cssText = "margin:0;font-size:14px;line-height:1.4;";
    p.textContent = text;
    wrap.appendChild(p);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg || sending) return;
    input.value = "";
    appendMessage(msg, true);
    sending = true;
    sendBtn.disabled = true;
    try {
      const reply = await onSend(msg);
      appendMessage(reply || "(No response)", false);
    } catch (err) {
      appendMessage(
        err instanceof Error ? err.message : "Failed to get response",
        false
      );
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  });

  card.appendChild(form);
  el.appendChild(card);

  return {
    el,
    destroy() {
      el.remove();
    },
  };
}
