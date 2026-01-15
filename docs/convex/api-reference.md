# Convex API Reference

Complete reference for all Convex functions in the Research Agent.

## Tables

### threads

User chat sessions.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `_id` | `Id<"threads">` | Auto-generated unique ID |
| `userId` | `string` | Auth user ID |
| `title` | `string` | Thread title (first message excerpt) |
| `status` | `"active" \| "archived"` | Thread status |
| `createdAt` | `number` | Unix timestamp (ms) |
| `updatedAt` | `number` | Unix timestamp (ms) |

**Indexes:**

- `by_user`: `["userId"]`

### messages

Chat messages within threads.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `_id` | `Id<"messages">` | Auto-generated unique ID |
| `threadId` | `Id<"threads">` | Reference to parent thread |
| `role` | `"user" \| "assistant"` | Message author |
| `content` | `string` | Message content |
| `createdAt` | `number` | Unix timestamp (ms) |

**Indexes:**

- `by_thread`: `["threadId"]`

### artifacts

Research plans and reports.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `_id` | `Id<"artifacts">` | Auto-generated unique ID |
| `threadId` | `string` | Thread ID (string for flexibility) |
| `type` | `"plan" \| "report"` | Artifact type |
| `title` | `string` | Display title |
| `content` | `string` | Markdown content |
| `status` | `"draft" \| "approved"` | Artifact status |
| `createdAt` | `number` | Unix timestamp (ms) |
| `updatedAt` | `number` | Unix timestamp (ms) |

**Indexes:**

- `by_thread`: `["threadId"]`

### sessions

SDK session persistence for resumption.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `_id` | `Id<"sessions">` | Auto-generated unique ID |
| `threadId` | `string` | Thread ID (unique constraint) |
| `sdkSessionId` | `string` | Claude SDK session ID |
| `phase` | `string` | Current phase (`idle`, `planning`, `researching`, `complete`) |
| `plan` | `string?` | Approved plan content |
| `mode` | `string` | Execution mode (`local`, `sandbox`) |
| `createdAt` | `number` | Unix timestamp (ms) |
| `updatedAt` | `number` | Unix timestamp (ms) |

**Indexes:**

- `by_thread`: `["threadId"]` (unique)

## Queries

### threads.listForUser

Get all threads for the authenticated user.

```typescript
const threads = useQuery(api.threads.listForUser);
```

**Args:** None (uses auth context)

**Returns:** `Thread[]`

### messages.list

Get all messages for a thread.

```typescript
const messages = useQuery(api.messages.list, { threadId });
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `Id<"threads">` | Yes |

**Returns:** `Message[]` (ordered by `createdAt` asc)

### artifacts.listByThread

Get all artifacts for a thread.

```typescript
const artifacts = useQuery(api.artifacts.listByThread, { threadId });
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `Id<"threads">` | Yes |

**Returns:** `Artifact[]` (ordered by `createdAt` desc)

### artifacts.get

Get a single artifact by ID.

```typescript
const artifact = useQuery(api.artifacts.get, { id });
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `id` | `Id<"artifacts">` | Yes |

**Returns:** `Artifact | null`

### sessions.getByThread

Get session for a thread.

```typescript
const session = useQuery(api.sessions.getByThread, { threadId });
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `string` | Yes |

**Returns:** `Session | null`

## Mutations

### threads.create

Create a new thread.

```typescript
const createThread = useMutation(api.threads.create);
const threadId = await createThread({ title: "New Research" });
```

**Args:**

| Arg | Type | Required | Default |
| --- | ---- | -------- | ------- |
| `title` | `string` | No | `"New Thread"` |

**Returns:** `Id<"threads">`

### threads.updateTitle

Update thread title.

```typescript
const updateTitle = useMutation(api.threads.updateTitle);
await updateTitle({ id: threadId, title: "Updated Title" });
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `id` | `Id<"threads">` | Yes |
| `title` | `string` | Yes |

**Returns:** `void`

### messages.send

Send a message to a thread.

```typescript
const send = useMutation(api.messages.send);
const messageId = await send({
  threadId,
  role: "user",
  content: "Hello"
});
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `Id<"threads">` | Yes |
| `role` | `"user" \| "assistant"` | Yes |
| `content` | `string` | Yes |

**Returns:** `Id<"messages">`

### artifacts.create

Create a new artifact.

```typescript
const create = useMutation(api.artifacts.create);
const artifactId = await create({
  threadId: "thread-id",
  type: "plan",
  title: "Research Plan",
  content: "## Plan content..."
});
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `string` | Yes |
| `type` | `string` | Yes |
| `title` | `string` | Yes |
| `content` | `string` | Yes |

**Returns:** `Id<"artifacts">`

### artifacts.update

Update an artifact.

```typescript
const update = useMutation(api.artifacts.update);
await update({
  id: "artifact-id",
  content: "Updated content",
  status: "approved"
});
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `id` | `string` | Yes |
| `content` | `string` | No |
| `status` | `string` | No |

**Returns:** `string | null` (returns ID on success, null on failure)

### sessions.upsert

Create or update a session.

```typescript
const upsert = useMutation(api.sessions.upsert);
await upsert({
  threadId: "thread-id",
  sdkSessionId: "sdk-session-id",
  phase: "planning",
  mode: "local"
});
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `string` | Yes |
| `sdkSessionId` | `string` | Yes |
| `phase` | `string` | Yes |
| `plan` | `string` | No |
| `mode` | `string` | Yes |

**Returns:** `Id<"sessions">`

### sessions.updatePhase

Update session phase.

```typescript
const updatePhase = useMutation(api.sessions.updatePhase);
await updatePhase({
  threadId: "thread-id",
  phase: "researching",
  plan: "Approved plan content"
});
```

**Args:**

| Arg | Type | Required |
| --- | ---- | -------- |
| `threadId` | `string` | Yes |
| `phase` | `string` | Yes |
| `plan` | `string` | No |

**Returns:** `boolean`

## HTTP Endpoints

### POST /api/mutation

Generic mutation endpoint for backend operations.

**Request:**

```json
{
  "path": "artifacts:create",
  "args": {
    "threadId": "thread-id",
    "type": "plan",
    "title": "Research Plan",
    "content": "## Content..."
  }
}
```

**Response:**

```json
{
  "value": "artifact-id"
}
```

**Error Response:**

```json
{
  "error": "Error message"
}
```

### GET /api/thread-history

Get thread history for backend context.

**Request:**

```http
GET /api/thread-history?threadId=thread-id
```

**Response:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Research AI trends",
      "createdAt": 1699999999999
    }
  ],
  "artifacts": [
    {
      "type": "plan",
      "title": "Research Plan",
      "content": "## Plan...",
      "createdAt": 1699999999999
    }
  ]
}
```

### POST /api/artifacts/update

Update artifact via backend.

**Request:**

```json
{
  "path": "artifacts:update",
  "args": {
    "id": "artifact-id",
    "content": "Updated content",
    "status": "approved"
  }
}
```

**Response:**

```json
{
  "value": "artifact-id"
}
```

## Environment Variables

### Frontend

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `VITE_CONVEX_URL` | Convex deployment URL | `https://your-project.convex.cloud` |

### Backend

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `CONVEX_SITE_URL` | Convex HTTP endpoint URL | `https://your-project.convex.site` |
| `CONVEX_URL` | Convex deployment URL (fallback) | `https://your-project.convex.cloud` |

**Note:** Backend converts `.cloud` to `.site` automatically if `CONVEX_SITE_URL` is not set.

## TypeScript Types

### Importing Types

```typescript
import { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

// Document types
type Thread = Doc<"threads">;
type Message = Doc<"messages">;
type Artifact = Doc<"artifacts">;
type Session = Doc<"sessions">;

// ID types
type ThreadId = Id<"threads">;
type MessageId = Id<"messages">;
type ArtifactId = Id<"artifacts">;
type SessionId = Id<"sessions">;
```

### Using with React

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function Component() {
  // Queries are typed automatically
  const threads = useQuery(api.threads.listForUser);
  // threads: Thread[] | undefined

  // Mutations are typed automatically
  const send = useMutation(api.messages.send);
  // send: (args: { threadId: Id<"threads">, role: string, content: string }) => Promise<Id<"messages">>
}
```
