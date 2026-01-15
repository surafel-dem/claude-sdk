# Convex Backend

Real-time database and serverless functions for the Research Agent.

## Architecture Overview

Convex serves as the **primary backend** for all data operations, providing:
- Real-time subscriptions via `useQuery` hooks
- Optimistic updates via `useMutation` hooks
- Automatic conflict resolution
- Type-safe database operations

### Data Flow Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  useQuery    │  │  useMutation │  │  useQuery    │          │
│  │  (threads)   │  │  (messages)  │  │  (artifacts) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONVEX (Real-time)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Database Tables                        │  │
│  │  • threads    • messages    • artifacts    • sessions     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ▲                                  │
│                              │ HTTP Actions                     │
└──────────────────────────────┼──────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                      BACKEND (Hono)                             │
│  • Creates artifacts during research (one-way)                  │
│  • Reads thread history for context                             │
│  • Manages sessions for SDK resumption                          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Frontend → Convex Direct**: All user-initiated mutations go directly to Convex
2. **Backend → Convex HTTP**: Backend uses HTTP Actions for creation only
3. **Real-time Sync**: Convex handles all subscription and sync logic
4. **No Backend Proxy**: Never proxy Convex operations through the backend

## Schema

```typescript
// threads: User chat sessions
threads: {
  userId: string,       // Auth user ID
  title: string,        // First message excerpt
  status: string,       // "active" | "archived"
  createdAt: number,
  updatedAt: number
}

// messages: Chat history
messages: {
  threadId: Id<"threads">,
  role: "user" | "assistant",
  content: string,
  createdAt: number
}

// artifacts: Plans and Reports
artifacts: {
  threadId: string,     // Thread reference
  type: "plan" | "report",
  title: string,
  content: string,      // Markdown content
  status: "draft" | "approved",
  createdAt: number,
  updatedAt: number
}

// sessions: SDK session persistence
sessions: {
  threadId: string,     // Thread reference (unique)
  sdkSessionId: string, // Claude SDK session ID
  phase: string,        // "idle" | "planning" | "researching" | "complete"
  plan: string,         // Approved plan content (optional)
  mode: string,         // "local" | "sandbox"
  createdAt: number,
  updatedAt: number
}
```

## Functions

### Threads

| Function | Type | Description |
|----------|------|-------------|
| `threads.create` | Mutation | Create new thread |
| `threads.listForUser` | Query | Get user's threads (real-time) |
| `threads.updateTitle` | Mutation | Update thread title |

### Messages

| Function | Type | Description |
|----------|------|-------------|
| `messages.send` | Mutation | Add message to thread |
| `messages.list` | Query | Get thread messages (real-time) |

### Artifacts

| Function | Type | Description |
|----------|------|-------------|
| `artifacts.create` | Mutation | Create artifact |
| `artifacts.update` | Mutation | Update content/status |
| `artifacts.listByThread` | Query | Get thread artifacts (real-time) |
| `artifacts.get` | Query | Get single artifact |

### Sessions

| Function | Type | Description |
|----------|------|-------------|
| `sessions.upsert` | Mutation | Create or update session |
| `sessions.getByThread` | Query | Get session by thread ID |
| `sessions.updatePhase` | Mutation | Update session phase |

## HTTP Endpoints

HTTP Actions allow external services (backend) to call Convex:

### POST /api/mutation
Generic mutation endpoint for backend operations.

```typescript
// Request
{
  path: "artifacts:create",
  args: {
    threadId: string,
    type: "plan" | "report",
    title: string,
    content: string
  }
}

// Response
{ value: "<artifact-id>" }
```

### GET /api/thread-history
Fetch thread context for backend processing.

```typescript
// Request
GET /api/thread-history?threadId=<thread-id>

// Response
{
  messages: [{ role: string, content: string, createdAt: number }],
  artifacts: [{ type: string, title: string, content: string, createdAt: number }]
}
```

### POST /api/artifacts/update
Update artifact content or status (for backend use when needed).

```typescript
// Request
{
  path: "artifacts:update",
  args: {
    id: string,
    content?: string,
    status?: string
  }
}
```

## Frontend Integration

### Real-time Queries

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function ChatComponent() {
  // Real-time subscriptions - auto-update on changes
  const threads = useQuery(api.threads.listForUser);
  const messages = useQuery(api.messages.list, { threadId });
  const artifacts = useQuery(api.artifacts.listByThread, { threadId });

  // Mutations - optimistic updates
  const sendMessage = useMutation(api.messages.send);
  const updateArtifact = useMutation(api.artifacts.update);

  // Send message
  await sendMessage({ threadId, role: 'user', content: 'Hello' });

  // Update artifact (direct to Convex, real-time sync)
  await updateArtifact({ id: artifactId, content: newContent });
}
```

### Best Practices

1. **Use `useQuery` for all reads** - Get real-time updates automatically
2. **Use `useMutation` for all writes** - Get optimistic updates
3. **Skip queries conditionally** - Use `"skip"` when data not needed:
   ```typescript
   const messages = useQuery(
     api.messages.list,
     threadId ? { threadId } : "skip"
   );
   ```
4. **Don't proxy through backend** - Call Convex directly from frontend

## Backend Integration

The backend (Hono server) uses HTTP Actions for specific operations:

```typescript
// backend/src/lib/convex.ts

// Create artifact during research
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
  const result = await response.json();
  return result.value ? { id: result.value } : null;
}

// Get thread history for context
export async function getThreadHistory(threadId: string) {
  const response = await fetch(
    `${CONVEX_URL}/api/thread-history?threadId=${threadId}`
  );
  return await response.json();
}
```

## Environment Variables

```bash
# Frontend (.env)
VITE_CONVEX_URL=https://your-project.convex.cloud

# Backend (.env)
CONVEX_SITE_URL=https://your-project.convex.site
# OR
CONVEX_URL=https://your-project.convex.cloud
```

## Development

```bash
# Start Convex dev server
npx convex dev

# Deploy to production
npx convex deploy

# View dashboard
npx convex dashboard
```

## File Structure

```
convex/
├── _generated/        # Auto-generated types and API
├── auth.ts           # Authentication setup
├── artifacts.ts      # Artifact CRUD operations
├── messages.ts       # Message operations
├── threads.ts        # Thread operations
├── sessions.ts       # Session persistence
├── http.ts           # HTTP endpoints for backend
├── internal.ts       # Internal functions (tool calls, etc.)
├── schema.ts         # Database schema definition
└── README.md         # This file
```
