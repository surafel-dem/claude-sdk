# Convex Context

- **Tech**: Convex serverless database, @convex-dev/auth for authentication
- **Purpose**: Persistence layer for threads, messages, artifacts, and session state

## Conventions

- **Fire-and-Forget from Backend**: Backend calls mutations via HTTP, doesn't wait for results
- **One-Time Load in Frontend**: Thread history loaded once per switch, not real-time during streaming
- **HTTP Endpoints**: Backend uses `/api/mutation` for persistence calls
- **Auth Tables**: Uses `@convex-dev/auth` for user authentication

## Key Files

- `schema.ts` — Database schema with all table definitions
- `threads.ts` — Thread CRUD operations
- `messages.ts` — Message persistence
- `artifacts.ts` — Artifact storage and updates
- `sessions.ts` — SDK session state for resumption
- `http.ts` — HTTP routes for backend integration
- `auth.ts` — Authentication configuration

## Schema Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `threads` | Chat conversations | userId, title, status |
| `messages` | User/assistant messages | threadId, role, content |
| `artifacts` | Plans and reports | threadId, type, content, status |
| `sessions` | SDK session state | threadId, sdkSessionId, phase, plan |
| `toolCalls` | Audit trail | threadId, toolName, input |
| `approvalRequests` | Human-in-the-loop | threadId, planContent, status |

## Where to Look

- For adding new tables: modify `schema.ts`, run `npx convex dev`
- For new mutations: create function in appropriate file, export from `_generated`
- For HTTP endpoints: see `http.ts` for routing patterns
- For auth config: see `auth.ts` and `auth.config.ts`

## Backend Integration Pattern

```typescript
// Backend calls Convex via HTTP (lib/convex.ts)
await fetch(`${CONVEX_URL}/api/mutation`, {
  method: 'POST',
  body: JSON.stringify({
    path: 'artifacts:create',
    args: { threadId, type, content }
  })
});
```

## Frontend Query Pattern

```typescript
// One-time load per thread switch
const threadMessages = useQuery(
  api.messages.list,
  activeThreadId ? { threadId: activeThreadId } : "skip"
);

// Controlled by loadedThreadRef to prevent re-sync during streaming
```

## Adding New Tables

1. Define table in `schema.ts` with `defineTable()`
2. Create mutations/queries in new file
3. Add HTTP route in `http.ts` if backend needs access
4. Run `npx convex dev` to generate types
