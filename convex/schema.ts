import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ---------------------------------------------------------------------------
  // Maps & tilesets
  // ---------------------------------------------------------------------------
  maps: defineTable({
    name: v.string(),
    width: v.number(), // in tiles
    height: v.number(), // in tiles
    tileWidth: v.number(), // px
    tileHeight: v.number(), // px
    tilesetUrl: v.optional(v.string()), // URL path to tileset (e.g. /assets/tilesets/...)
    tilesetId: v.optional(v.id("_storage")), // tileset PNG in Convex file storage
    tilesetPxW: v.number(),
    tilesetPxH: v.number(),
    layers: v.array(
      v.object({
        name: v.string(),
        type: v.union(
          v.literal("bg"),
          v.literal("obj"),
          v.literal("overlay")
        ),
        tiles: v.string(), // JSON-encoded flat array of tile indices (-1 = empty)
        visible: v.boolean(),
      })
    ),
    animatedTiles: v.optional(v.array(
      v.object({
        tileIndex: v.number(),
        spriteSheetId: v.id("spriteSheets"),
        animation: v.string(),
        speed: v.number(),
      })
    )),
    collisionMask: v.string(), // JSON-encoded flat boolean array
    labels: v.array(
      v.object({
        name: v.string(),
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      })
    ),
    // --- Multi-map fields ---
    portals: v.optional(v.array(
      v.object({
        name: v.string(),             // e.g. "door-to-forest"
        x: v.number(),                // zone position (tile coords)
        y: v.number(),
        width: v.number(),            // zone size in tiles
        height: v.number(),
        targetMap: v.string(),         // destination map name
        targetSpawn: v.string(),       // spawn label on destination map
        direction: v.optional(v.string()),  // facing direction on arrival
        transition: v.optional(v.string()), // "fade" | "instant" (default "fade")
      })
    )),
    animationUrl: v.optional(v.string()),    // URL to animated-tile descriptor JSON
    musicUrl: v.optional(v.string()),        // background music path
    ambientSoundUrl: v.optional(v.string()), // ambient sound loop (rain, wind)
    combatEnabled: v.optional(v.boolean()),  // is combat allowed on this map?
    status: v.optional(v.string()),          // "draft" | "published" (default "published")
    isHub: v.optional(v.boolean()),          // default spawn map for new players
    editors: v.optional(v.array(v.id("profiles"))), // per-map editor list
    creatorProfileId: v.optional(v.id("profiles")),
    createdBy: v.optional(v.id("users")),    // legacy
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Sprite sheets
  // ---------------------------------------------------------------------------
  spriteSheets: defineTable({
    name: v.string(),
    imageId: v.id("_storage"),
    frameWidth: v.number(),
    frameHeight: v.number(),
    frames: v.any(), // frame definitions (PixiJS spritesheet format)
    animations: v.any(), // animation definitions { rowName: [frameNames] }
    createdBy: v.id("users"),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Sprite definitions (prefabs created in the sprite editor)
  // ---------------------------------------------------------------------------
  spriteDefinitions: defineTable({
    name: v.string(),
    spriteSheetUrl: v.string(),       // path to the JSON sprite sheet
    defaultAnimation: v.string(),     // e.g. "row0"
    animationSpeed: v.number(),       // frames per second (0.1 = slow, 0.5 = fast)
    anchorX: v.number(),              // 0–1, default 0.5
    anchorY: v.number(),              // 0–1, default 1.0 (bottom-center)
    scale: v.number(),                // rendering scale multiplier
    isCollidable: v.boolean(),        // should block player movement?
    category: v.string(),             // "object" | "decoration" | "effect" | "npc"
    frameWidth: v.number(),           // px
    frameHeight: v.number(),          // px
    // NPC-specific fields (only used when category === "npc")
    npcSpeed: v.optional(v.number()),         // movement speed (px/sec)
    npcWanderRadius: v.optional(v.number()),  // wander radius (px)
    npcDirDown: v.optional(v.string()),       // animation row for facing down
    npcDirUp: v.optional(v.string()),         // animation row for facing up
    npcDirLeft: v.optional(v.string()),       // animation row for facing left
    npcDirRight: v.optional(v.string()),      // animation row for facing right
    npcGreeting: v.optional(v.string()),      // default greeting text
    // Sound fields (any category)
    ambientSoundUrl: v.optional(v.string()),  // looping ambient sound (e.g. fire crackle)
    ambientSoundRadius: v.optional(v.number()), // audible radius in px (default 200)
    ambientSoundVolume: v.optional(v.number()), // base volume 0–1 (default 0.5)
    interactSoundUrl: v.optional(v.string()),   // one-shot sound on interact (e.g. NPC greeting)
    // Toggleable on/off state (e.g. fireplace, lamp)
    toggleable: v.optional(v.boolean()),         // if true, player can toggle on/off
    onAnimation: v.optional(v.string()),         // animation to play when "on" (defaults to defaultAnimation)
    offAnimation: v.optional(v.string()),        // animation to play when "off" (static first frame)
    onSoundUrl: v.optional(v.string()),          // ambient sound when "on" (overrides ambientSoundUrl)
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // NPC profiles (identity, backstory, personality — for LLM feeding)
  // Keyed by unique instance name, so the same sprite def can have multiple
  // personalities placed across different maps.
  // ---------------------------------------------------------------------------
  npcProfiles: defineTable({
    name: v.string(),                  // unique instance name (e.g. "elara", "bob-merchant")
    spriteDefName: v.string(),         // links to spriteDefinitions.name (the sprite)
    mapName: v.optional(v.string()),   // which map this instance lives on
    displayName: v.string(),           // in-world display name (e.g. "Elara the Herbalist")
    title: v.optional(v.string()),     // short title/role (e.g. "Village Herbalist")
    backstory: v.optional(v.string()), // rich backstory text
    personality: v.optional(v.string()),  // personality traits / description
    dialogueStyle: v.optional(v.string()), // how they speak (formal, cryptic, friendly, etc.)
    systemPrompt: v.optional(v.string()), // full LLM system prompt (auto-generated or hand-written)
    faction: v.optional(v.string()),    // affiliation (e.g. "Merchants Guild", "Forest Druids")
    knowledge: v.optional(v.string()), // things this NPC knows about the world
    secrets: v.optional(v.string()),   // things the NPC hides from players
    relationships: v.optional(v.array(v.object({
      npcName: v.string(),            // instance name of related NPC
      relation: v.string(),           // e.g. "rival", "sibling", "mentor"
      notes: v.optional(v.string()),
    }))),
    stats: v.optional(v.object({       // combat / RPG stats
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
    })),
    items: v.optional(v.array(v.object({  // NPC inventory (for shops, drops, etc.)
      name: v.string(),
      quantity: v.number(),
    }))),
    tags: v.optional(v.array(v.string())), // general-purpose tags (e.g. "shopkeeper", "quest-giver")
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_spriteDefName", ["spriteDefName"]),

  // ---------------------------------------------------------------------------
  // Map objects (sprite instances placed on a map)
  // ---------------------------------------------------------------------------
  mapObjects: defineTable({
    mapName: v.string(),              // which map this object belongs to
    spriteDefName: v.string(),        // references spriteDefinitions.name
    instanceName: v.optional(v.string()), // unique NPC instance name (links to npcProfiles.name)
    x: v.float64(),                   // world-space X (pixels)
    y: v.float64(),                   // world-space Y (pixels)
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    layer: v.number(),                // z-ordering layer (0 = ground, higher = above)
    isOn: v.optional(v.boolean()),    // toggle state for toggleable objects (true = on)
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_map_sprite", ["mapName", "spriteDefName"]),

  // ---------------------------------------------------------------------------
  // Profiles (offline auth — no real auth dependency)
  // ---------------------------------------------------------------------------
  profiles: defineTable({
    name: v.string(),                          // display name
    spriteUrl: v.string(),                     // path to sprite sheet JSON
    color: v.string(),                         // fallback colour hex e.g. "#6c5ce7"
    role: v.optional(v.string()),               // "admin" | "player" (optional for migration)
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
    items: v.array(v.object({                  // basic inventory
      name: v.string(),
      quantity: v.number(),
    })),
    npcsChatted: v.array(v.string()),          // names of NPCs spoken to
    mapName: v.optional(v.string()),           // last map the player was on
    x: v.optional(v.float64()),               // last known X
    y: v.optional(v.float64()),               // last known Y
    direction: v.optional(v.string()),        // last facing direction
    createdAt: v.number(),
    inUse: v.optional(v.boolean()),           // true while someone is playing as this profile
    inUseSince: v.optional(v.number()),       // timestamp when claimed (for stale detection)
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Players (auth-linked – kept for future real auth)
  // ---------------------------------------------------------------------------
  players: defineTable({
    userId: v.id("users"),
    name: v.string(),
    mapId: v.optional(v.id("maps")),
    x: v.float64(),
    y: v.float64(),
    direction: v.string(),
    spriteSheetId: v.optional(v.id("spriteSheets")),
    animation: v.string(),
    stats: v.any(), // { hp, maxHp, atk, def, spd, level, xp, ... }
  })
    .index("by_user", ["userId"])
    .index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Presence (ephemeral positions, cleaned up on disconnect)
  // ---------------------------------------------------------------------------
  presence: defineTable({
    profileId: v.id("profiles"),               // which profile is online
    mapName: v.optional(v.string()),           // which map they're on
    x: v.float64(),
    y: v.float64(),
    vx: v.float64(),                           // velocity px/s (for extrapolation)
    vy: v.float64(),                           // velocity px/s (for extrapolation)
    direction: v.string(),
    animation: v.string(),
    spriteUrl: v.string(),                     // for rendering remote players
    name: v.string(),                          // denormalized for display
    lastSeen: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_profile", ["profileId"]),

  // ---------------------------------------------------------------------------
  // NPCs (legacy — kept for dialogue tree references)
  // ---------------------------------------------------------------------------
  npcs: defineTable({
    name: v.string(),
    mapId: v.id("maps"),
    x: v.float64(),
    y: v.float64(),
    spriteSheetId: v.optional(v.id("spriteSheets")),
    animation: v.string(),
    systemPrompt: v.optional(v.string()),
    behavior: v.optional(v.string()),
  }).index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // NPC runtime state (server-authoritative movement)
  // ---------------------------------------------------------------------------
  npcState: defineTable({
    mapName: v.string(),
    mapObjectId: v.id("mapObjects"),      // link to the placed object
    spriteDefName: v.string(),            // for looking up rendering config
    instanceName: v.optional(v.string()), // unique NPC instance name (from mapObjects)
    x: v.float64(),                       // current position
    y: v.float64(),
    spawnX: v.float64(),                  // original placement position
    spawnY: v.float64(),
    direction: v.string(),                // "up" | "down" | "left" | "right"
    vx: v.float64(),                      // current velocity (for client extrapolation)
    vy: v.float64(),
    speed: v.float64(),                   // movement speed px/sec
    wanderRadius: v.float64(),
    targetX: v.optional(v.float64()),     // wander target (null = idle)
    targetY: v.optional(v.float64()),
    idleUntil: v.optional(v.number()),    // timestamp: don't move until this time
    lastTick: v.number(),                 // timestamp of last server update
  })
    .index("by_map", ["mapName"])
    .index("by_mapObject", ["mapObjectId"]),

  // ---------------------------------------------------------------------------
  // Chat messages
  // ---------------------------------------------------------------------------
  messages: defineTable({
    mapName: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),  // null for system messages
    senderName: v.string(),                   // denormalized for display
    text: v.string(),
    type: v.union(
      v.literal("chat"),
      v.literal("npc"),
      v.literal("system")
    ),
    timestamp: v.number(),
  }).index("by_map_time", ["mapName", "timestamp"]),

  // ---------------------------------------------------------------------------
  // Story tables
  // ---------------------------------------------------------------------------
  quests: defineTable({
    name: v.string(),
    description: v.string(),
    steps: v.any(), // ordered array of quest step objects
    prerequisites: v.array(v.id("quests")),
    rewards: v.any(), // { items: [], xp: number, currency: {} }
  }).index("by_name", ["name"]),

  questProgress: defineTable({
    playerId: v.id("players"),
    questId: v.id("quests"),
    currentStep: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed")
    ),
    choices: v.any(), // record of branch decisions
  })
    .index("by_player", ["playerId"])
    .index("by_player_quest", ["playerId", "questId"]),

  dialogueTrees: defineTable({
    npcId: v.optional(v.id("npcs")),
    triggerId: v.optional(v.string()),
    nodes: v.any(), // array of dialogue nodes
    metadata: v.any(),
  }).index("by_npc", ["npcId"]),

  lore: defineTable({
    key: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.union(
      v.literal("world"),
      v.literal("character"),
      v.literal("item")
    ),
    discoverable: v.boolean(),
    discoveredBy: v.array(v.id("players")),
    draft: v.optional(v.boolean()),
  }).index("by_key", ["key"]),

  storyEvents: defineTable({
    mapId: v.optional(v.id("maps")),
    triggerId: v.string(),
    type: v.string(), // "enter-zone" | "interact" | "combat-end" | etc.
    conditions: v.any(),
    script: v.any(), // sequence of actions
  }).index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Mechanics tables
  // ---------------------------------------------------------------------------
  itemDefs: defineTable({
    name: v.string(),                  // unique slug (e.g. "iron-sword", "health-potion")
    displayName: v.string(),           // pretty display name
    description: v.string(),           // flavour / tooltip text
    type: v.union(
      v.literal("weapon"),
      v.literal("armor"),
      v.literal("accessory"),
      v.literal("consumable"),
      v.literal("material"),
      v.literal("key"),
      v.literal("currency"),
      v.literal("quest"),
      v.literal("misc")
    ),
    rarity: v.union(
      v.literal("common"),
      v.literal("uncommon"),
      v.literal("rare"),
      v.literal("epic"),
      v.literal("legendary"),
      v.literal("unique")             // one-of-a-kind, cannot be duplicated
    ),
    iconUrl: v.optional(v.string()),   // path to icon image/sprite
    iconSpriteSheetId: v.optional(v.id("spriteSheets")),
    // Tileset-based icon (crop from a tileset image)
    iconTilesetUrl: v.optional(v.string()),  // tileset image path
    iconTileX: v.optional(v.number()),       // crop X in px
    iconTileY: v.optional(v.number()),       // crop Y in px
    iconTileW: v.optional(v.number()),       // crop width in px
    iconTileH: v.optional(v.number()),       // crop height in px
    // Stats / properties
    stats: v.optional(v.object({
      atk: v.optional(v.number()),
      def: v.optional(v.number()),
      spd: v.optional(v.number()),
      hp: v.optional(v.number()),          // flat HP bonus
      maxHp: v.optional(v.number()),       // max HP bonus
    })),
    effects: v.optional(v.array(v.object({  // special effects / properties
      type: v.string(),                     // e.g. "heal", "buff", "poison", "teleport"
      value: v.optional(v.number()),        // magnitude
      duration: v.optional(v.number()),     // seconds (for buffs/debuffs)
      description: v.optional(v.string()),  // human-readable
    }))),
    equipSlot: v.optional(v.string()),      // "weapon" | "head" | "body" | "legs" | "feet" | "accessory" | null
    levelRequirement: v.optional(v.number()),
    stackable: v.boolean(),
    maxStack: v.optional(v.number()),       // max per stack (default 99)
    value: v.number(),                      // base currency value
    isUnique: v.optional(v.boolean()),      // true = only one can exist in the game
    tags: v.optional(v.array(v.string())),  // freeform tags (e.g. "fire", "cursed", "two-handed")
    lore: v.optional(v.string()),           // extended lore text
    createdBy: v.optional(v.id("profiles")),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // World items (items placed on maps — can be picked up by players)
  // ---------------------------------------------------------------------------
  worldItems: defineTable({
    mapName: v.string(),
    itemDefName: v.string(),         // references itemDefs.name
    x: v.float64(),
    y: v.float64(),
    quantity: v.number(),            // how many of this item the pickup gives
    respawn: v.optional(v.boolean()), // if true, reappears after pickup (for common items)
    respawnMs: v.optional(v.number()), // respawn delay in ms
    pickedUpAt: v.optional(v.number()), // timestamp of last pickup (null = available)
    pickedUpBy: v.optional(v.id("profiles")),
    placedBy: v.optional(v.id("profiles")),
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"]),

  inventories: defineTable({
    playerId: v.id("players"),
    slots: v.any(), // array of { itemDefId, quantity, metadata }
  }).index("by_player", ["playerId"]),

  combatEncounters: defineTable({
    enemies: v.any(), // array of { npcId, level, stats }
    rewards: v.any(),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  }).index("by_map", ["mapId"]),

  combatLog: defineTable({
    encounterId: v.id("combatEncounters"),
    playerId: v.id("players"),
    turns: v.any(),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
    timestamp: v.number(),
  }).index("by_player", ["playerId"]),

  wallets: defineTable({
    playerId: v.id("players"),
    currencies: v.any(), // record of currency-name to amount
  }).index("by_player", ["playerId"]),

  shops: defineTable({
    npcId: v.id("npcs"),
    inventory: v.any(), // array of { itemDefId, price, stock }
    mapId: v.optional(v.id("maps")),
  }).index("by_npc", ["npcId"]),
});
