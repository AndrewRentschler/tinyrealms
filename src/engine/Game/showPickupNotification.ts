import { PICKUP_NOTIFICATION } from "../../constants/colors.ts";

/**
 * Show a brief floating text notification for item pickup.
 */
export function showPickupNotification(text: string): void {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: ${PICKUP_NOTIFICATION};
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-family: Inter, sans-serif;
    font-weight: 600;
    z-index: 9999;
    pointer-events: none;
    animation: pickupFadeUp 1.5s ease-out forwards;
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1600);
}
