/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as items from "../items.js";
import type * as lib_requireAdmin from "../lib/requireAdmin.js";
import type * as lib_requireMapEditor from "../lib/requireMapEditor.js";
import type * as mapObjects from "../mapObjects.js";
import type * as maps from "../maps.js";
import type * as mechanics_combat from "../mechanics/combat.js";
import type * as mechanics_economy from "../mechanics/economy.js";
import type * as mechanics_inventory from "../mechanics/inventory.js";
import type * as mechanics_loot from "../mechanics/loot.js";
import type * as npcEngine from "../npcEngine.js";
import type * as npcProfiles from "../npcProfiles.js";
import type * as npcs from "../npcs.js";
import type * as players from "../players.js";
import type * as presence from "../presence.js";
import type * as profiles from "../profiles.js";
import type * as spriteDefinitions from "../spriteDefinitions.js";
import type * as spriteSheets from "../spriteSheets.js";
import type * as storage from "../storage.js";
import type * as story_dialogue from "../story/dialogue.js";
import type * as story_events from "../story/events.js";
import type * as story_lore from "../story/lore.js";
import type * as story_quests from "../story/quests.js";
import type * as story_storyAi from "../story/storyAi.js";
import type * as worldItems from "../worldItems.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  chat: typeof chat;
  items: typeof items;
  "lib/requireAdmin": typeof lib_requireAdmin;
  "lib/requireMapEditor": typeof lib_requireMapEditor;
  mapObjects: typeof mapObjects;
  maps: typeof maps;
  "mechanics/combat": typeof mechanics_combat;
  "mechanics/economy": typeof mechanics_economy;
  "mechanics/inventory": typeof mechanics_inventory;
  "mechanics/loot": typeof mechanics_loot;
  npcEngine: typeof npcEngine;
  npcProfiles: typeof npcProfiles;
  npcs: typeof npcs;
  players: typeof players;
  presence: typeof presence;
  profiles: typeof profiles;
  spriteDefinitions: typeof spriteDefinitions;
  spriteSheets: typeof spriteSheets;
  storage: typeof storage;
  "story/dialogue": typeof story_dialogue;
  "story/events": typeof story_events;
  "story/lore": typeof story_lore;
  "story/quests": typeof story_quests;
  "story/storyAi": typeof story_storyAi;
  worldItems: typeof worldItems;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
