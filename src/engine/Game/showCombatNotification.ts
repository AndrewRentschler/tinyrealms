import {
  COMBAT_NOTIFICATION_ANIMATION_SECONDS,
  COMBAT_NOTIFICATION_DURATION_MS,
  COMBAT_NOTIFICATION_STACK_SPACING_PX,
  COMBAT_NOTIFICATION_TOP_PX,
} from "../../config/combat-config.ts";

export interface CombatNotificationState {
  activeCombatNotifications: HTMLDivElement[];
}

/**
 * Show a brief floating text notification for combat events.
 */
export function showCombatNotification(
  state: CombatNotificationState,
  text: string,
  color = "#ff6666",
): void {
  const div = document.createElement("div");
  div.textContent = text;
  state.activeCombatNotifications.push(div);
  const idx = state.activeCombatNotifications.length - 1;
  const topPx = COMBAT_NOTIFICATION_TOP_PX + idx * COMBAT_NOTIFICATION_STACK_SPACING_PX;
  div.style.cssText = `
    position: fixed;
    top: ${topPx}px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.82);
    color: ${color};
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-family: Inter, sans-serif;
    font-weight: 600;
    z-index: 9999;
    pointer-events: none;
    animation: pickupFadeUp ${COMBAT_NOTIFICATION_ANIMATION_SECONDS}s ease-out forwards;
  `;
  document.body.appendChild(div);
  setTimeout(() => {
    const i = state.activeCombatNotifications.indexOf(div);
    if (i >= 0) state.activeCombatNotifications.splice(i, 1);
    div.remove();
    state.activeCombatNotifications.forEach((el, n) => {
      el.style.top = `${COMBAT_NOTIFICATION_TOP_PX + n * COMBAT_NOTIFICATION_STACK_SPACING_PX}px`;
    });
  }, COMBAT_NOTIFICATION_DURATION_MS);
}
