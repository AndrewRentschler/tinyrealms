import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // ---------------------------------------------------------------------------
  // Maps & tilesets
  // ---------------------------------------------------------------------------
  maps: defineTable({
    schemaVersion: v.optional(v.number()), // migration version tracker
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
        type: v.union(v.literal("bg"), v.literal("obj"), v.literal("overlay")),
        tiles: v.string(), // JSON-encoded flat array of tile indices (-1 = empty)
        visible: v.boolean(),
        tilesetUrl: v.optional(v.string()), // optional per-layer tileset override
      }),
    ),
    animatedTiles: v.optional(
      v.array(
        v.object({
          tileIndex: v.number(),
          spriteSheetId: v.id("spriteSheets"),
          animation: v.string(),
          speed: v.number(),
        }),
      ),
    ),
    collisionMask: v.string(), // JSON-encoded flat boolean array
    labels: v.array(
      v.object({
        name: v.string(),
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    // --- Multi-map fields ---
    portals: v.optional(
      v.array(
        v.object({
          name: v.string(), // e.g. "door-to-forest"
          x: v.number(), // zone position (tile coords)
          y: v.number(),
          width: v.number(), // zone size in tiles
          height: v.number(),
          targetMap: v.string(), // destination map name
          targetSpawn: v.string(), // spawn label on destination map
          direction: v.optional(v.string()), // facing direction on arrival
          transition: v.optional(v.string()), // "fade" | "instant" (default "fade")
        }),
      ),
    ),
    animationUrl: v.optional(v.string()), // URL to animated-tile descriptor JSON
    musicUrl: v.optional(v.string()), // background music path
    ambientSoundUrl: v.optional(v.string()), // ambient sound loop (rain, wind)
    weatherMode: v.optional(
      v.union(
        v.literal("clear"),
        v.literal("rainy"),
        v.literal("scattered_rain"),
      ),
    ),
    weatherIntensity: v.optional(
      v.union(v.literal("light"), v.literal("medium"), v.literal("heavy")),
    ),
    weatherRainSfx: v.optional(v.boolean()),
    weatherLightningEnabled: v.optional(v.boolean()),
    weatherLightningChancePerSec: v.optional(v.number()),
    combatEnabled: v.optional(v.boolean()), // is combat allowed on this map?
    combatSettings: v.optional(
      v.object({
        attackRangePx: v.optional(v.number()),
        playerAttackCooldownMs: v.optional(v.number()),
        npcHitCooldownMs: v.optional(v.number()),
        damageVariancePct: v.optional(v.number()),
      }),
    ),
    status: v.optional(v.string()), // "draft" | "published" (default "published")
    mapType: v.optional(v.string()), // "public" | "private" | "system" (default "private")
    editors: v.optional(v.array(v.id("profiles"))), // per-map editor list
    creatorProfileId: v.optional(v.id("profiles")),
    createdBy: v.optional(v.id("users")), // user who created this map (for ownership checks)
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Global weather controller (singleton row keyed by "global")
  // ---------------------------------------------------------------------------
  weatherGlobal: defineTable({
    key: v.string(), // always "global"
    rainyNow: v.boolean(),
    rainyPercent: v.number(), // 0..1 probability each weather tick
    tickIntervalMs: v.number(),
    updatedAt: v.number(),
    lastTickAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  // ---------------------------------------------------------------------------
  // Sprite sheets
  // ---------------------------------------------------------------------------
  spriteSheets: defineTable({
    name: v.string(),
    imageId: v.id("_storage"),
    frameWidth: v.number(),
    frameHeight: v.number(),
    // PixiJS spritesheet format — keys are frame names, values are frame rects.
    // Dynamic key-value maps, so we use v.record() rather than v.any().
    frames: v.record(
      v.string(),
      v.object({
        frame: v.object({
          x: v.number(),
          y: v.number(),
          w: v.number(),
          h: v.number(),
        }),
        rotated: v.optional(v.boolean()),
        trimmed: v.optional(v.boolean()),
        spriteSourceSize: v.optional(
          v.object({
            x: v.number(),
            y: v.number(),
            w: v.number(),
            h: v.number(),
          }),
        ),
        sourceSize: v.optional(v.object({ w: v.number(), h: v.number() })),
      }),
    ),
    animations: v.record(v.string(), v.array(v.string())), // { rowName: [frameNames] }
    createdBy: v.id("users"),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Sprite definitions (prefabs created in the sprite editor)
  // ---------------------------------------------------------------------------
  spriteDefinitions: defineTable({
    name: v.string(),
    spriteSheetUrl: v.string(), // path to the JSON sprite sheet
    defaultAnimation: v.string(), // e.g. "row0"
    animationSpeed: v.number(), // frames per second (0.1 = slow, 0.5 = fast)
    anchorX: v.number(), // 0–1, default 0.5
    anchorY: v.number(), // 0–1, default 1.0 (bottom-center)
    scale: v.number(), // rendering scale multiplier
    isCollidable: v.boolean(), // should block player movement?
    category: v.string(), // "object" | "npc"
    frameWidth: v.number(), // px
    frameHeight: v.number(), // px
    // NPC-specific fields (only used when category === "npc")
    npcSpeed: v.optional(v.number()), // movement speed (px/sec)
    npcWanderRadius: v.optional(v.number()), // wander radius (px)
    npcDirDown: v.optional(v.string()), // animation row for facing down
    npcDirUp: v.optional(v.string()), // animation row for facing up
    npcDirLeft: v.optional(v.string()), // animation row for facing left
    npcDirRight: v.optional(v.string()), // animation row for facing right
    npcGreeting: v.optional(v.string()), // default greeting text
    // Sound fields (any category)
    ambientSoundUrl: v.optional(v.string()), // looping ambient sound (e.g. fire crackle)
    ambientSoundRadius: v.optional(v.number()), // audible radius in px (default 200)
    ambientSoundVolume: v.optional(v.number()), // base volume 0–1 (default 0.5)
    interactSoundUrl: v.optional(v.string()), // one-shot sound on interact (e.g. NPC greeting)
    // Toggleable on/off state (e.g. fireplace, lamp)
    toggleable: v.optional(v.boolean()), // if true, player can toggle on/off
    onAnimation: v.optional(v.string()), // animation to play when "on" (defaults to defaultAnimation)
    offAnimation: v.optional(v.string()), // animation to play when "off" (static first frame)
    onSoundUrl: v.optional(v.string()), // ambient sound when "on" (overrides ambientSoundUrl)
    // Door (4-state: closed → opening → open → closing → closed)
    isDoor: v.optional(v.boolean()), // if true, this sprite acts as a door
    doorClosedAnimation: v.optional(v.string()), // idle animation when closed
    doorOpeningAnimation: v.optional(v.string()), // transition: closed → open (plays once)
    doorOpenAnimation: v.optional(v.string()), // idle animation when open
    doorClosingAnimation: v.optional(v.string()), // transition: open → closed (plays once)
    doorOpenSoundUrl: v.optional(v.string()), // one-shot sound when door opens
    doorCloseSoundUrl: v.optional(v.string()), // one-shot sound when door closes
    visibilityType: v.optional(v.string()), // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")), // owner user for private/public assets
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // NPC profiles (identity, backstory, personality — for LLM feeding)
  // Keyed by unique instance name, so the same sprite def can have multiple
  // personalities placed across different maps.
  // ---------------------------------------------------------------------------
  npcProfiles: defineTable({
    name: v.string(), // unique instance name (e.g. "elara", "bob-merchant")
    instanceType: v.optional(
      v.union(v.literal("animal"), v.literal("character")),
    ),
    spriteDefName: v.string(), // links to spriteDefinitions.name (the sprite)
    mapName: v.optional(v.string()), // which map this instance lives on
    displayName: v.string(), // in-world display name (e.g. "Elara the Herbalist")
    title: v.optional(v.string()), // short title/role (e.g. "Village Herbalist")
    backstory: v.optional(v.string()), // rich backstory text
    personality: v.optional(v.string()), // personality traits / description
    dialogueStyle: v.optional(v.string()), // how they speak (formal, cryptic, friendly, etc.)
    moveSpeed: v.optional(v.number()), // behavior: movement speed (px/sec)
    wanderRadius: v.optional(v.number()), // behavior: wander radius (px)
    greeting: v.optional(v.string()), // behavior: default greeting line for procedural chat
    logicKey: v.optional(v.string()), // optional server-side procedural logic registry key
    logicConfig: v.optional(v.any()), // optional logic configuration payload
    systemPrompt: v.optional(v.string()), // full LLM system prompt (auto-generated or hand-written)
    faction: v.optional(v.string()), // affiliation (e.g. "Merchants Guild", "Forest Druids")
    knowledge: v.optional(v.string()), // things this NPC knows about the world
    secrets: v.optional(v.string()), // things the NPC hides from players
    relationships: v.optional(
      v.array(
        v.object({
          npcName: v.string(), // instance name of related NPC
          relation: v.string(), // e.g. "rival", "sibling", "mentor"
          notes: v.optional(v.string()),
        }),
      ),
    ),
    stats: v.optional(
      v.object({
        // combat / RPG stats
        hp: v.number(),
        maxHp: v.number(),
        atk: v.number(),
        def: v.number(),
        spd: v.number(),
        level: v.number(),
      }),
    ),
    items: v.optional(
      v.array(
        v.object({
          // NPC inventory (for shops, drops, etc.)
          name: v.string(),
          quantity: v.number(),
        }),
      ),
    ),
    tags: v.optional(v.array(v.string())), // general-purpose tags (e.g. "shopkeeper", "quest-giver")
    aggression: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    npcType: v.optional(v.union(v.literal("procedural"), v.literal("ai"))),
    aiEnabled: v.optional(v.boolean()),
    braintrustSlug: v.optional(v.string()),
    aiPolicy: v.optional(
      v.object({
        capabilities: v.optional(
          v.object({
            canChat: v.optional(v.boolean()),
            canNavigate: v.optional(v.boolean()),
            canPickupItems: v.optional(v.boolean()),
            canUseShops: v.optional(v.boolean()),
            canCombat: v.optional(v.boolean()),
            canAffectQuests: v.optional(v.boolean()),
            canUsePortals: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
    visibilityType: v.optional(v.string()), // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")), // owner user for private/public NPC profiles
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_spriteDefName", ["spriteDefName"])
    .index("by_npcType", ["npcType"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // Map objects (sprite instances placed on a map)
  // ---------------------------------------------------------------------------
  mapObjects: defineTable({
    mapName: v.string(), // which map this object belongs to
    spriteDefName: v.string(), // references spriteDefinitions.name
    instanceName: v.optional(v.string()), // unique NPC instance name (links to npcProfiles.name)
    x: v.float64(), // world-space X (pixels)
    y: v.float64(), // world-space Y (pixels)
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    layer: v.number(), // z-ordering layer (0 = ground, higher = above)
    isOn: v.optional(v.boolean()), // toggle state for toggleable objects (true = on)
    storageId: v.optional(v.id("storages")), // links to storages table
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_map_sprite", ["mapName", "spriteDefName"])
    .index("by_storage", ["storageId"]),

  // ---------------------------------------------------------------------------
  // Storages (item containers for map objects and banks)
  // ---------------------------------------------------------------------------
  storages: defineTable({
    // Ownership model
    ownerType: v.union(v.literal("public"), v.literal("player")),
    ownerId: v.optional(v.id("profiles")), // null if public

    // Capacity (per-instance, defined at creation)
    capacity: v.number(), // max slots

    // Item slots (same structure as inventories.slots)
    slots: v.array(
      v.object({
        itemDefName: v.string(),
        quantity: v.number(),
        metadata: v.optional(v.record(v.string(), v.string())),
      }),
    ),

    // Metadata
    name: v.optional(v.string()), // e.g., "Chest", "Bank Vault"
    updatedAt: v.number(),
  }).index("by_owner", ["ownerType", "ownerId"]),

  // ---------------------------------------------------------------------------
  // Profiles (auth-linked player characters)
  // ---------------------------------------------------------------------------
  profiles: defineTable({
    schemaVersion: v.optional(v.number()), // migration version tracker
    userId: v.optional(v.id("users")), // owning user (optional during migration)
    name: v.string(), // display name
    spriteUrl: v.string(), // path to sprite sheet JSON
    color: v.string(), // fallback colour hex e.g. "#6c5ce7"
    role: v.optional(v.string()), // "superuser" | "player"
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
    items: v.array(
      v.object({
        // basic inventory
        name: v.string(),
        quantity: v.number(),
      }),
    ),
    npcsChatted: v.array(v.string()), // names of NPCs spoken to
    mapName: v.string(), // last map the player was on
    startLabel: v.optional(v.string()), // preferred spawn label for initial entry
    x: v.optional(v.float64()), // last known X
    y: v.optional(v.float64()), // last known Y
    direction: v.optional(v.string()), // last facing direction
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_user", ["userId"]),

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
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
  })
    .index("by_user", ["userId"])
    .index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Presence (ephemeral positions, cleaned up on disconnect)
  // ---------------------------------------------------------------------------
  presence: defineTable({
    profileId: v.id("profiles"), // which profile is online
    mapName: v.optional(v.string()), // which map they're on
    x: v.float64(),
    y: v.float64(),
    vx: v.float64(), // velocity px/s (for extrapolation)
    vy: v.float64(), // velocity px/s (for extrapolation)
    direction: v.string(),
    animation: v.string(),
    spriteUrl: v.string(), // for rendering remote players
    name: v.string(), // denormalized for display
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
    mapObjectId: v.id("mapObjects"), // link to the placed object
    spriteDefName: v.string(), // for looking up rendering config
    instanceName: v.optional(v.string()), // unique NPC instance name (from mapObjects)
    x: v.float64(), // current position
    y: v.float64(),
    spawnX: v.float64(), // original placement position
    spawnY: v.float64(),
    direction: v.optional(v.string()), // "up" | "down" | "left" | "right"
    vx: v.float64(), // current velocity (for client extrapolation)
    vy: v.float64(),
    speed: v.float64(), // movement speed px/sec
    wanderRadius: v.float64(),
    targetX: v.optional(v.float64()), // wander target (null = idle)
    targetY: v.optional(v.float64()),
    idleUntil: v.optional(v.number()), // timestamp: don't move until this time
    currentHp: v.optional(v.number()), // combat: current health
    maxHp: v.optional(v.number()), // combat: max health
    defeatedAt: v.optional(v.number()), // combat: when NPC was defeated
    respawnAt: v.optional(v.number()), // combat: when NPC should respawn
    lastHitAt: v.optional(v.number()), // combat: throttle repeated hits
    aggroTargetProfileId: v.optional(v.id("profiles")), // medium/high aggression target lock
    aggroUntil: v.optional(v.number()), // target lock expiration
    lastTick: v.number(), // timestamp of last server update
  })
    .index("by_map", ["mapName"])
    .index("by_mapObject", ["mapObjectId"]),

  // ---------------------------------------------------------------------------
  // AI NPC conversation + memory + action audit
  // ---------------------------------------------------------------------------
  npcConversations: defineTable({
    npcProfileName: v.string(),
    mapName: v.optional(v.string()),
    actorProfileId: v.optional(v.id("profiles")),
    role: v.union(
      v.literal("system"),
      v.literal("user"),
      v.literal("assistant"),
    ),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_npc", ["npcProfileName"])
    .index("by_npc_time", ["npcProfileName", "createdAt"])
    .index("by_actor", ["actorProfileId"]),

  npcMemories: defineTable({
    npcProfileName: v.string(),
    summary: v.string(),
    sourceConversationAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_npc", ["npcProfileName"]),

  npcActionLog: defineTable({
    npcProfileName: v.string(),
    intentType: v.string(),
    accepted: v.boolean(),
    reason: v.optional(v.string()),
    sideEffects: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_npc", ["npcProfileName"])
    .index("by_npc_time", ["npcProfileName", "createdAt"]),

  // ---------------------------------------------------------------------------
  // Chat messages
  // ---------------------------------------------------------------------------
  messages: defineTable({
    mapName: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")), // null for system messages
    senderName: v.string(), // denormalized for display
    text: v.string(),
    type: v.union(v.literal("chat"), v.literal("npc"), v.literal("system")),
    timestamp: v.number(),
  }).index("by_map_time", ["mapName", "timestamp"]),

  // ---------------------------------------------------------------------------
  // Story tables
  // ---------------------------------------------------------------------------
  quests: defineTable({
    name: v.string(),
    description: v.string(),
    steps: v.array(
      v.object({
        description: v.string(),
        type: v.optional(v.string()), // "kill" | "collect" | "talk" | "reach" | etc.
        target: v.optional(v.string()), // NPC name, item name, label name
        count: v.optional(v.number()), // required amount
        optional: v.optional(v.boolean()),
      }),
    ),
    prerequisites: v.array(v.id("quests")),
    rewards: v.object({
      items: v.optional(
        v.array(v.object({ name: v.string(), quantity: v.number() })),
      ),
      xp: v.optional(v.number()),
      currency: v.optional(v.record(v.string(), v.number())),
    }),
  }).index("by_name", ["name"]),

  questProgress: defineTable({
    profileId: v.id("profiles"),
    questId: v.id("quests"),
    currentStep: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    choices: v.record(v.string(), v.string()), // step key -> chosen branch
  })
    .index("by_profile", ["profileId"])
    .index("by_profile_quest", ["profileId", "questId"]),

  // ---------------------------------------------------------------------------
  // Quest system v2 (template defs + per-player instances)
  // ---------------------------------------------------------------------------
  questDefs: defineTable({
    key: v.string(), // stable template key (e.g. "collect-mushroom-001")
    title: v.string(),
    description: v.string(),
    sourceType: v.union(
      v.literal("npc"),
      v.literal("hud"),
      v.literal("system"),
    ),
    offeredByNpcInstanceName: v.optional(v.string()),
    repeatable: v.boolean(),
    cooldownMs: v.optional(v.number()),
    objectives: v.array(
      v.union(
        v.object({
          type: v.literal("collect_item"),
          itemDefName: v.string(),
          requiredCount: v.number(),
        }),
        v.object({
          type: v.literal("kill_npc"),
          targetType: v.optional(
            v.union(v.literal("npc_instance"), v.literal("npc_class")),
          ),
          targetNpcProfileName: v.optional(v.string()),
          targetNpcClassName: v.optional(v.string()),
          requiredCount: v.number(),
        }),
      ),
    ),
    rewards: v.object({
      xp: v.optional(v.number()),
      gold: v.optional(v.number()),
      items: v.optional(
        v.array(
          v.object({
            itemDefName: v.string(),
            quantity: v.number(),
          }),
        ),
      ),
    }),
    failure: v.optional(
      v.object({
        penaltyType: v.union(
          v.literal("goldLoss"),
          v.literal("hpLoss"),
          v.literal("death"),
        ),
        amount: v.optional(v.number()), // required for goldLoss/hpLoss
        reason: v.optional(v.string()),
      }),
    ),
    timeLimitMs: v.optional(v.number()),
    mapScope: v.optional(v.union(v.literal("any"), v.string())),
    visibilityType: v.optional(v.string()), // "public" | "private" | "system"
    createdByUser: v.optional(v.id("users")),
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_sourceType", ["sourceType"])
    .index("by_offeredByNpc", ["offeredByNpcInstanceName"])
    .index("by_enabled", ["enabled"]),

  playerQuests: defineTable({
    profileId: v.id("profiles"),
    questDefKey: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("abandoned"),
    ),
    acceptedAt: v.number(),
    deadlineAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    rewardClaimedAt: v.optional(v.number()),
    failureAppliedAt: v.optional(v.number()),
    source: v.object({
      type: v.union(v.literal("npc"), v.literal("hud")),
      npcInstanceName: v.optional(v.string()),
    }),
    progress: v.array(
      v.object({
        type: v.union(v.literal("collect_item"), v.literal("kill_npc")),
        targetType: v.optional(
          v.union(v.literal("npc_instance"), v.literal("npc_class")),
        ),
        targetKey: v.string(),
        currentCount: v.number(),
        requiredCount: v.number(),
      }),
    ),
  })
    .index("by_profile", ["profileId"])
    .index("by_profile_status", ["profileId", "status"])
    .index("by_status_deadline", ["status", "deadlineAt"]),

  dialogueTrees: defineTable({
    npcId: v.optional(v.id("npcs")),
    triggerId: v.optional(v.string()),
    nodes: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        speaker: v.optional(v.string()),
        choices: v.optional(
          v.array(
            v.object({
              text: v.string(),
              nextNodeId: v.optional(v.string()),
              condition: v.optional(v.string()),
            }),
          ),
        ),
        nextNodeId: v.optional(v.string()),
        action: v.optional(v.string()),
      }),
    ),
    metadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
      }),
    ),
  }).index("by_npc", ["npcId"]),

  lore: defineTable({
    key: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.union(
      v.literal("world"),
      v.literal("character"),
      v.literal("item"),
    ),
    discoverable: v.boolean(),
    discoveredBy: v.array(v.id("profiles")),
    draft: v.optional(v.boolean()),
  }).index("by_key", ["key"]),

  storyEvents: defineTable({
    mapId: v.optional(v.id("maps")),
    triggerId: v.string(),
    type: v.string(), // "enter-zone" | "interact" | "combat-end" | etc.
    conditions: v.optional(
      v.object({
        requiredQuest: v.optional(v.string()),
        requiredItem: v.optional(v.string()),
        minLevel: v.optional(v.number()),
        flag: v.optional(v.string()),
      }),
    ),
    script: v.array(
      v.object({
        action: v.string(), // "dialogue" | "give-item" | "teleport" | "set-flag" | etc.
        args: v.optional(v.record(v.string(), v.string())),
      }),
    ),
  }).index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Mechanics tables
  // ---------------------------------------------------------------------------
  itemDefs: defineTable({
    name: v.string(), // unique slug (e.g. "iron-sword", "health-potion")
    displayName: v.string(), // pretty display name
    description: v.string(), // flavour / tooltip text
    type: v.union(
      v.literal("weapon"),
      v.literal("armor"),
      v.literal("accessory"),
      v.literal("consumable"),
      v.literal("material"),
      v.literal("key"),
      v.literal("currency"),
      v.literal("quest"),
      v.literal("misc"),
    ),
    rarity: v.union(
      v.literal("common"),
      v.literal("uncommon"),
      v.literal("rare"),
      v.literal("epic"),
      v.literal("legendary"),
      v.literal("unique"), // one-of-a-kind, cannot be duplicated
    ),
    iconUrl: v.optional(v.string()), // path to icon image/sprite
    iconSpriteSheetId: v.optional(v.id("spriteSheets")),
    // Tileset-based icon (crop from a tileset image)
    iconTilesetUrl: v.optional(v.string()), // tileset image path
    iconTileX: v.optional(v.number()), // crop X in px
    iconTileY: v.optional(v.number()), // crop Y in px
    iconTileW: v.optional(v.number()), // crop width in px
    iconTileH: v.optional(v.number()), // crop height in px
    iconSpriteDefName: v.optional(v.string()), // optional animated icon from non-toggle object sprite def
    // Stats / properties
    stats: v.optional(
      v.object({
        atk: v.optional(v.number()),
        def: v.optional(v.number()),
        spd: v.optional(v.number()),
        hp: v.optional(v.number()), // flat HP bonus
        maxHp: v.optional(v.number()), // max HP bonus
      }),
    ),
    effects: v.optional(
      v.array(
        v.object({
          // special effects / properties
          type: v.string(), // e.g. "heal", "buff", "poison", "teleport"
          value: v.optional(v.number()), // magnitude
          duration: v.optional(v.number()), // seconds (for buffs/debuffs)
          description: v.optional(v.string()), // human-readable
        }),
      ),
    ),
    equipSlot: v.optional(v.string()), // "weapon" | "head" | "body" | "legs" | "feet" | "accessory" | null
    levelRequirement: v.optional(v.number()),
    stackable: v.boolean(),
    maxStack: v.optional(v.number()), // max per stack (default 99)
    value: v.number(), // base currency value
    isUnique: v.optional(v.boolean()), // true = only one can exist in the game
    tags: v.optional(v.array(v.string())), // freeform tags (e.g. "fire", "cursed", "two-handed")
    lore: v.optional(v.string()), // extended lore text
    consumeHpDelta: v.optional(v.number()), // consumables: +heals, -poisons on click/use
    pickupSoundUrl: v.optional(v.string()), // one-shot SFX played when picked up
    createdBy: v.optional(v.id("profiles")),
    visibilityType: v.optional(v.string()), // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")), // owner user for private/public assets
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // World items (items placed on maps — can be picked up by players)
  // ---------------------------------------------------------------------------
  worldItems: defineTable({
    mapName: v.string(),
    itemDefName: v.string(), // references itemDefs.name
    x: v.float64(),
    y: v.float64(),
    quantity: v.number(), // how many of this item the pickup gives
    respawn: v.optional(v.boolean()), // if true, reappears after pickup (for common items)
    respawnMs: v.optional(v.number()), // respawn delay in ms
    pickedUpAt: v.optional(v.number()), // timestamp of last pickup (null = available)
    pickedUpBy: v.optional(v.id("profiles")),
    placedBy: v.optional(v.id("profiles")),
    updatedAt: v.number(),
  }).index("by_map", ["mapName"]),

  inventories: defineTable({
    profileId: v.id("profiles"),
    slots: v.array(
      v.object({
        itemDefName: v.string(),
        quantity: v.number(),
        metadata: v.optional(v.record(v.string(), v.string())),
      }),
    ),
  }).index("by_profile", ["profileId"]),

  combatEncounters: defineTable({
    enemies: v.array(
      v.object({
        npcName: v.optional(v.string()),
        level: v.number(),
        stats: v.object({
          hp: v.number(),
          maxHp: v.number(),
          atk: v.number(),
          def: v.number(),
          spd: v.number(),
        }),
      }),
    ),
    rewards: v.object({
      items: v.optional(
        v.array(v.object({ name: v.string(), quantity: v.number() })),
      ),
      xp: v.optional(v.number()),
      currency: v.optional(v.record(v.string(), v.number())),
    }),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  }).index("by_map", ["mapId"]),

  combatLog: defineTable({
    encounterId: v.id("combatEncounters"),
    profileId: v.id("profiles"),
    turns: v.array(
      v.object({
        actor: v.string(), // "player" or NPC name
        action: v.string(), // "attack" | "defend" | "skill" | "item" | "flee"
        target: v.optional(v.string()),
        damage: v.optional(v.number()),
        heal: v.optional(v.number()),
      }),
    ),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee"),
    ),
    timestamp: v.number(),
  }).index("by_profile", ["profileId"]),

  wallets: defineTable({
    profileId: v.id("profiles"),
    currencies: v.record(v.string(), v.number()), // currency-name -> amount
  }).index("by_profile", ["profileId"]),

  shops: defineTable({
    npcId: v.id("npcs"),
    inventory: v.array(
      v.object({
        itemDefName: v.string(),
        price: v.number(),
        stock: v.optional(v.number()), // null = unlimited
      }),
    ),
    mapId: v.optional(v.id("maps")),
  }).index("by_npc", ["npcId"]),
});
