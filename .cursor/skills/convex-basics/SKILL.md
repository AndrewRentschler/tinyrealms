---
description: Critical rules and common mistakes to avoid in Convex development. Use when reviewing Convex code, debugging issues, or learning what NOT to do. Activates for code review, debugging OCC errors, fixing type errors, or understanding why code fails in Convex.
alwaysApply: true
---

---
name: convex-anti-patterns
description: "Critical rules and common mistakes to avoid in Convex development. Use when reviewing Convex code, debugging issues, or learning what NOT to do. Activates for code review, debugging OCC errors, fixing type errors, or understanding why code fails in Convex."
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Convex Anti-Patterns & Agent Rules

## Overview

This skill documents critical mistakes to avoid in Convex development and rules that agents must follow. Every pattern here has caused real production issues.

## TypeScript: NEVER Use `any` Type

**CRITICAL RULE:** This codebase has `@typescript-eslint/no-explicit-any` enabled. Using `any` will cause build failures.

**❌ WRONG:**

```typescript
function handleData(data: any) { ... }
const items: any[] = [];
args: { data: v.any() }  // Also avoid!
```

**✅ CORRECT:**

```typescript
function handleData(data: Doc<"items">) { ... }
const items: Doc<"items">[] = [];
args: { data: v.object({ field: v.string() }) }
```

## When to Use This Skill

Use this skill when:

- Reviewing Convex code for issues
- Debugging mysterious errors
- Understanding why code doesn't work as expected
- Learning Convex best practices by counter-example
- Checking code against known anti-patterns

## Critical Anti-Patterns

### Anti-Pattern 1: fetch() in Mutations

Mutations must be deterministic. External calls break this guarantee.

**❌ WRONG:**

```typescript
export const createOrder = mutation({
  args: { productId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ❌ Mutations cannot make external HTTP calls!
    const price = await fetch(
      `https://api.stripe.com/prices/${args.productId}`
    );
    await ctx.db.insert("orders", {
      productId: args.productId,
      price: await price.json(),
    });
    return null;
  },
});
```

**✅ CORRECT:**

```typescript
// Mutation creates record, schedules action for external call
export const createOrder = mutation({
  args: { productId: v.string() },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const orderId = await ctx.db.insert("orders", {
      productId: args.productId,
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.orders.fetchPrice, { orderId });
    return orderId;
  },
});

// Action handles external API call
export const fetchPrice = internalAction({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(internal.orders.getById, {
      orderId: args.orderId,
    });
    if (!order) return null;

    const response = await fetch(
      `https://api.stripe.com/prices/${order.productId}`
    );
    const priceData = await response.json();

    await ctx.runMutation(internal.orders.updatePrice, {
      orderId: args.orderId,
      price: priceData.unit_amount,
    });
    return null;
  },
});
```

### Anti-Pattern 2: ctx.db in Actions

Actions don't have database access. This is a common source of TypeScript errors.

**❌ WRONG:**

```typescript
export const processData = action({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ❌ Actions don't have ctx.db!
    const item = await ctx.db.get(args.id); // TypeScript Error!
    return null;
  },
});
```

**✅ CORRECT:**

```typescript
export const processData = action({
  args: { id: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ✅ Use ctx.runQuery to read
    const item = await ctx.runQuery(internal.items.getById, { id: args.id });

    // Process with external APIs...
    const result = await fetch("https://api.example.com/process", {
      method: "POST",
      body: JSON.stringify(item),
    });

    // ✅ Use ctx.runMutation to write
    await ctx.runMutation(internal.items.updateResult, {
      id: args.id,
      result: await result.json(),
    });

    return null;
  },
});
```

### Anti-Pattern 3: Missing returns Validator

Every function must have an explicit `returns` validator.

**❌ WRONG:**

```typescript
export const doSomething = mutation({
  args: { data: v.string() },
  // ❌ Missing returns!
  handler: async (ctx, args) => {
    await ctx.db.insert("items", { data: args.data });
    // Implicitly returns undefined
  },
});
```

**✅ CORRECT:**

```typescript
export const doSomething = mutation({
  args: { data: v.string() },
  returns: v.null(), // ✅ Explicit returns validator
  handler: async (ctx, args) => {
    await ctx.db.insert("items", { data: args.data });
    return null; // ✅ Explicit return value
  },
});
```

### Anti-Pattern 4: Using .filter() on Queries

`.filter()` scans the entire table. Always use indexes.

**❌ WRONG:**

```typescript
export const getActiveUsers = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  handler: async (ctx) => {
    // ❌ Full table scan!
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});
```

**✅ CORRECT:**

```typescript
// Schema: .index("by_status", ["status"])

export const getActiveUsers = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  handler: async (ctx) => {
    // ✅ Uses index
    return await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});
```

### Anti-Pattern 5: Unbounded .collect()

Never collect without limits on potentially large tables.

**❌ WRONG:**

```typescript
export const getAllMessages = query({
  args: { channelId: v.id("channels") },
  returns: v.array(v.object({ content: v.string() })),
  handler: async (ctx, args) => {
    // ❌ Could return millions of records!
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});
```

**✅ CORRECT:**

```typescript
export const getRecentMessages = query({
  args: { channelId: v.id("channels") },
  returns: v.array(v.object({ content: v.string() })),
  handler: async (ctx, args) => {
    // ✅ Bounded with take()
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(50);
  },
});
```

### Anti-Pattern 6: .collect().length for Counts

Collecting just to count is wasteful.

**❌ WRONG:**

```typescript
export const getMessageCount = query({
  args: { channelId: v.id("channels") },
  returns: v.number(),
  handler: async (ctx, args) => {
    // ❌ Loads all messages just to count!
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    return messages.length;
  },
});
```

**✅ CORRECT:**

```typescript
// Option 1: Bounded count with "99+" display
export const getMessageCount = query({
  args: { channelId: v.id("channels") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .take(100);
    return messages.length === 100 ? "99+" : String(messages.length);
  },
});

// Option 2: Denormalized counter (best for high traffic)
// Maintain messageCount field in channels table
export const getMessageCount = query({
  args: { channelId: v.id("channels") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    return channel?.messageCount ?? 0;
  },
});
```

### Anti-Pattern 7: N+1 Query Pattern

Loading related documents one by one.

**❌ WRONG:**

```typescript
export const getPostsWithAuthors = query({
  args: {},
  returns: v.array(
    v.object({
      post: v.object({ title: v.string() }),
      author: v.object({ name: v.string() }),
    })
  ),
  handler: async (ctx) => {
    const posts = await ctx.db.query("posts").take(10);

    // ❌ N additional queries!
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => ({
        post: { title: post.title },
        author: await ctx.db
          .get(post.authorId)
          .then((a) => ({ name: a!.name })),
      }))
    );

    return postsWithAuthors;
  },
});
```

**✅ CORRECT:**

```typescript
import { getAll } from "convex-helpers/server/relationships";

export const getPostsWithAuthors = query({
  args: {},
  returns: v.array(
    v.object({
      post: v.object({ title: v.string() }),
      author: v.union(v.object({ name: v.string() }), v.null()),
    })
  ),
  handler: async (ctx) => {
    const posts = await ctx.db.query("posts").take(10);

    // ✅ Batch fetch all authors
    const authorIds = [...new Set(posts.map((p) => p.authorId))];
    const authors = await getAll(ctx.db, authorIds);
    const authorMap = new Map(
      authors
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => [a._id, a])
    );

    return posts.map((post) => ({
      post: { title: post.title },
      author: authorMap.get(post.authorId)
        ? { name: authorMap.get(post.authorId)!.name }
        : null,
    }));
  },
});
```

### Anti-Pattern 8: Global Counter (Hot Spot)

Single document updates cause OCC conflicts under load.

**❌ WRONG:**

```typescript
export const incrementPageViews = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // ❌ Every request writes to same document!
    const stats = await ctx.db.query("globalStats").unique();
    await ctx.db.patch(stats!._id, { views: stats!.views + 1 });
    return null;
  },
});
```

**✅ CORRECT:**

```typescript
// Option 1: Sharding
export const incrementPageViews = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // ✅ Write to random shard
    const shardId = Math.floor(Math.random() * 10);
    await ctx.db.insert("viewShards", { shardId, delta: 1 });
    return null;
  },
});

// Read by aggregating shards
export const getPageViews = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const shards = await ctx.db.query("viewShards").collect();
    return shards.reduce((sum, s) => sum + s.delta, 0);
  },
});

// Option 2: Use Workpool to serialize
import { Workpool } from "@convex-dev/workpool";

const counterPool = new Workpool(components.workpool, { maxParallelism: 1 });

export const incrementPageViews = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await counterPool.enqueueMutation(ctx, internal.stats.doIncrement, {});
    return null;
  },
});
```

### Anti-Pattern 9: Using v.bigint() (Deprecated)

**❌ WRONG:**

```typescript
export default defineSchema({
  counters: defineTable({
    value: v.bigint(), // ❌ Deprecated!
  }),
});
```

**✅ CORRECT:**

```typescript
export default defineSchema({
  counters: defineTable({
    value: v.int64(), // ✅ Use v.int64()
  }),
});
```

### Anti-Pattern 10: Missing System Fields in Return Validators

**❌ WRONG:**

```typescript
export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.object({
    // ❌ Missing _id and _creationTime!
    name: v.string(),
    email: v.string(),
  }),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId); // Returns full doc including system fields
  },
});
```

**✅ CORRECT:**

```typescript
export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"), // ✅ Include system fields
      _creationTime: v.number(),
      name: v.string(),
      email: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
```

### Anti-Pattern 11: Public Functions for Internal Logic

**❌ WRONG:**

```typescript
// ❌ This is callable by any client!
export const deleteUserData = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Dangerous operation exposed publicly
    await ctx.db.delete(args.userId);
    return null;
  },
});
```

**✅ CORRECT:**

```typescript
// Internal mutation - not callable by clients
export const deleteUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.userId);
    return null;
  },
});

// Public mutation with auth check
export const requestAccountDeletion = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("User not found");

    // Schedule internal mutation
    await ctx.scheduler.runAfter(0, internal.users.deleteUserData, {
      userId: user._id,
    });

    return null;
  },
});
```

### Anti-Pattern 12: Non-Transactional Actions for Data Consistency

**❌ WRONG:**

```typescript
export const transferFunds = action({
  args: { from: v.id("accounts"), to: v.id("accounts"), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ❌ These are separate transactions - could leave inconsistent state!
    await ctx.runMutation(internal.accounts.debit, {
      accountId: args.from,
      amount: args.amount,
    });

    // If this fails, money was debited but not credited!
    await ctx.runMutation(internal.accounts.credit, {
      accountId: args.to,
      amount: args.amount,
    });

    return null;
  },
});
```

**✅ CORRECT:**

```typescript
// Single atomic mutation
export const transferFunds = mutation({
  args: { from: v.id("accounts"), to: v.id("accounts"), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ✅ All in one transaction - all succeed or all fail
    const fromAccount = await ctx.db.get(args.from);
    const toAccount = await ctx.db.get(args.to);

    if (!fromAccount || !toAccount) throw new Error("Account not found");
    if (fromAccount.balance < args.amount)
      throw new Error("Insufficient funds");

    await ctx.db.patch(args.from, {
      balance: fromAccount.balance - args.amount,
    });
    await ctx.db.patch(args.to, { balance: toAccount.balance + args.amount });

    return null;
  },
});
```

### Anti-Pattern 13: Redundant Indexes

**❌ WRONG:**

```typescript
export default defineSchema({
  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
  })
    .index("by_channel", ["channelId"]) // ❌ Redundant!
    .index("by_channel_author", ["channelId", "authorId"]),
});
```

**✅ CORRECT:**

```typescript
export default defineSchema({
  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
  })
    // ✅ Single compound index serves both query patterns
    .index("by_channel_author", ["channelId", "authorId"]),
});

// Use prefix matching for channel-only queries:
// .withIndex("by_channel_author", (q) => q.eq("channelId", id))
```

### Anti-Pattern 14: Using v.string() for IDs

**❌ WRONG:**

```typescript
export const getMessage = query({
  args: { messageId: v.string() }, // ❌ Should be v.id()
  returns: v.null(),
  handler: async (ctx, args) => {
    // Type error or runtime error
    return await ctx.db.get(args.messageId as Id<"messages">);
  },
});
```

**✅ CORRECT:**

```typescript
export const getMessage = query({
  args: { messageId: v.id("messages") }, // ✅ Proper ID type
  returns: v.union(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      content: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});
```

### Anti-Pattern 15: Retry Without Backoff or Jitter

**❌ WRONG:**

```typescript
export const processWithRetry = internalAction({
  args: { jobId: v.id("jobs"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Process...
    } catch (error) {
      if (args.attempt < 5) {
        // ❌ Fixed delay causes thundering herd!
        await ctx.scheduler.runAfter(5000, internal.jobs.processWithRetry, {
          jobId: args.jobId,
          attempt: args.attempt + 1,
        });
      }
    }
    return null;
  },
});
```

**✅ CORRECT:**

```typescript
export const processWithRetry = internalAction({
  args: { jobId: v.id("jobs"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Process...
    } catch (error) {
      if (args.attempt < 5) {
        // ✅ Exponential backoff + jitter
        const baseDelay = Math.pow(2, args.attempt) * 1000;
        const jitter = Math.random() * 1000;
        await ctx.scheduler.runAfter(
          baseDelay + jitter,
          internal.jobs.processWithRetry,
          {
            jobId: args.jobId,
            attempt: args.attempt + 1,
          }
        );
      }
    }
    return null;
  },
});
```

## Agent Rules Summary

### Must Do

1. **Always include `returns` validator** on every function
2. **Always use indexes** instead of `.filter()`
3. **Always use `take(n)`** for potentially large queries
4. **Always use `v.id("table")`** for document ID arguments
5. **Always use `internalMutation`/`internalAction`** for sensitive operations
6. **Always handle errors** in actions and update status in database
7. **Always use exponential backoff with jitter** for retries

### Must Not Do

1. **Never call `fetch()`** in mutations
2. **Never access `ctx.db`** in actions
3. **Never use `.filter()`** on database queries
4. **Never use `.collect()`** without limits on large tables
5. **Never use `v.bigint()`** (deprecated, use `v.int64()`)
6. **Never use `any` type** (ESLint rule enforced)
7. **Never write to hot-spot documents** without sharding/workpool
8. **Never expose dangerous operations** as public functions
9. **Never rely on multiple mutations** for atomic operations

### Quick Checklist

Before submitting Convex code, verify:

- [ ] All functions have `returns` validators
- [ ] All queries use indexes (no `.filter()`)
- [ ] All `.collect()` calls are bounded with `.take(n)`
- [ ] All ID arguments use `v.id("tableName")`
- [ ] External API calls are in actions, not mutations
- [ ] Actions use `ctx.runQuery`/`ctx.runMutation` for DB access
- [ ] Sensitive operations use internal functions
- [ ] No `any` types in the codebase
- [ ] High-write documents use sharding or Workpool
- [ ] Retries use exponential backoff with jitter

---
name: convex-schema-validator
displayName: Convex Schema Validator
description: Defining and validating database schemas with proper typing, index configuration, optional fields, unions, and migration strategies for schema changes
version: 1.0.0
author: Convex
tags: [convex, schema, validation, typescript, indexes, migrations]
---

# Convex Schema Validator

Define and validate database schemas in Convex with proper typing, index configuration, optional fields, unions, and strategies for schema migrations.

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/database/schemas
- Indexes: https://docs.convex.dev/database/indexes
- Data Types: https://docs.convex.dev/database/types
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### Basic Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
  }),
  
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    completed: v.boolean(),
    userId: v.id("users"),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
  }),
});
```

### Validator Types

| Validator | TypeScript Type | Example |
|-----------|----------------|---------|
| `v.string()` | `string` | `"hello"` |
| `v.number()` | `number` | `42`, `3.14` |
| `v.boolean()` | `boolean` | `true`, `false` |
| `v.null()` | `null` | `null` |
| `v.int64()` | `bigint` | `9007199254740993n` |
| `v.bytes()` | `ArrayBuffer` | Binary data |
| `v.id("table")` | `Id<"table">` | Document reference |
| `v.array(v)` | `T[]` | `[1, 2, 3]` |
| `v.object({})` | `{ ... }` | `{ name: "..." }` |
| `v.optional(v)` | `T \| undefined` | Optional field |
| `v.union(...)` | `T1 \| T2` | Multiple types |
| `v.literal(x)` | `"x"` | Exact value |
| `v.any()` | `any` | Any value |
| `v.record(k, v)` | `Record<K, V>` | Dynamic keys |

### Index Configuration

```typescript
export default defineSchema({
  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("users"),
    content: v.string(),
    sentAt: v.number(),
  })
    // Single field index
    .index("by_channel", ["channelId"])
    // Compound index
    .index("by_channel_and_author", ["channelId", "authorId"])
    // Index for sorting
    .index("by_channel_and_time", ["channelId", "sentAt"]),
    
  // Full-text search index
  articles: defineTable({
    title: v.string(),
    body: v.string(),
    category: v.string(),
  })
    .searchIndex("search_content", {
      searchField: "body",
      filterFields: ["category"],
    }),
});
```

### Complex Types

```typescript
export default defineSchema({
  // Nested objects
  profiles: defineTable({
    userId: v.id("users"),
    settings: v.object({
      theme: v.union(v.literal("light"), v.literal("dark")),
      notifications: v.object({
        email: v.boolean(),
        push: v.boolean(),
      }),
    }),
  }),

  // Arrays of objects
  orders: defineTable({
    customerId: v.id("users"),
    items: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
      price: v.number(),
    })),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered")
    ),
  }),

  // Record type for dynamic keys
  analytics: defineTable({
    date: v.string(),
    metrics: v.record(v.string(), v.number()),
  }),
});
```

### Discriminated Unions

```typescript
export default defineSchema({
  events: defineTable(
    v.union(
      v.object({
        type: v.literal("user_signup"),
        userId: v.id("users"),
        email: v.string(),
      }),
      v.object({
        type: v.literal("purchase"),
        userId: v.id("users"),
        orderId: v.id("orders"),
        amount: v.number(),
      }),
      v.object({
        type: v.literal("page_view"),
        sessionId: v.string(),
        path: v.string(),
      })
    )
  ).index("by_type", ["type"]),
});
```

### Optional vs Nullable Fields

```typescript
export default defineSchema({
  items: defineTable({
    // Optional: field may not exist
    description: v.optional(v.string()),
    
    // Nullable: field exists but can be null
    deletedAt: v.union(v.number(), v.null()),
    
    // Optional and nullable
    notes: v.optional(v.union(v.string(), v.null())),
  }),
});
```

### Index Naming Convention

Always include all indexed fields in the index name:

```typescript
export default defineSchema({
  posts: defineTable({
    authorId: v.id("users"),
    categoryId: v.id("categories"),
    publishedAt: v.number(),
    status: v.string(),
  })
    // Good: descriptive names
    .index("by_author", ["authorId"])
    .index("by_author_and_category", ["authorId", "categoryId"])
    .index("by_category_and_status", ["categoryId", "status"])
    .index("by_status_and_published", ["status", "publishedAt"]),
});
```

### Schema Migration Strategies

#### Adding New Fields

```typescript
// Before
users: defineTable({
  name: v.string(),
  email: v.string(),
})

// After - add as optional first
users: defineTable({
  name: v.string(),
  email: v.string(),
  avatarUrl: v.optional(v.string()), // New optional field
})
```

#### Backfilling Data

```typescript
// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const backfillAvatars = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("avatarUrl"), undefined))
      .take(100);

    for (const user of users) {
      await ctx.db.patch(user._id, {
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`,
      });
    }

    return users.length;
  },
});
```

#### Making Optional Fields Required

```typescript
// Step 1: Backfill all null values
// Step 2: Update schema to required
users: defineTable({
  name: v.string(),
  email: v.string(),
  avatarUrl: v.string(), // Now required after backfill
})
```

## Examples

### Complete E-commerce Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  products: defineTable({
    name: v.string(),
    description: v.string(),
    price: v.number(),
    category: v.string(),
    inventory: v.number(),
    isActive: v.boolean(),
  })
    .index("by_category", ["category"])
    .index("by_active_and_category", ["isActive", "category"])
    .searchIndex("search_products", {
      searchField: "name",
      filterFields: ["category", "isActive"],
    }),

  orders: defineTable({
    userId: v.id("users"),
    items: v.array(v.object({
      productId: v.id("products"),
      quantity: v.number(),
      priceAtPurchase: v.number(),
    })),
    total: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    shippingAddress: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      country: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_status", ["status"]),

  reviews: defineTable({
    productId: v.id("products"),
    userId: v.id("users"),
    rating: v.number(),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_user", ["userId"]),
});
```

### Using Schema Types in Functions

```typescript
// convex/products.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Use Doc type for full documents
type Product = Doc<"products">;

// Use Id type for references
type ProductId = Id<"products">;

export const get = query({
  args: { productId: v.id("products") },
  returns: v.union(
    v.object({
      _id: v.id("products"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      price: v.number(),
      category: v.string(),
      inventory: v.number(),
      isActive: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<Product | null> => {
    return await ctx.db.get(args.productId);
  },
});
```

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Always define explicit schemas rather than relying on inference
- Use descriptive index names that include all indexed fields
- Start with optional fields when adding new columns
- Use discriminated unions for polymorphic data
- Validate data at the schema level, not just in functions
- Plan index strategy based on query patterns

## Common Pitfalls

1. **Missing indexes for queries** - Every withIndex needs a corresponding schema index
2. **Wrong index field order** - Fields must be queried in order defined
3. **Using v.any() excessively** - Lose type safety benefits
4. **Not making new fields optional** - Breaks existing data
5. **Forgetting system fields** - _id and _creationTime are automatic

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Schemas: https://docs.convex.dev/database/schemas
- Indexes: https://docs.convex.dev/database/indexes
- Data Types: https://docs.convex.dev/database/types

---
name: convex-helpers-patterns
description: "Guide for convex-helpers library patterns including Triggers, Row-Level Security (RLS), Relationship helpers, Custom Functions, Rate Limiting, and Workpool. Use when implementing automatic side effects, access control, relationship traversal, auth wrappers, or concurrency management. Activates for triggers setup, RLS implementation, custom function wrappers, or convex-helpers integration tasks."
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Convex Helpers Library Patterns

## Overview

The `convex-helpers` library provides battle-tested patterns for common Convex development needs. This skill covers Triggers (automatic side effects), Row-Level Security, Relationship helpers, Custom Functions, Rate Limiting, and Workpool for concurrency control.

## Installation

```bash
npm install convex-helpers @convex-dev/workpool
```

## TypeScript: NEVER Use `any` Type

**CRITICAL RULE:** This codebase has `@typescript-eslint/no-explicit-any` enabled. Using `any` will cause build failures.

## When to Use This Skill

Use this skill when:

- Implementing automatic side effects on document changes (Triggers)
- Adding declarative access control (Row-Level Security)
- Traversing relationships between documents
- Creating reusable authenticated function wrappers
- Implementing rate limiting
- Managing concurrent writes with Workpool
- Building custom function builders

## Key Patterns Overview

| Pattern                  | Use Case                                               |
| ------------------------ | ------------------------------------------------------ |
| **Triggers**             | Run code automatically on document changes             |
| **Row-Level Security**   | Declarative access control at the database layer       |
| **Relationship Helpers** | Simplified traversal of document relations             |
| **Custom Functions**     | Wrap queries/mutations with auth, logging, etc.        |
| **Rate Limiter**         | Application-level rate limiting                        |
| **Workpool**             | Fan-out parallel jobs, serialize conflicting mutations |
| **Migrations**           | Schema migrations with state tracking                  |

## Triggers (Automatic Side Effects)

Triggers run code automatically when documents change. They execute atomically within the same transaction as the mutation.

### Setting Up Triggers

```typescript
// convex/functions.ts
import { mutation as rawMutation } from "./_generated/server";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { DataModel } from "./_generated/dataModel";

const triggers = new Triggers<DataModel>();

// 1. Compute fullName on every user change
triggers.register("users", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(change.id, { fullName });
    }
  }
});

// 2. Keep denormalized count (careful: single doc = write contention)
triggers.register("users", async (ctx, change) => {
  const countDoc = (await ctx.db.query("userCount").unique())!;
  if (change.operation === "insert") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count + 1 });
  } else if (change.operation === "delete") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count - 1 });
  }
});

// 3. Cascading deletes
triggers.register("users", async (ctx, change) => {
  if (change.operation === "delete") {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorId", change.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  }
});

// Export wrapped mutation that runs triggers
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

### Trigger Change Object

```typescript
interface Change<Doc> {
  id: Id<TableName>;
  operation: "insert" | "update" | "delete";
  oldDoc: Doc | null; // null for inserts
  newDoc: Doc | null; // null for deletes
}
```

### Trigger Warnings

> **Warning:** Triggers run inside the same transaction as the mutation. Writing to hot-spot documents (e.g., global counters) inside triggers will cause OCC conflicts under load. Use sharding or Workpool for high-contention writes.

## Row-Level Security (RLS)

Declarative access control at the database layer. RLS wraps the database context to enforce rules on every read and write.

### Setting Up RLS

```typescript
// convex/functions.ts
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import {
  customCtx,
  customQuery,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { query, mutation } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";

async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  return {
    users: {
      read: async (_, user) => {
        // Unauthenticated users can only read users over 18
        if (!identity && user.age < 18) return false;
        return true;
      },
      insert: async () => true,
      modify: async (_, user) => {
        if (!identity) throw new Error("Must be authenticated");
        // Users can only modify their own record
        return user.tokenIdentifier === identity.tokenIdentifier;
      },
    },

    messages: {
      read: async (_, message) => {
        // Only read messages in conversations you're a member of
        const conversation = await ctx.db.get(message.conversationId);
        return conversation?.members.includes(identity?.subject ?? "") ?? false;
      },
      modify: async (_, message) => {
        // Only modify your own messages
        return message.authorId === identity?.subject;
      },
    },

    // Table with no restrictions
    publicPosts: {
      read: async () => true,
      insert: async () => true,
      modify: async () => true,
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

// Wrap query/mutation with RLS
export const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
  }))
);

export const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
  }))
);
```

### Using RLS-Wrapped Functions

```typescript
// convex/messages.ts
import { queryWithRLS, mutationWithRLS } from "./functions";
import { v } from "convex/values";

// This query automatically enforces RLS rules
export const list = queryWithRLS({
  args: { conversationId: v.id("conversations") },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      content: v.string(),
      authorId: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    // RLS automatically filters out unauthorized messages
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
  },
});

// This mutation automatically enforces RLS rules
export const update = mutationWithRLS({
  args: { messageId: v.id("messages"), content: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // RLS checks if user can modify this message
    await ctx.db.patch(args.messageId, { content: args.content });
    return null;
  },
});
```

## Relationship Helpers

Simplify traversing relationships without manual lookups.

### Available Helpers

```typescript
import {
  getAll,
  getOneFrom,
  getManyFrom,
  getManyVia,
} from "convex-helpers/server/relationships";
```

### One-to-One Relationship

```typescript
// Get single related document via back reference
const profile = await getOneFrom(
  ctx.db,
  "profiles", // target table
  "userId", // index field
  user._id // value to match
);
```

### One-to-Many (by ID array)

```typescript
// Load multiple documents by IDs
const users = await getAll(ctx.db, userIds);
// Returns array of documents in same order as IDs (null for missing)
```

### One-to-Many (via index)

```typescript
// Get all posts by author
const posts = await getManyFrom(
  ctx.db,
  "posts", // target table
  "by_authorId", // index name
  author._id // value to match
);
```

### Many-to-Many (via join table)

```typescript
// Schema:
// posts: { title: v.string() }
// categories: { name: v.string() }
// postCategories: { postId: v.id("posts"), categoryId: v.id("categories") }
//   .index("by_post", ["postId"])
//   .index("by_category", ["categoryId"])

// Get all categories for a post
const categories = await getManyVia(
  ctx.db,
  "postCategories", // join table
  "categoryId", // field pointing to target
  "by_post", // index to query join table
  post._id // source ID
);

// Get all posts in a category
const posts = await getManyVia(
  ctx.db,
  "postCategories",
  "postId",
  "by_category",
  category._id
);
```

### Complete Example

```typescript
// convex/posts.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  getOneFrom,
  getManyFrom,
  getManyVia,
} from "convex-helpers/server/relationships";

export const getPostWithDetails = query({
  args: { postId: v.id("posts") },
  returns: v.union(
    v.object({
      post: v.object({
        _id: v.id("posts"),
        title: v.string(),
        body: v.string(),
      }),
      author: v.union(
        v.object({
          _id: v.id("users"),
          name: v.string(),
        }),
        v.null()
      ),
      comments: v.array(
        v.object({
          _id: v.id("comments"),
          body: v.string(),
        })
      ),
      categories: v.array(
        v.object({
          _id: v.id("categories"),
          name: v.string(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    const [author, comments, categories] = await Promise.all([
      // One-to-one: post -> author
      ctx.db.get(post.authorId),

      // One-to-many: post -> comments
      getManyFrom(ctx.db, "comments", "by_post", post._id),

      // Many-to-many: post -> categories (via join table)
      getManyVia(ctx.db, "postCategories", "categoryId", "by_post", post._id),
    ]);

    return {
      post: { _id: post._id, title: post.title, body: post.body },
      author: author ? { _id: author._id, name: author.name } : null,
      comments: comments.map((c) => ({ _id: c._id, body: c.body })),
      categories: categories
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({ _id: c._id, name: c.name })),
    };
  },
});
```

## Custom Functions (Auth Wrappers)

Create reusable function wrappers with built-in authentication.

### Basic Auth Wrapper

```typescript
// convex/functions.ts
import {
  customQuery,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { query, mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Query that requires authentication
export const authedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("User not found");

    return { ctx: { ...ctx, user }, args };
  },
});

// Mutation that requires authentication
export const authedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("User not found");

    return { ctx: { ...ctx, user }, args };
  },
});
```

### Using Authed Functions

```typescript
// convex/profile.ts
import { authedQuery, authedMutation } from "./functions";
import { v } from "convex/values";

// ctx.user is guaranteed to exist
export const getMyProfile = authedQuery({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    name: v.string(),
    email: v.string(),
  }),
  handler: async (ctx) => {
    // ctx.user is typed and guaranteed to exist!
    return {
      _id: ctx.user._id,
      name: ctx.user.name,
      email: ctx.user.email,
    };
  },
});

export const updateMyName = authedMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.user._id, { name: args.name });
    return null;
  },
});
```

### Role-Based Auth Wrapper

```typescript
// convex/functions.ts
export const adminQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Admin access required");

    return { ctx: { ...ctx, user }, args };
  },
});

// Usage
export const listAllUsers = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      role: v.string(),
    })
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ _id: u._id, name: u.name, role: u.role }));
  },
});
```

## Workpool (Concurrency Control)

Workpool manages concurrent execution with parallelism limits, useful for:

- Serializing writes to avoid OCC conflicts
- Fan-out parallel processing with limits
- Rate-limited external API calls

### Setting Up Workpool

First, install and configure the Workpool component:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();
app.use(workpool, { name: "workpool" });

export default app;
```

### Using Workpool

```typescript
// convex/counters.ts
import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "./_generated/api";
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Create workpool with parallelism limit
const counterPool = new Workpool(components.workpool, {
  maxParallelism: 1, // Serialize all counter updates
});

// Public mutation enqueues work
export const incrementCounter = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await counterPool.enqueueMutation(ctx, internal.counters.doIncrement, {});
    return null;
  },
});

// Internal mutation does the actual work
export const doIncrement = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const counter = await ctx.db.query("counters").unique();
    if (counter) {
      await ctx.db.patch(counter._id, { count: counter.count + 1 });
    }
    return null;
  },
});
```

### Parallel Processing with Limits

```typescript
// Process many items with limited concurrency
const processingPool = new Workpool(components.workpool, {
  maxParallelism: 5, // Process 5 items at a time
});

export const processAll = mutation({
  args: { itemIds: v.array(v.id("items")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const itemId of args.itemIds) {
      await processingPool.enqueueAction(ctx, internal.items.processOne, {
        itemId,
      });
    }
    return null;
  },
});
```

## Rate Limiting

Application-level rate limiting using convex-helpers.

### Setting Up Rate Limiter

```typescript
// convex/rateLimit.ts
import { RateLimiter } from "convex-helpers/server/rateLimit";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimit, {
  // Global rate limit
  global: {
    kind: "token bucket",
    rate: 100, // 100 requests
    period: 60000, // per minute
  },

  // Per-user rate limit
  perUser: {
    kind: "token bucket",
    rate: 10,
    period: 60000,
  },
});
```

### Using Rate Limiter

```typescript
// convex/api.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "./rateLimit";

export const createPost = mutation({
  args: { title: v.string(), body: v.string() },
  returns: v.union(
    v.id("posts"),
    v.object({
      error: v.string(),
      retryAfter: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check rate limit
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "perUser", {
      key: identity.subject,
    });

    if (!ok) {
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 1000;
      return {
        error: "Rate limit exceeded",
        retryAfter: retryAfter + jitter,
      };
    }

    const postId = await ctx.db.insert("posts", {
      title: args.title,
      body: args.body,
      authorId: identity.subject,
    });

    return postId;
  },
});
```

## Combining Patterns

### Triggers + RLS + Custom Functions

```typescript
// convex/functions.ts
import {
  mutation as rawMutation,
  query as rawQuery,
} from "./_generated/server";
import { Triggers } from "convex-helpers/server/triggers";
import {
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import {
  customCtx,
  customQuery,
  customMutation,
} from "convex-helpers/server/customFunctions";

// Set up triggers
const triggers = new Triggers<DataModel>();
triggers.register("posts", async (ctx, change) => {
  if (change.operation === "insert") {
    // Update author's post count
    const author = await ctx.db.get(change.newDoc!.authorId);
    if (author) {
      await ctx.db.patch(author._id, {
        postCount: (author.postCount ?? 0) + 1,
      });
    }
  }
});

// Set up RLS rules
async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    posts: {
      read: async () => true,
      modify: async (_, post) => post.authorId === identity?.subject,
    },
  };
}

// Combine everything into authenticated, RLS-protected, trigger-enabled functions
export const authedMutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("User not found");

    // Wrap DB with triggers and RLS
    const wrappedDb = wrapDatabaseWriter(
      ctx,
      triggers.wrapDB(ctx).db,
      await rlsRules(ctx)
    );

    return { ctx: { ...ctx, user, db: wrappedDb }, args };
  },
});
```

## Common Pitfalls

### Pitfall 1: Triggers Causing OCC Conflicts

**❌ WRONG:**

```typescript
// This trigger updates a single global counter - will cause OCC under load
triggers.register("posts", async (ctx, change) => {
  if (change.operation === "insert") {
    const stats = await ctx.db.query("globalStats").unique();
    await ctx.db.patch(stats!._id, { postCount: stats!.postCount + 1 });
  }
});
```

**✅ CORRECT:**

```typescript
// Use sharding or Workpool for high-contention updates
triggers.register("posts", async (ctx, change) => {
  if (change.operation === "insert") {
    const shardId = Math.floor(Math.random() * 10);
    await ctx.db.insert("postCountShards", { shardId, delta: 1 });
  }
});
```

### Pitfall 2: RLS Rules Missing Tables

**❌ WRONG:**

```typescript
// Missing rules for some tables - they'll be unprotected!
async function rlsRules(ctx: QueryCtx) {
  return {
    users: { read: async () => true, modify: async () => false },
    // Missing posts, messages, etc.!
  };
}
```

**✅ CORRECT:**

```typescript
// Define rules for ALL tables
async function rlsRules(ctx: QueryCtx) {
  return {
    users: { read: async () => true, modify: async () => false },
    posts: { read: async () => true, modify: async () => true },
    messages: { read: async () => true, modify: async () => true },
    // ... all other tables
  } satisfies Rules<QueryCtx, DataModel>;
}
```

## Quick Reference

### Import Patterns

```typescript
// Triggers
import { Triggers } from "convex-helpers/server/triggers";

// RLS
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";

// Custom Functions
import {
  customCtx,
  customQuery,
  customMutation,
} from "convex-helpers/server/customFunctions";

// Relationships
import {
  getAll,
  getOneFrom,
  getManyFrom,
  getManyVia,
} from "convex-helpers/server/relationships";

// Workpool
import { Workpool } from "@convex-dev/workpool";

// Rate Limiter
import { RateLimiter } from "convex-helpers/server/rateLimit";
```
---
name: convex-best-practices
description: Guidelines for building production-ready Convex apps covering function organization, query patterns, validation, TypeScript usage, error handling, and the Zen of Convex design philosophy
---

# Convex Best Practices

Build production-ready Convex applications by following established patterns for function organization, query optimization, validation, TypeScript usage, and error handling.

## Code Quality

All patterns in this skill comply with `@convex-dev/eslint-plugin`. Install it for build-time validation:

```bash
npm i @convex-dev/eslint-plugin --save-dev
```

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...convexPlugin.configs.recommended,
]);
```

The plugin enforces four rules:

| Rule                                | What it enforces                  |
| ----------------------------------- | --------------------------------- |
| `no-old-registered-function-syntax` | Object syntax with `handler`      |
| `require-argument-validators`       | `args: {}` on all functions       |
| `explicit-table-ids`                | Table name in db operations       |
| `import-wrong-runtime`              | No Node imports in Convex runtime |

Docs: https://docs.convex.dev/eslint

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/understanding/best-practices/
- Error Handling: https://docs.convex.dev/functions/error-handling
- Write Conflicts: https://docs.convex.dev/error#1
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### The Zen of Convex

1. **Convex manages the hard parts** - Let Convex handle caching, real-time sync, and consistency
2. **Functions are the API** - Design your functions as your application's interface
3. **Schema is truth** - Define your data model explicitly in schema.ts
4. **TypeScript everywhere** - Leverage end-to-end type safety
5. **Queries are reactive** - Think in terms of subscriptions, not requests

### Function Organization

Organize your Convex functions by domain:

```typescript
// convex/users.ts - User-related functions
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      email: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});
```

### Argument and Return Validation

Always define validators for arguments AND return types:

```typescript
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      priority: args.priority,
      completed: false,
      createdAt: Date.now(),
    });
  },
});
```

### Query Patterns

Use indexes instead of filters for efficient queries:

```typescript
// Schema with index
export default defineSchema({
  tasks: defineTable({
    userId: v.id("users"),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),
});

// Query using index
export const getTasksByUser = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("tasks"),
      _creationTime: v.number(),
      userId: v.id("users"),
      status: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});
```

### Error Handling

Use ConvexError for user-facing errors:

```typescript
import { ConvexError } from "convex/values";

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);

    if (!task) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Task not found",
      });
    }

    await ctx.db.patch("tasks", args.taskId, { title: args.title });
    return null;
  },
});
```

### Avoiding Write Conflicts (Optimistic Concurrency Control)

Convex uses OCC. Follow these patterns to minimize conflicts:

```typescript
// GOOD: Make mutations idempotent
export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);

    // Early return if already complete (idempotent)
    if (!task || task.status === "completed") {
      return null;
    }

    await ctx.db.patch("tasks", args.taskId, {
      status: "completed",
      completedAt: Date.now(),
    });
    return null;
  },
});

// GOOD: Patch directly without reading first when possible
export const updateNote = mutation({
  args: { id: v.id("notes"), content: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Patch directly - ctx.db.patch throws if document doesn't exist
    await ctx.db.patch("notes", args.id, { content: args.content });
    return null;
  },
});

// GOOD: Use Promise.all for parallel independent updates
export const reorderItems = mutation({
  args: { itemIds: v.array(v.id("items")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates = args.itemIds.map((id, index) =>
      ctx.db.patch("items", id, { order: index }),
    );
    await Promise.all(updates);
    return null;
  },
});
```

### TypeScript Best Practices

```typescript
import { Id, Doc } from "./_generated/dataModel";

// Use Id type for document references
type UserId = Id<"users">;

// Use Doc type for full documents
type User = Doc<"users">;

// Define Record types properly
const userScores: Record<Id<"users">, number> = {};
```

### Internal vs Public Functions

```typescript
// Public function - exposed to clients
export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      /* ... */
    }),
  ),
  handler: async (ctx, args) => {
    // ...
  },
});

// Internal function - only callable from other Convex functions
export const _updateUserStats = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ...
  },
});
```

## Examples

### Complete CRUD Pattern

```typescript
// convex/tasks.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

const taskValidator = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  title: v.string(),
  completed: v.boolean(),
  userId: v.id("users"),
});

export const list = query({
  args: { userId: v.id("users") },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      completed: false,
      userId: args.userId,
    });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { taskId, ...updates } = args;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );

    if (Object.keys(cleanUpdates).length > 0) {
      await ctx.db.patch("tasks", taskId, cleanUpdates);
    }
    return null;
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("tasks", args.taskId);
    return null;
  },
});
```

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Always define return validators for functions
- Use indexes for all queries that filter data
- Make mutations idempotent to handle retries gracefully
- Use ConvexError for user-facing error messages
- Organize functions by domain (users.ts, tasks.ts, etc.)
- Use internal functions for sensitive operations
- Leverage TypeScript's Id and Doc types

## Common Pitfalls

1. **Using filter instead of withIndex** - Always define indexes and use withIndex
2. **Missing return validators** - Always specify the returns field
3. **Non-idempotent mutations** - Check current state before updating
4. **Reading before patching unnecessarily** - Patch directly when possible
5. **Not handling null returns** - Document IDs might not exist

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Best Practices: https://docs.convex.dev/understanding/best-practices/
- Error Handling: https://docs.convex.dev/functions/error-handling
- Write Conflicts: https://docs.convex.dev/error#1
