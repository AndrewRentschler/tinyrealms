# Map Object Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a generic storage component to map objects, enabling placeable containers (chests, barrels) with public or player-owned storage.

**Architecture:** Storage data lives in a separate `storages` table with `ownerType` ("public"/"player") and capacity. Map objects link via `storageId`. Backend mutations handle deposit/withdraw with validation. Frontend shows storage UI when player interacts.

**Tech Stack:** Convex (database, mutations, queries), TypeScript, PixiJS (frontend rendering)

**Backend Structure:**
```
convex/Storage/
├── Storage.ts          — Main queries, validators, types
├── create.ts           — Create storage mutation
├── deposit.ts          — Deposit items mutation
├── withdraw.ts         — Withdraw items mutation
└── delete.ts           — Delete storage mutation
```

---

### Task 1: Add `storages` table to schema

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Add storages table definition**

Add after the `mapObjects` table definition (around line 262):

```typescript
  // ---------------------------------------------------------------------------
  // Storages (item containers for map objects and banks)
  // ---------------------------------------------------------------------------
  storages: defineTable({
    // Ownership model
    ownerType: v.union(v.literal("public"), v.literal("player")),
    ownerId: v.optional(v.id("profiles")),  // null if public
    
    // Capacity (per-instance, defined at creation)
    capacity: v.number(),  // max slots
    
    // Item slots (same structure as inventories.slots)
    slots: v.array(v.object({
      itemDefName: v.string(),
      quantity: v.number(),
      metadata: v.optional(v.record(v.string(), v.string())),
    })),
    
    // Metadata
    name: v.optional(v.string()),  // e.g., "Chest", "Bank Vault"
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerType", "ownerId"]),
```

**Step 2: Add storageId to mapObjects**

Modify the `mapObjects` table definition, add after `isOn` field (line 257):

```typescript
    storageId: v.optional(v.id("storages")),  // links to storages table
```

And add index after `by_map_sprite` index (line 261):

```typescript
    .index("by_storage", ["storageId"]),
```

**Step 3: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(storage): add storages table and storageId to mapObjects"
```

---

### Task 2: Create Storage folder and main module

**Files:**
- Create: `convex/Storage/Storage.ts` — Main queries and shared validators

**Step 1: Create Storage folder and Storage.ts**

```typescript
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ---------------------------------------------------------------------------
// Shared Validators (exported for reuse in mutation files)
// ---------------------------------------------------------------------------

export const storageSlotValidator = v.object({
  itemDefName: v.string(),
  quantity: v.number(),
  metadata: v.optional(v.record(v.string(), v.string())),
});

export const ownerTypeValidator = v.union(v.literal("public"), v.literal("player"));

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Get storage by ID */
export const get = query({
  args: { storageId: v.id("storages") },
  handler: async (ctx, { storageId }) => {
    return await ctx.db.get(storageId);
  },
});

/** Check if player can access storage */
export const canAccess = query({
  args: { 
    storageId: v.id("storages"),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, { storageId, profileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    
    const storage = await ctx.db.get(storageId);
    if (!storage) return false;
    
    // Public storage: any authenticated user
    if (storage.ownerType === "public") {
      const profile = await ctx.db.get(profileId);
      return profile?.userId === userId;
    }
    
    // Player storage: only owner
    if (storage.ownerType === "player") {
      return storage.ownerId === profileId;
    }
    
    return false;
  },
});

/** List storages by owner */
export const listByOwner = query({
  args: { 
    ownerType: ownerTypeValidator,
    ownerId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, { ownerType, ownerId }) => {
    return await ctx.db
      .query("storages")
      .withIndex("by_owner", (q) => 
        ownerId 
          ? q.eq("ownerType", ownerType).eq("ownerId", ownerId)
          : q.eq("ownerType", ownerType)
      )
      .collect();
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/Storage/Storage.ts
git commit -m "feat(storage): create Storage folder with main queries and validators"
```

---

### Task 3: Create create mutation handler

**Files:**
- Create: `convex/Storage/create.ts`

**Step 1: Create create.ts**

```typescript
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ownerTypeValidator } from "./Storage";

/** Create a new storage instance */
export default mutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.optional(v.id("profiles")),
    capacity: v.number(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { ownerType, ownerId, capacity, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    // Validate ownerId if player-owned
    if (ownerType === "player" && ownerId) {
      const profile = await ctx.db.get(ownerId);
      if (!profile || profile.userId !== userId) {
        throw new Error("Cannot create storage for another player");
      }
    }
    
    const id = await ctx.db.insert("storages", {
      ownerType,
      ownerId,
      capacity,
      slots: [],
      name,
      updatedAt: Date.now(),
    });
    
    return id;
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/Storage/create.ts
git commit -m "feat(storage): add create mutation handler"
```

---

### Task 4: Create deposit mutation handler

**Files:**
- Create: `convex/Storage/deposit.ts`

**Step 1: Create deposit.ts**

```typescript
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Deposit item from player inventory to storage */
export default mutation({
  args: {
    storageId: v.id("storages"),
    profileId: v.id("profiles"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { storageId, profileId, itemDefName, quantity }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };
    
    // Get storage
    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };
    
    // Verify access
    if (storage.ownerType === "player" && storage.ownerId !== profileId) {
      return { success: false, reason: "Access denied" };
    }
    
    // Get player inventory
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return { success: false, reason: "Invalid profile" };
    }
    
    // Check if player has item
    const playerItems = [...profile.items];
    const itemIdx = playerItems.findIndex(i => i.name === itemDefName);
    if (itemIdx < 0 || playerItems[itemIdx].quantity < quantity) {
      return { success: false, reason: "Insufficient items" };
    }
    
    // Get item def for stacking info
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", q => q.eq("name", itemDefName))
      .first();
    
    // Check capacity
    const storageSlots = [...storage.slots];
    const occupiedSlots = storageSlots.length;
    const existingSlotIdx = itemDef?.stackable 
      ? storageSlots.findIndex(s => s.itemDefName === itemDefName)
      : -1;
    
    if (existingSlotIdx < 0 && occupiedSlots >= storage.capacity) {
      return { success: false, reason: "Storage full" };
    }
    
    // Remove from player
    playerItems[itemIdx].quantity -= quantity;
    if (playerItems[itemIdx].quantity <= 0) {
      playerItems.splice(itemIdx, 1);
    }
    
    // Add to storage
    if (existingSlotIdx >= 0) {
      storageSlots[existingSlotIdx].quantity += quantity;
    } else {
      storageSlots.push({ itemDefName, quantity, metadata: {} });
    }
    
    // Save both
    await ctx.db.patch(profileId, { items: playerItems });
    await ctx.db.patch(storageId, { slots: storageSlots, updatedAt: Date.now() });
    
    return { success: true };
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/Storage/deposit.ts
git commit -m "feat(storage): add deposit mutation handler"
```

---

### Task 5: Create withdraw mutation handler

**Files:**
- Create: `convex/Storage/withdraw.ts`

**Step 1: Create withdraw.ts**

```typescript
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Withdraw item from storage to player inventory */
export default mutation({
  args: {
    storageId: v.id("storages"),
    profileId: v.id("profiles"),
    itemDefName: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, { storageId, profileId, itemDefName, quantity }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };
    
    // Get storage
    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };
    
    // Verify access
    if (storage.ownerType === "player" && storage.ownerId !== profileId) {
      return { success: false, reason: "Access denied" };
    }
    
    // Get profile
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      return { success: false, reason: "Invalid profile" };
    }
    
    // Check if storage has item
    const storageSlots = [...storage.slots];
    const slotIdx = storageSlots.findIndex(s => s.itemDefName === itemDefName);
    if (slotIdx < 0 || storageSlots[slotIdx].quantity < quantity) {
      return { success: false, reason: "Insufficient items in storage" };
    }
    
    // Get item def for stacking
    const itemDef = await ctx.db
      .query("itemDefs")
      .withIndex("by_name", q => q.eq("name", itemDefName))
      .first();
    
    // Remove from storage
    storageSlots[slotIdx].quantity -= quantity;
    if (storageSlots[slotIdx].quantity <= 0) {
      storageSlots.splice(slotIdx, 1);
    }
    
    // Add to player inventory
    const playerItems = [...profile.items];
    const existingIdx = itemDef?.stackable
      ? playerItems.findIndex(i => i.name === itemDefName)
      : -1;
    
    if (existingIdx >= 0) {
      playerItems[existingIdx].quantity += quantity;
    } else {
      playerItems.push({ name: itemDefName, quantity });
    }
    
    // Save both
    await ctx.db.patch(storageId, { slots: storageSlots, updatedAt: Date.now() });
    await ctx.db.patch(profileId, { items: playerItems });
    
    return { success: true };
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/Storage/withdraw.ts
git commit -m "feat(storage): add withdraw mutation handler"
```

---

### Task 6: Create delete mutation handler

**Files:**
- Create: `convex/Storage/delete.ts`

**Step 1: Create delete.ts**

```typescript
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Delete a storage (cleanup when object removed or for admin) */
export default mutation({
  args: {
    storageId: v.id("storages"),
  },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { success: false, reason: "Not authenticated" };
    
    const storage = await ctx.db.get(storageId);
    if (!storage) return { success: false, reason: "Storage not found" };
    
    // Check if storage has items
    if (storage.slots.length > 0) {
      return { success: false, reason: "Cannot delete non-empty storage" };
    }
    
    await ctx.db.delete(storageId);
    return { success: true };
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/Storage/delete.ts
git commit -m "feat(storage): add delete mutation handler"
```

---

### Task 7: Integrate storage creation in mapObjects.place

**Files:**
- Modify: `convex/mapObjects.ts`

**Step 1: Modify place mutation to support storage**

Modify the `place` mutation in `convex/mapObjects.ts`, add new args and storage creation:

```typescript
/** Place a new object on the map. Requires map editor. */
export const place = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    spriteDefName: v.string(),
    x: v.float64(),
    y: v.float64(),
    layer: v.number(),
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    // New: storage configuration
    hasStorage: v.optional(v.boolean()),
    storageCapacity: v.optional(v.number()),
    storageOwnerType: v.optional(v.union(v.literal("public"), v.literal("player"))),
  },
  handler: async (ctx, { profileId, hasStorage, storageCapacity, storageOwnerType, ...args }) => {
    await requireMapEditor(ctx, profileId, args.mapName);
    
    let instanceName: string | undefined = undefined;
    let storageId: string | undefined = undefined;
    
    const def = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.spriteDefName))
      .first();
    
    if (def?.category === "npc") {
      instanceName = await generateUniqueNpcInstanceName(ctx, args.spriteDefName);
    }
    
    // Create storage if requested
    if (hasStorage && storageCapacity && storageCapacity > 0) {
      const ownerType = storageOwnerType ?? "public";
      const ownerId = ownerType === "player" ? profileId : undefined;
      
      storageId = await ctx.db.insert("storages", {
        ownerType,
        ownerId,
        capacity: storageCapacity,
        slots: [],
        name: `${args.spriteDefName} Storage`,
        updatedAt: Date.now(),
      });
    }
    
    const id = await ctx.db.insert("mapObjects", {
      ...args,
      instanceName,
      storageId,
      updatedAt: Date.now(),
    });
    
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName: args.mapName });
    return id;
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/mapObjects.ts
git commit -m "feat(storage): integrate storage creation in mapObjects.place"
```

---

### Task 8: Update bulkSave to preserve storageId

**Files:**
- Modify: `convex/mapObjects.ts`

**Step 1: Add storageId to bulkSave args**

Modify the `bulkSave` mutation args, add `storageId` to the objects array item:

```typescript
export const bulkSave = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.string(),
    objects: v.array(
      v.object({
        existingId: v.optional(v.id("mapObjects")),
        spriteDefName: v.string(),
        instanceName: v.optional(v.string()),
        x: v.float64(),
        y: v.float64(),
        layer: v.number(),
        scaleOverride: v.optional(v.number()),
        flipX: v.optional(v.boolean()),
        storageId: v.optional(v.id("storages")),  // NEW: preserve storage link
      })
    ),
  },
  handler: async (ctx, { profileId, mapName, objects }) => {
    await requireMapEditor(ctx, profileId, mapName);

    // Load existing objects on this map
    const existing = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const existingById = new Map(existing.map((o) => [o._id, o]));

    // Track which existing IDs are still present in the editor
    const keptIds = new Set<string>();

    const now = Date.now();
    const usedObjectNames = new Set(
      existing
        .map((o) => o.instanceName)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    );
    const allProfiles = await ctx.db.query("npcProfiles").collect();
    const usedProfileNames = new Set(allProfiles.map((p) => String((p as any).name)));
    const allDefs = await ctx.db.query("spriteDefinitions").collect();
    const defByName = new Map(allDefs.map((d) => [d.name, d]));

    for (const obj of objects) {
      const { existingId, storageId, ...fields } = obj;

      if (existingId && existingById.has(existingId)) {
        // Existing object — patch position / layout only; preserve isOn and storageId
        keptIds.add(existingId);
        await ctx.db.patch(existingId, {
          ...fields,
          // Preserve existing storageId if not explicitly changed
          ...(storageId ? { storageId } : {}),
          updatedAt: now,
        });
      } else {
        // New object
        let instanceName = (fields as any).instanceName as string | undefined;
        const def = defByName.get(obj.spriteDefName);
        if (def?.category === "npc" && !instanceName) {
          instanceName = await generateUniqueNpcInstanceName(
            ctx,
            obj.spriteDefName,
            usedObjectNames,
            usedProfileNames,
          );
        }
        await ctx.db.insert("mapObjects", {
          mapName,
          ...fields,
          storageId,
          ...(instanceName ? { instanceName } : {}),
          updatedAt: now,
        });
      }
    }

    // Delete objects removed by the editor
    for (const old of existing) {
      if (!keptIds.has(old._id)) {
        // Optional: Clean up orphaned storage rows
        if (old.storageId) {
          await ctx.db.delete(old.storageId);
        }
        await ctx.db.delete(old._id);
      }
    }

    // Sync NPC runtime state (creates/removes npcState rows as needed)
    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName });
  },
});
```

**Step 2: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add convex/mapObjects.ts
git commit -m "feat(storage): update bulkSave to preserve storageId and cleanup orphaned storages"
```

---

### Task 9: Update listByMap to include storageId

**Files:**
- Modify: `convex/mapObjects.ts` (already returns full objects, so storageId is included)

No changes needed — the existing `listByMap` query returns the full object including `storageId`.

**Step 1: Verify listByMap returns storageId**

Check `convex/mapObjects.ts` line 40-49 — it uses `.collect()` which returns all fields.

**Step 2: Commit (no-op or skip)**

---

### Task 10: Create StoragePanel UI component

**Files:**
- Create: `src/ui/StoragePanel.ts`
- Create: `src/ui/StoragePanel.css`

**Step 1: Create StoragePanel.ts**

```typescript
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "../lib/convexClient";
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
    const data = await convex.query(api.Storage.Storage.get, { storageId: this.storageId });
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
      this.el.innerHTML = `<div class="storage-loading">Loading...</div>`;
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
    
    const result = await convex.mutation(api.Storage.withdraw.default, {
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
    
    const result = await convex.mutation(api.Storage.deposit.default, {
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
```

**Step 2: Create StoragePanel.css**

```css
.storage-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1a1a2e;
  border: 2px solid #4a4a6a;
  border-radius: 8px;
  padding: 20px;
  min-width: 400px;
  max-width: 600px;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
  z-index: 1000;
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid #4a4a6a;
  padding-bottom: 10px;
}

.storage-header h3 {
  margin: 0;
  font-size: 1.2em;
}

.storage-capacity {
  color: #aaa;
  font-size: 0.9em;
}

.storage-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0 5px;
}

.storage-close:hover {
  color: #ff6b6b;
}

.storage-content {
  display: flex;
  gap: 20px;
}

.storage-section {
  flex: 1;
}

.storage-section h4 {
  margin: 0 0 10px 0;
  font-size: 0.9em;
  color: #aaa;
}

.storage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.storage-slot {
  aspect-ratio: 1;
  background: #2a2a4a;
  border: 1px solid #4a4a6a;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  padding: 5px;
  transition: border-color 0.2s;
}

.storage-slot:hover {
  border-color: #6a6a8a;
}

.storage-slot.empty {
  background: #1a1a2a;
  border-style: dashed;
  cursor: default;
}

.storage-slot.withdraw:hover {
  border-color: #4ecdc4;
}

.storage-slot.deposit:hover {
  border-color: #ff6b6b;
}

.slot-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.slot-quantity {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.7em;
  background: rgba(0, 0, 0, 0.7);
  padding: 1px 4px;
  border-radius: 2px;
}

.slot-name {
  font-size: 0.6em;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.storage-loading {
  text-align: center;
  padding: 40px;
  color: #aaa;
}
```

**Step 3: Add listByNames query to items.ts**

Modify `convex/items.ts` to add:

```typescript
/** List item definitions by names (for UI display) */
export const listByNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const all = await ctx.db.query("itemDefs").collect();
    return all.filter(item => names.includes(item.name));
  },
});
```

**Step 4: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/StoragePanel.ts src/ui/StoragePanel.css convex/items.ts
git commit -m "feat(storage): create StoragePanel UI component"
```

---

### Task 11: Add storage detection to ObjectLayer

**Files:**
- Modify: `src/engine/ObjectLayer.ts`

**Step 1: Add storage detection and interaction**

Add to `ObjectLayer` class:

```typescript
import type { Id } from "../../convex/_generated/dataModel";

interface PlacedObjectData {
  _id: string;
  spriteDefName: string;
  x: number;
  y: number;
  layer: number;
  isOn?: boolean;
  storageId?: Id<"storages">;  // NEW
  // ... other fields
}

export class ObjectLayer {
  // ... existing code ...
  
  /** Find nearby storage object */
  findNearbyStorage(playerX: number, playerY: number, rangePx: number = 48): PlacedObjectData | null {
    for (const obj of this.placedObjects.values()) {
      if (obj.storageId) {
        const dx = obj.x - playerX;
        const dy = obj.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= rangePx) {
          return obj;
        }
      }
    }
    return null;
  }
  
  /** Check if object has storage */
  hasStorage(objectId: string): boolean {
    const obj = this.placedObjects.get(objectId);
    return !!obj?.storageId;
  }
  
  /** Get storage ID for object */
  getStorageId(objectId: string): Id<"storages"> | undefined {
    return this.placedObjects.get(objectId)?.storageId;
  }
}
```

**Step 2: Add visual indicator for storage objects**

In the object rendering code, add a subtle indicator:

```typescript
private renderObject(obj: PlacedObjectData): Container {
  // ... existing render code ...
  
  // Add storage indicator
  if (obj.storageId) {
    const indicator = new Graphics();
    indicator.circle(0, -10, 4);
    indicator.fill({ color: 0xffd700, alpha: 0.8 }); // Gold indicator
    container.addChild(indicator);
  }
  
  return container;
}
```

**Step 3: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/engine/ObjectLayer.ts
git commit -m "feat(storage): add storage detection and visual indicator to ObjectLayer"
```

---

### Task 12: Wire up E key handling in Game

**Files:**
- Modify: `src/engine/Game/Game.ts` or interaction handler

**Step 1: Add storage interaction to E key handler**

Find where E key is handled (search for "KeyE" or "interact"), add:

```typescript
import { StoragePanel } from "../../ui/StoragePanel";

// In E key handler:
handleEKey() {
  // ... existing E key handling ...
  
  // Check for nearby storage
  const nearbyStorage = this.objectLayer.findNearbyStorage(playerX, playerY);
  if (nearbyStorage?.storageId) {
    this.openStorage(nearbyStorage.storageId);
    return;
  }
  
  // ... rest of E key handling ...
}

private storagePanel: StoragePanel | null = null;

private openStorage(storageId: Id<"storages">) {
  // Close existing panel
  if (this.storagePanel) {
    this.storagePanel.el.remove();
    this.storagePanel = null;
  }
  
  // Create and show new panel
  this.storagePanel = new StoragePanel(storageId, {
    onClose: () => {
      this.storagePanel?.el.remove();
      this.storagePanel = null;
    },
    getProfileId: () => this.profile._id as string,
    getProfileItems: () => this.profile.items || [],
  });
  
  document.body.appendChild(this.storagePanel.el);
}
```

**Step 2: Add hint for storage interaction**

In the interaction hint UI, add storage hint:

```typescript
// When near storage object
if (nearbyStorage?.storageId) {
  this.showInteractionHint("Press E to open chest");
}
```

**Step 3: Run type check**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/engine/Game/Game.ts  # or wherever E key is handled
git commit -m "feat(storage): wire up E key to open storage UI"
```

---

### Task 13: Manual testing checklist

**Test in browser:**

1. **Create storage object:**
   - Open map editor
   - Place object with storage enabled
   - Save map
   - Verify storage created in Convex dashboard

2. **Access public storage:**
   - Approach storage object as player
   - Press E to open
   - Verify StoragePanel opens
   - Deposit an item
   - Verify item moved from inventory to storage
   - Withdraw item
   - Verify item returned to inventory

3. **Access private storage:**
   - Create player-owned storage
   - Verify only owner can access
   - Verify other players cannot open

4. **Capacity limits:**
   - Fill storage to capacity
   - Verify cannot deposit more
   - Error message shown

5. **Edge cases:**
   - Try to withdraw more than exists
   - Try to deposit item not in inventory
   - Guest mode (no auth) cannot access

---

### Task 14: Update documentation

**Files:**
- Modify: `docs/Objects.md`

Add storage section:

```markdown
## 10) Storage-Enabled Objects

Objects can optionally have item storage (chests, barrels, etc.).

### Creating Storage Objects

1. In sprite definition or editor, enable "Has Storage"
2. Set capacity (number of slots)
3. Set owner type: "public" (shared) or "player" (private)
4. Place object and save

### Runtime Behavior

- Press E near storage object to open
- Storage UI shows contents and player inventory
- Click items to transfer
- Capacity enforced server-side

### Backend Tables

- `storages`: Contains slots, capacity, owner
- `mapObjects.storageId`: Links to storage

### API

- `Storage.create` — Create storage instance
- `Storage.Storage.get` — Fetch storage contents
- `Storage.deposit` — Move item to storage
- `Storage.withdraw` — Move item from storage
```

**Commit:**

```bash
git add docs/Objects.md
git commit -m "docs: add storage section to Objects.md"
```

---

## Summary

**New files:**
- `convex/Storage/Storage.ts` — Main queries, validators, types
- `convex/Storage/create.ts` — Create storage mutation
- `convex/Storage/deposit.ts` — Deposit items mutation
- `convex/Storage/withdraw.ts` — Withdraw items mutation
- `convex/Storage/delete.ts` — Delete storage mutation
- `src/ui/StoragePanel.ts` — Storage UI component
- `src/ui/StoragePanel.css` — Storage UI styles

**Modified files:**
- `convex/schema.ts` — Add storages table, storageId to mapObjects
- `convex/mapObjects.ts` — Integrate storage in place/bulkSave
- `convex/items.ts` — Add listByNames query
- `src/engine/ObjectLayer.ts` — Storage detection and visual indicator
- `src/engine/Game/Game.ts` — E key handling for storage
- `docs/Objects.md` — Documentation update

**Total estimated time:** 2-3 hours

---

**Ready for implementation?** Use superpowers:executing-plans to implement task-by-task.
