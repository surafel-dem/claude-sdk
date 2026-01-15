# Convex Best Practices

Guidelines for working with Convex in this project.

## Core Principles

### 1. Convex IS the Backend

Convex is not just a database—it's your entire backend for data operations:

```typescript
// CORRECT: Frontend calls Convex directly
const updateArtifact = useMutation(api.artifacts.update);
await updateArtifact({ id, content });

// WRONG: Frontend calls your backend which calls Convex
await fetch('/api/artifacts/update', { body: { id, content } });
```

### 2. Real-time by Default

Every query is automatically real-time. Use this to your advantage:

```typescript
// This automatically updates when data changes
const messages = useQuery(api.messages.list, { threadId });

// No need for manual refresh, polling, or refetch
```

### 3. Optimistic Updates Are Free

Mutations update the UI before the server confirms:

```typescript
const send = useMutation(api.messages.send);

// UI updates immediately, then confirms
await send({ threadId, content: "Hello" });
```

## Frontend Patterns

### Query with Conditional Skip

```typescript
// Skip when data not needed
const artifacts = useQuery(
  api.artifacts.listByThread,
  threadId ? { threadId } : "skip"
);
```

### Parallel Queries

```typescript
function ThreadView({ threadId }) {
  // These run in parallel
  const messages = useQuery(api.messages.list, { threadId });
  const artifacts = useQuery(api.artifacts.listByThread, { threadId });

  // Both are reactive
}
```

### Mutation Error Handling

```typescript
const send = useMutation(api.messages.send);

try {
  await send({ threadId, content });
} catch (error) {
  // Convex automatically rolls back optimistic update
  console.error("Failed to send:", error);
}
```

### Loading States

```typescript
const messages = useQuery(api.messages.list, { threadId });

if (messages === undefined) {
  return <Spinner />;
}

// messages is now definitely loaded
return <MessageList messages={messages} />;
```

## Backend (HTTP) Patterns

### When to Use HTTP Actions

Use HTTP Actions only when:

1. **External service calls Convex** (backend, webhooks)
2. **Server-to-server authentication** is needed
3. **Creating data from AI/backend processes**

Do NOT use HTTP Actions for:

1. Frontend reads (use `useQuery`)
2. Frontend writes (use `useMutation`)
3. Proxying frontend requests

### HTTP Action Structure

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/api/artifacts/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Validate
    if (!body.threadId || !body.content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // Run mutation
    const id = await ctx.runMutation(api.artifacts.create, body);

    return new Response(
      JSON.stringify({ value: id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }),
});

export default http;
```

### Backend Client

```typescript
// backend/src/lib/convex.ts
const CONVEX_URL = process.env.CONVEX_SITE_URL;

export async function createArtifact(
  threadId: string,
  type: string,
  title: string,
  content: string
): Promise<{ id: string } | null> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'artifacts:create',
      args: { threadId, type, title, content }
    }),
  });

  if (!response.ok) return null;

  const result = await response.json();
  return result.value ? { id: result.value } : null;
}
```

## Schema Design

### Use Strong Types

```typescript
// schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  artifacts: defineTable({
    threadId: v.string(),
    type: v.union(v.literal("plan"), v.literal("report")),
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_thread", ["threadId"]),
});
```

### Index Strategy

```typescript
// Index for common queries
defineTable({
  // ...
})
  .index("by_thread", ["threadId"])           // Filter by thread
  .index("by_user", ["userId"])               // Filter by user
  .index("by_status", ["status", "createdAt"]) // Filter + sort
```

### ID References

```typescript
// Strong reference to another table
messages: defineTable({
  threadId: v.id("threads"),  // Must exist in threads table
  // ...
}),

// String reference (for flexibility)
artifacts: defineTable({
  threadId: v.string(),  // Can be any string
  // ...
}),
```

## Mutation Patterns

### Create with Timestamps

```typescript
export const create = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", {
      ...args,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

### Update with Validation

```typescript
export const update = mutation({
  args: {
    id: v.string(),
    content: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize string to Convex ID
    const docId = ctx.db.normalizeId("artifacts", args.id);
    if (!docId) {
      console.error("Invalid ID:", args.id);
      return null;
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    if (args.content !== undefined) updates.content = args.content;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(docId, updates);
    return args.id;
  },
});
```

### Delete Safely

```typescript
export const remove = mutation({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return false;

    await ctx.db.delete(args.id);
    return true;
  },
});
```

## Query Patterns

### List with Index

```typescript
export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});
```

### Get Single Document

```typescript
export const get = query({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
```

### Paginated Query

```typescript
export const listPaginated = query({
  args: {
    threadId: v.id("threads"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .order("desc")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });
  },
});
```

## Common Mistakes

### Mistake 1: Proxying Through Backend

```typescript
// WRONG
app.post('/api/artifacts', async (c) => {
  const body = await c.req.json();
  // Proxying frontend request through backend
  await convex.mutation(api.artifacts.create, body);
  return c.json({ ok: true });
});

// RIGHT: Frontend calls Convex directly
const create = useMutation(api.artifacts.create);
await create(body);
```

### Mistake 2: Manual Refresh

```typescript
// WRONG
const [messages, setMessages] = useState([]);

useEffect(() => {
  const interval = setInterval(async () => {
    const data = await fetchMessages();
    setMessages(data);
  }, 1000);
  return () => clearInterval(interval);
}, []);

// RIGHT: Use reactive query
const messages = useQuery(api.messages.list, { threadId });
```

### Mistake 3: Client-Side IDs

```typescript
// WRONG
await createArtifact({
  id: crypto.randomUUID(),  // Client generates ID
  content: "..."
});

// RIGHT: Let Convex generate IDs
const id = await createArtifact({
  content: "..."
});
// Use the returned ID
```

### Mistake 4: Ignoring Loading States

```typescript
// WRONG
function Messages({ threadId }) {
  const messages = useQuery(api.messages.list, { threadId });
  return messages.map(m => <Message key={m._id} {...m} />);
  // Crashes when messages is undefined
}

// RIGHT
function Messages({ threadId }) {
  const messages = useQuery(api.messages.list, { threadId });

  if (messages === undefined) {
    return <Loading />;
  }

  return messages.map(m => <Message key={m._id} {...m} />);
}
```

## Testing

### Unit Test Mutations

```typescript
import { convexTest } from "convex-test";
import { api } from "./_generated/api";

test("create artifact", async () => {
  const t = convexTest();

  const id = await t.mutation(api.artifacts.create, {
    threadId: "test-thread",
    type: "plan",
    title: "Test",
    content: "Content",
  });

  expect(id).toBeDefined();

  const artifact = await t.query(api.artifacts.get, { id });
  expect(artifact?.title).toBe("Test");
});
```

### Test Real-time Updates

```typescript
test("real-time sync", async () => {
  const t = convexTest();

  // Subscribe to query
  const unsubscribe = t.subscribe(
    api.messages.list,
    { threadId },
    (messages) => {
      expect(messages.length).toBe(1);
    }
  );

  // Trigger mutation
  await t.mutation(api.messages.send, {
    threadId,
    content: "Hello",
  });

  unsubscribe();
});
```
