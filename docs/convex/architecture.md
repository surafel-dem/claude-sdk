# Convex Architecture

This document explains how Convex is integrated into the Research Agent application and the architectural decisions behind it.

## Overview

Convex is used as the **primary real-time backend** for all data operations. Unlike traditional REST APIs, Convex provides:

- **Real-time subscriptions**: Data updates automatically push to connected clients
- **Optimistic updates**: UI updates instantly before server confirmation
- **Type safety**: End-to-end TypeScript types from database to frontend
- **Automatic caching**: Built-in query deduplication and caching

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                       │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Threads   │    │   Messages  │    │  Artifacts  │                 │
│  │  useQuery   │    │  useQuery   │    │  useQuery   │                 │
│  │ useMutation │    │ useMutation │    │ useMutation │                 │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                 │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                            ▼                                            │
│                   ┌────────────────┐                                    │
│                   │ ConvexProvider │                                    │
│                   │  (WebSocket)   │                                    │
│                   └────────┬───────┘                                    │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
                             │ WebSocket (Real-time)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CONVEX CLOUD                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Functions                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │   │
│  │  │ Queries  │  │Mutations │  │ Actions  │  │  HTTP    │        │   │
│  │  │(read-only│  │ (writes) │  │(side-fx) │  │ Actions  │        │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘        │   │
│  └─────────────────────────────────────────────────┼───────────────┘   │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────┼───────────────┐   │
│  │                      Database                   │                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │   │
│  │  │ threads  │  │ messages │  │ artifacts│  │ sessions │        │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │   │
│  └─────────────────────────────────────────────────┼───────────────┘   │
└────────────────────────────────────────────────────┼────────────────────┘
                                                     │
                                                     │ HTTP (One-way)
                                                     │
┌────────────────────────────────────────────────────┼────────────────────┐
│                           BACKEND (Hono + Claude SDK)                   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Research Agent                                │  │
│  │  • Creates artifacts (plans, reports)                            │  │
│  │  • Reads thread history for context                              │  │
│  │  • Persists session state                                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Pattern 1: User Creates/Updates Data

User actions (sending messages, editing artifacts) go directly to Convex:

```text
User Action → useMutation → Convex → Database
                              ↓
                        Real-time sync
                              ↓
                        All connected clients update
```

**Example: Editing an artifact**

```typescript
const updateArtifact = useMutation(api.artifacts.update);

// User edits artifact content
await updateArtifact({ id: artifactId, content: newContent });
// UI updates optimistically, then confirms
```

### Pattern 2: Backend Creates Data

Backend operations (AI generating content) use HTTP Actions:

```text
Backend → HTTP POST → Convex HTTP Action → Mutation → Database
                                                         ↓
                                                   Real-time sync
                                                         ↓
                                                   Frontend updates
```

**Example: AI creates a research plan**

```typescript
// Backend creates artifact via HTTP
await fetch(`${CONVEX_URL}/api/mutation`, {
  method: 'POST',
  body: JSON.stringify({
    path: 'artifacts:create',
    args: { threadId, type: 'plan', title, content }
  })
});
// Frontend receives update via real-time subscription
```

### Pattern 3: Backend Reads Data

Backend needs context (history) for AI processing:

```text
Backend → HTTP GET → Convex HTTP Action → Query → Database
                              ↓
                         Response
```

**Example: Getting thread history for context**

```typescript
const history = await fetch(
  `${CONVEX_URL}/api/thread-history?threadId=${threadId}`
);
// Use history to build AI prompt
```

## Why This Architecture?

### Why Not Backend → Convex → Frontend?

A common anti-pattern is proxying all Convex operations through a backend:

```text
❌ WRONG: Frontend → Backend → Convex → Database
```

Problems with this approach:

1. **Breaks real-time**: Frontend doesn't get live updates
2. **Double latency**: Request goes through two servers
3. **No optimistic updates**: UI waits for full round-trip
4. **Defeats Convex's purpose**: Convex IS the backend

### Why HTTP Actions for Backend?

The backend (Claude SDK) runs outside the browser and can't use the Convex React client. HTTP Actions provide a bridge:

1. **Server-to-server**: Backend can call Convex directly
2. **Authenticated**: Can add auth tokens for security
3. **One-way**: Backend creates, frontend mutates
4. **Maintains real-time**: Changes still sync to frontend

## Function Types

### Queries (Read-only)

```typescript
export const list = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .collect();
  },
});
```

- Automatically cached
- Re-run when dependencies change
- Subscribe via `useQuery`

### Mutations (Write)

```typescript
export const send = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- Transactional (all-or-nothing)
- Trigger query re-runs
- Optimistic updates via `useMutation`

### HTTP Actions (External Access)

```typescript
export const createHttp = httpAction(async (ctx, request) => {
  const body = await request.json();
  const id = await ctx.runMutation(api.artifacts.create, body);
  return new Response(JSON.stringify({ value: id }));
});
```

- Called via HTTP (not WebSocket)
- Can call mutations/queries
- Used for server-to-server communication

## Best Practices

### 1. Keep Queries Simple

```typescript
// Good: Simple, focused query
export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .collect();
  },
});

// Avoid: Complex aggregations in queries
```

### 2. Use Indexes

```typescript
// schema.ts
artifacts: defineTable({
  threadId: v.string(),
  // ...
}).index("by_thread", ["threadId"]),
```

### 3. Validate at the Edge

```typescript
export const create = mutation({
  args: {
    threadId: v.string(),
    type: v.union(v.literal("plan"), v.literal("report")),
    title: v.string(),
    content: v.string(),
  },
  // Convex validates args automatically
  handler: async (ctx, args) => {
    // ...
  },
});
```

### 4. Use Conditional Queries

```typescript
// Skip query when threadId not available
const messages = useQuery(
  api.messages.list,
  activeThreadId ? { threadId: activeThreadId } : "skip"
);
```

## Session Management

The `sessions` table enables SDK session resumption:

```typescript
// On research start
await upsertSession({
  threadId,
  sdkSessionId: claude.sessionId,
  phase: "planning",
  mode: "local"
});

// On page reload
const session = await getSession(threadId);
if (session?.sdkSessionId) {
  // Resume Claude SDK session
}
```

This allows users to:

- Close browser and return later
- Resume multi-turn research
- Maintain conversation context
