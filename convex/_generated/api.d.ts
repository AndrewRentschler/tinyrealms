/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_backfills from "../admin/backfills.js";
import type * as admin_clear from "../admin/clear.js";
import type * as admin_export from "../admin/export.js";
import type * as admin_index from "../admin/index.js";
import type * as admin_inspection from "../admin/inspection.js";
import type * as admin_mapPlan from "../admin/mapPlan.js";
import type * as admin_maps from "../admin/maps.js";
import type * as admin_restore from "../admin/restore.js";
import type * as admin_users from "../admin/users.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as entityLocations from "../entityLocations.js";
import type * as globalChunks from "../globalChunks.js";
import type * as globalSpatial from "../globalSpatial.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib_globalSpatial from "../lib/globalSpatial.js";
import type * as lib_profileRole from "../lib/profileRole.js";
import type * as lib_requireAdmin from "../lib/requireAdmin.js";
import type * as lib_requireAdminKey from "../lib/requireAdminKey.js";
import type * as lib_requireMapEditor from "../lib/requireMapEditor.js";
import type * as lib_requireSuperuser from "../lib/requireSuperuser.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as mapObjects from "../mapObjects.js";
import type * as maps_constants from "../maps/constants.js";
import type * as maps_index from "../maps/index.js";
import type * as maps_mutations from "../maps/mutations.js";
import type * as maps_queries from "../maps/queries.js";
import type * as mechanics_combat_aggro from "../mechanics/combat/aggro.js";
import type * as mechanics_combat_constants from "../mechanics/combat/constants.js";
import type * as mechanics_combat_index from "../mechanics/combat/index.js";
import type * as mechanics_combat_logging from "../mechanics/combat/logging.js";
import type * as mechanics_combat_playerAttack from "../mechanics/combat/playerAttack.js";
import type * as mechanics_combat_queries from "../mechanics/combat/queries.js";
import type * as mechanics_dimensionTransition from "../mechanics/dimensionTransition.js";
import type * as mechanics_economy from "../mechanics/economy.js";
import type * as mechanics_energy from "../mechanics/energy.js";
import type * as mechanics_inventory from "../mechanics/inventory.js";
import type * as mechanics_loot from "../mechanics/loot.js";
import type * as migrations from "../migrations.js";
import type * as npc_braintrust from "../npc/braintrust.js";
import type * as npc_memory from "../npc/memory.js";
import type * as npcEngine from "../npcEngine.js";
import type * as npcProfiles_helpers from "../npcProfiles/helpers.js";
import type * as npcProfiles_index from "../npcProfiles/index.js";
import type * as npcProfiles_mutations from "../npcProfiles/mutations.js";
import type * as npcProfiles_queries from "../npcProfiles/queries.js";
import type * as npcs from "../npcs.js";
import type * as players from "../players.js";
import type * as portalDefs from "../portalDefs.js";
import type * as presence from "../presence.js";
import type * as profiles from "../profiles.js";
import type * as spriteDefinitions from "../spriteDefinitions.js";
import type * as spriteSheets from "../spriteSheets.js";
import type * as storage from "../storage.js";
import type * as storage_create from "../storage/create.js";
import type * as storage_delete from "../storage/delete.js";
import type * as storage_deposit from "../storage/deposit.js";
import type * as storage_storage from "../storage/storage.js";
import type * as storage_withdraw from "../storage/withdraw.js";
import type * as story_dialogue from "../story/dialogue.js";
import type * as story_events from "../story/events.js";
import type * as story_lore from "../story/lore.js";
import type * as story_quests from "../story/quests.js";
import type * as story_storyAi from "../story/storyAi.js";
import type * as superuser from "../superuser.js";
import type * as weather from "../weather.js";
import type * as worldItems from "../worldItems.js";
import type * as worldTime from "../worldTime.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/backfills": typeof admin_backfills;
  "admin/clear": typeof admin_clear;
  "admin/export": typeof admin_export;
  "admin/index": typeof admin_index;
  "admin/inspection": typeof admin_inspection;
  "admin/mapPlan": typeof admin_mapPlan;
  "admin/maps": typeof admin_maps;
  "admin/restore": typeof admin_restore;
  "admin/users": typeof admin_users;
  ai: typeof ai;
  auth: typeof auth;
  chat: typeof chat;
  entityLocations: typeof entityLocations;
  globalChunks: typeof globalChunks;
  globalSpatial: typeof globalSpatial;
  http: typeof http;
  items: typeof items;
  "lib/globalSpatial": typeof lib_globalSpatial;
  "lib/profileRole": typeof lib_profileRole;
  "lib/requireAdmin": typeof lib_requireAdmin;
  "lib/requireAdminKey": typeof lib_requireAdminKey;
  "lib/requireMapEditor": typeof lib_requireMapEditor;
  "lib/requireSuperuser": typeof lib_requireSuperuser;
  "lib/visibility": typeof lib_visibility;
  mapObjects: typeof mapObjects;
  "maps/constants": typeof maps_constants;
  "maps/index": typeof maps_index;
  "maps/mutations": typeof maps_mutations;
  "maps/queries": typeof maps_queries;
  "mechanics/combat/aggro": typeof mechanics_combat_aggro;
  "mechanics/combat/constants": typeof mechanics_combat_constants;
  "mechanics/combat/index": typeof mechanics_combat_index;
  "mechanics/combat/logging": typeof mechanics_combat_logging;
  "mechanics/combat/playerAttack": typeof mechanics_combat_playerAttack;
  "mechanics/combat/queries": typeof mechanics_combat_queries;
  "mechanics/dimensionTransition": typeof mechanics_dimensionTransition;
  "mechanics/economy": typeof mechanics_economy;
  "mechanics/energy": typeof mechanics_energy;
  "mechanics/inventory": typeof mechanics_inventory;
  "mechanics/loot": typeof mechanics_loot;
  migrations: typeof migrations;
  "npc/braintrust": typeof npc_braintrust;
  "npc/memory": typeof npc_memory;
  npcEngine: typeof npcEngine;
  "npcProfiles/helpers": typeof npcProfiles_helpers;
  "npcProfiles/index": typeof npcProfiles_index;
  "npcProfiles/mutations": typeof npcProfiles_mutations;
  "npcProfiles/queries": typeof npcProfiles_queries;
  npcs: typeof npcs;
  players: typeof players;
  portalDefs: typeof portalDefs;
  presence: typeof presence;
  profiles: typeof profiles;
  spriteDefinitions: typeof spriteDefinitions;
  spriteSheets: typeof spriteSheets;
  storage: typeof storage;
  "storage/create": typeof storage_create;
  "storage/delete": typeof storage_delete;
  "storage/deposit": typeof storage_deposit;
  "storage/storage": typeof storage_storage;
  "storage/withdraw": typeof storage_withdraw;
  "story/dialogue": typeof story_dialogue;
  "story/events": typeof story_events;
  "story/lore": typeof story_lore;
  "story/quests": typeof story_quests;
  "story/storyAi": typeof story_storyAi;
  superuser: typeof superuser;
  weather: typeof weather;
  worldItems: typeof worldItems;
  worldTime: typeof worldTime;
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
