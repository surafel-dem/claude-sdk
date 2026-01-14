# Convex Backend

Real-time database and serverless functions for the Research Agent.

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
```

## Key Functions

### Threads

- `threads.create` - Create new thread
- `threads.listForUser` - Get user's threads
- `threads.updateTitle` - Update thread title

### Messages

- `messages.send` - Add message to thread
- `messages.listByThread` - Get thread messages

### Artifacts

- `artifacts.create` - Create artifact (called from backend)
- `artifacts.update` - Update artifact content/status
- `artifacts.listByThread` - Get thread artifacts

## HTTP Endpoints

Backend calls Convex via HTTP actions:

```typescript
// POST /createArtifact
{
  threadId: string,
  type: "plan" | "report",
  title: string,
  content: string
}
```

## Frontend Integration

```typescript
// Real-time queries
const threads = useQuery(api.threads.listForUser);
const messages = useQuery(api.messages.listByThread, { threadId });
const artifacts = useQuery(api.artifacts.listByThread, { threadId });

// Mutations
const send = useMutation(api.messages.send);
await send({ threadId, role: 'user', content: 'Hello' });
```
