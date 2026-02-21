import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "../lib/convexClient.ts";
import "./StoragePanel.css";

interface StorageSlot {
  itemDefName: string;
  quantity: number;
  metadata?: Record<string, string>;
}

interface StorageData {
  _id: Id<"storages">;
  capacity: number;
  slots: StorageSlot[];
  name?: string;
}

export interface StoragePanelCallbacks {
  onClose: () => void;
  getProfileId: () => string;
  getProfileItems: () => Array<{ name: string; quantity: number }>;
}

export class StoragePanel {
  readonly el: HTMLElement;
  private storageId: Id<"storages">;
  private storageData: StorageData | null = null;
  private callbacks: StoragePanelCallbacks;
  private itemDefs: Map<string, any> = new Map();

  constructor(storageId: Id<"storages">, callbacks: StoragePanelCallbacks) {
    this.storageId = storageId;
    this.callbacks = callbacks;
    this.el = document.createElement("div");
    this.el.className = "storage-panel";
    this.render();
    this.loadStorage();
  }

  private async loadStorage() {
    const convex = getConvexClient();
    const profileId = this.callbacks.getProfileId() as Id<"profiles">;
    const data = await convex.query(api.storage.storage.get, {
      storageId: this.storageId,
      profileId,
    });
    this.storageData = data as StorageData;

    // Load item definitions for display
    const itemNames = data?.slots?.map((s: StorageSlot) => s.itemDefName) || [];
    if (itemNames.length > 0) {
      const defs = await convex.query(api.items.listByNames, { names: itemNames });
      for (const def of defs || []) {
        this.itemDefs.set(def.name, def);
      }
    }

    this.render();
  }

  private render() {
    if (!this.storageData) {
      this.el.innerHTML = `<div class="storage-loading">Loading storage...</div>`;
      return;
    }

    const playerItems = this.callbacks.getProfileItems();
    const capacity = this.storageData.capacity;
    const usedSlots = this.storageData.slots.length;

    this.el.innerHTML = `
      <div class="storage-header">
        <h3>${this.storageData.name || "Storage"}</h3>
        <span class="storage-capacity">${usedSlots}/${capacity} slots</span>
        <button class="storage-close">×</button>
      </div>
      <div class="storage-content">
        <div class="storage-section">
          <h4>Storage</h4>
          <div class="storage-grid">
            ${this.renderSlots(this.storageData.slots, "withdraw")}
            ${this.renderEmptySlots(capacity - usedSlots)}
          </div>
        </div>
        <div class="storage-section">
          <h4>Your Inventory</h4>
          <div class="storage-grid">
            ${this.renderPlayerItems(playerItems)}
          </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private renderSlots(slots: StorageSlot[], action: "deposit" | "withdraw"): string {
    return slots
      .map((slot, idx) => {
        const def = this.itemDefs.get(slot.itemDefName);
        const displayName = def?.displayName || slot.itemDefName;
        const iconUrl = def?.iconUrl || "/assets/icons/default-item.png";

        return `
          <div class="storage-slot ${action}" data-idx="${idx}" data-item="${slot.itemDefName}">
            <img src="${iconUrl}" alt="${displayName}" class="slot-icon">
            <span class="slot-quantity">${slot.quantity}</span>
            <span class="slot-name">${displayName}</span>
          </div>
        `;
      })
      .join("");
  }

  private renderEmptySlots(count: number): string {
    return Array(count)
      .fill(0)
      .map(() => `<div class="storage-slot empty"></div>`)
      .join("");
  }

  private renderPlayerItems(items: Array<{ name: string; quantity: number }>): string {
    return items
      .map((item, idx) => {
        return `
          <div class="storage-slot deposit" data-idx="${idx}" data-item="${item.name}">
            <span class="slot-quantity">${item.quantity}</span>
            <span class="slot-name">${item.name}</span>
          </div>
        `;
      })
      .join("");
  }

  private attachListeners() {
    const closeBtn = this.el.querySelector(".storage-close");
    closeBtn?.addEventListener("click", () => this.callbacks.onClose());

    // Withdraw handlers
    this.el.querySelectorAll(".storage-slot.withdraw").forEach((slot) => {
      slot.addEventListener("click", async (e) => {
        const itemName = (e.currentTarget as HTMLElement).dataset.item;
        if (itemName) {
          await this.withdraw(itemName, 1);
        }
      });
    });

    // Deposit handlers
    this.el.querySelectorAll(".storage-slot.deposit").forEach((slot) => {
      slot.addEventListener("click", async (e) => {
        const itemName = (e.currentTarget as HTMLElement).dataset.item;
        if (itemName) {
          await this.deposit(itemName, 1);
        }
      });
    });
  }

  private async withdraw(itemDefName: string, quantity: number) {
    const convex = getConvexClient();
    const profileId = this.callbacks.getProfileId() as Id<"profiles">;

    const result = await convex.mutation(api.storage.withdraw.default, {
      storageId: this.storageId,
      profileId,
      itemDefName,
      quantity,
    });

    if (result.success) {
      await this.loadStorage(); // Refresh
    } else {
      console.error("Withdraw failed:", result.reason);
      alert(`Cannot withdraw: ${result.reason}`);
    }
  }

  private async deposit(itemDefName: string, quantity: number) {
    const convex = getConvexClient();
    const profileId = this.callbacks.getProfileId() as Id<"profiles">;

    const result = await convex.mutation(api.storage.deposit.default, {
      storageId: this.storageId,
      profileId,
      itemDefName,
      quantity,
    });

    if (result.success) {
      await this.loadStorage(); // Refresh
    } else {
      console.error("Deposit failed:", result.reason);
      alert(`Cannot deposit: ${result.reason}`);
    }
  }
}
