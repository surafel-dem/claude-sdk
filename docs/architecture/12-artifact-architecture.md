# Artifact Architecture: Claude-Style Editable Canvas

## Overview

This document defines a clean architecture for artifacts (editable documents/canvas) that follows modern LLM patterns from Claude Artifacts, ChatGPT Canvas, and Gemini Docs.

## Key Principles

1. **Artifacts are First-Class Entities** - Stored in Convex, synced in real-time
2. **Agent-Controlled Creation** - Orchestrator creates/updates artifacts via tools
3. **User-Editable** - Users can open, edit, and save artifacts
4. **Real-Time Sync** - Changes sync instantly between agent and user
5. **SSE for Streaming** - Artifact content streams live during creation

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐    ┌──────────────────────────────────────┐  │
│  │     Chat Panel       │    │        Artifact Panel                │  │
│  │  ┌────────────────┐  │    │  ┌─────────────────────────────────┐ │  │
│  │  │ Messages       │  │    │  │ ArtifactEditor                  │ │  │
│  │  │  - text        │  │    │  │  - Live preview (markdown)      │ │  │
│  │  │  - artifacts   │──│────│──│  - Edit mode (text editor)      │ │  │
│  │  │  - activities  │  │    │  │  - Approve/Save buttons         │ │  │
│  │  └────────────────┘  │    │  └─────────────────────────────────┘ │  │
│  └──────────────────────┘    └──────────────────────────────────────┘  │
│                          │                       ▲                      │
│                          │ useQuery              │ useMutation          │
│                          ▼                       │                      │
└─────────────────────────────────────────────────────────────────────────┘
                           │                       ▲
                           │     Real-time Sync    │
                           ▼                       │
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONVEX (Backend)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────┐   │
│  │   artifacts      │  │     threads       │  │     messages        │   │
│  │ - id             │  │ - id              │  │ - id                │   │
│  │ - threadId       │  │ - userId          │  │ - threadId          │   │
│  │ - type (plan/    │  │ - title           │  │ - role              │   │
│  │        report)   │  │ - status          │  │ - content           │   │
│  │ - title          │  │ - createdAt       │  │ - hasArtifacts      │   │
│  │ - content        │  └───────────────────┘  │ - artifactIds[]     │   │
│  │ - status (draft/ │                         └─────────────────────┘   │
│  │         approved)│                                                   │
│  │ - createdAt      │                                                   │
│  │ - updatedAt      │                                                   │
│  └──────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                           ▲
                           │ SSE + API calls
                           │
┌─────────────────────────────────────────────────────────────────────────┐
│                          HONO (API Server)                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/chat                                                    │  │
│  │   → Start research, get runId                                     │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ GET /api/stream/:runId                                            │  │
│  │   → SSE stream: text, activities, artifact events                 │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ POST /api/artifacts/:threadId                                     │  │
│  │   → Create artifact (called by agent)                             │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ PUT /api/artifacts/:artifactId                                    │  │
│  │   → Update artifact (called by user or agent)                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Orchestrator (Claude Agent SDK)                                   │  │
│  │   Tools:                                                          │  │
│  │   - create_artifact(type, title, content)                         │  │
│  │   - update_artifact(id, content)                                  │  │
│  │   - read_artifact(id)                                             │  │
│  │   - approve_plan()                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Agent Creates Artifact

```
User: "Research AI agent patterns"
        │
        ▼
┌──────────────────┐
│ Orchestrator LLM │
│ (Claude)         │
└────────┬─────────┘
         │ Tool call: create_artifact({ 
         │   type: "plan", 
         │   title: "Research Plan",
         │   content: "## Goal\n..."
         │ })
         ▼
┌──────────────────┐
│ Convex Mutation  │
│ artifacts.create │
└────────┬─────────┘
         │ Returns: { id, type, title, content }
         ▼
┌──────────────────┐
│ SSE Event        │
│ event: artifact  │
│ data: {...}      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Frontend         │
│ Shows artifact   │
│ card + panel     │
└──────────────────┘
```

### 2. User Edits Artifact

```
User clicks "Edit" on artifact panel
        │
        ▼
┌──────────────────┐
│ Edit Mode        │
│ (textarea)       │
└────────┬─────────┘
         │ User makes changes
         │ Clicks "Save"
         ▼
┌──────────────────┐
│ Convex Mutation  │
│ artifacts.update │
└────────┬─────────┘
         │ Real-time sync
         ▼
┌──────────────────────────────────┐
│ Both agent and user see updates │
└──────────────────────────────────┘
```

### 3. Agent Reads User's Edits

```
Agent needs current plan:
        │
        ▼
┌──────────────────┐
│ Tool call:       │
│ read_artifact()  │
└────────┬─────────┘
         │ Convex Query
         ▼
┌──────────────────┐
│ Returns latest   │
│ content (with    │
│ user's edits)    │
└──────────────────┘
```

---

## Convex Schema Update

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  threads: defineTable({
    userId: v.string(),
    title: v.string(),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    artifactIds: v.optional(v.array(v.id("artifacts"))),  // Link to artifacts
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  // ARTIFACTS - First-class entities
  artifacts: defineTable({
    threadId: v.id("threads"),
    type: v.union(v.literal("plan"), v.literal("report"), v.literal("document"), v.literal("code")),
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("archived")),
    version: v.number(),  // For tracking changes
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_thread", ["threadId"]),
});
```

---

## Convex Mutations (artifacts.ts)

```typescript
// convex/artifacts.ts
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all artifacts for a thread
export const list = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .collect();
  },
});

// Get single artifact
export const get = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.artifactId);
  },
});

// Create artifact (called by agent)
export const create = mutation({
  args: {
    threadId: v.id("threads"),
    type: v.union(v.literal("plan"), v.literal("report"), v.literal("document"), v.literal("code")),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("artifacts", {
      ...args,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update artifact (called by user OR agent)
export const update = mutation({
  args: {
    artifactId: v.id("artifacts"),
    content: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    await ctx.db.patch(args.artifactId, {
      ...(args.content !== undefined && { content: args.content }),
      ...(args.status !== undefined && { status: args.status }),
      version: artifact.version + 1,
      updatedAt: Date.now(),
    });
  },
});

// Approve plan (special case)
export const approve = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");
    if (artifact.type !== "plan") throw new Error("Only plans can be approved");

    await ctx.db.patch(args.artifactId, {
      status: "approved",
      updatedAt: Date.now(),
    });
  },
});
```

---

## Agent Tools (Orchestrator)

```typescript
// backend/src/tools/artifacts.ts
import type { Tool } from '@anthropic-ai/claude-agent-sdk';

// These tools let the agent create/read/update artifacts stored in Convex

export const artifactTools: Tool[] = [
  {
    name: 'create_artifact',
    description: 'Create a new artifact (plan, report, or document) that the user can view and edit',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['plan', 'report', 'document', 'code'] },
        title: { type: 'string', description: 'Title of the artifact' },
        content: { type: 'string', description: 'Markdown content' },
      },
      required: ['type', 'title', 'content'],
    },
  },
  {
    name: 'update_artifact',
    description: 'Update an existing artifact. Use this to modify content or status.',
    input_schema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'ID of the artifact to update' },
        content: { type: 'string', description: 'New content (optional)' },
        status: { type: 'string', enum: ['draft', 'approved', 'archived'] },
      },
      required: ['artifactId'],
    },
  },
  {
    name: 'read_artifact',
    description: 'Read the current content of an artifact. Use this to see user edits.',
    input_schema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'ID of the artifact to read' },
      },
      required: ['artifactId'],
    },
  },
];
```

---

## SSE Event Types

```typescript
// Event types sent during streaming

// Text content (streamed character by character)
{ event: 'text', data: 'Hello...' }

// Activity/status update
{ event: 'status', data: 'Analyzing query...' }

// Tool call
{ event: 'tool', data: '{"name": "search", "input": {...}}' }

// Artifact created/updated (triggers UI to show artifact card)
{ event: 'artifact', data: '{"id": "abc", "type": "plan", "title": "Research Plan", "content": "..."}' }

// Artifact content update (for live typing effect)
{ event: 'artifact_delta', data: '{"id": "abc", "delta": "new text chunk"}' }

// Stream complete
{ event: 'done', data: '' }
```

---

## Frontend Components

### ArtifactCard (in message stream)

```tsx
// Shows clickable card for artifact in message
<ArtifactCard 
  artifact={artifact}
  onClick={() => setActiveArtifact(artifact.id)}
/>
```

### ArtifactPanel (side panel)

```tsx
// Shows artifact content with edit/approve buttons
<ArtifactPanel
  artifactId={activeArtifactId}
  onClose={() => setActiveArtifact(null)}
/>
```

### Real-time updates via Convex

```tsx
// Panel automatically updates when artifact changes
const artifact = useQuery(api.artifacts.get, { artifactId });
```

---

## Key Benefits

1. **Single Source of Truth** - Artifacts in Convex, not local files
2. **Real-Time Sync** - User edits appear instantly for agent
3. **Clean Separation** - Agent creates via tools → User edits via UI
4. **Versioning** - Track changes with version numbers
5. **No Hacky Sync** - No file system, no polling, just Convex subscriptions

---

## Migration Path

1. **Update Convex schema** - Add artifacts table
2. **Create artifact mutations** - list, get, create, update, approve
3. **Add agent tools** - create_artifact, read_artifact, update_artifact
4. **Update SSE handler** - Emit artifact events when tools are called
5. **Update frontend** - Use Convex queries for real-time artifact data
6. **Remove file-based artifacts** - No more workspace/plan.md

---

## Claude Agent SDK Built-In Features

The Claude Agent SDK provides several built-in features that we should leverage instead of custom implementations:

### 1. User Approval & Input (`canUseTool`)

**What it does:** Claude can request user approval before executing tools, or ask clarifying questions.

**How it works:**

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const options: ClaudeAgentOptions = {
  canUseTool: async (toolName, input, context) => {
    // For plan approval
    if (toolName === 'create_plan') {
      // Show plan to user in UI, wait for approval
      const userApproved = await showApprovalUI(input);
      if (userApproved) {
        return { behavior: 'allow', updatedInput: input };
      }
      return { behavior: 'deny', message: 'User rejected the plan' };
    }
    
    // For clarifying questions
    if (toolName === 'AskUserQuestion') {
      const answers = await showQuestionsUI(input.questions);
      return { behavior: 'allow', updatedInput: { ...input, answers } };
    }
    
    // Auto-approve safe tools
    return { behavior: 'allow', updatedInput: input };
  }
};
```

**Use Cases:**

- ✅ **Plan Approval** - Show research plan, get user OK before proceeding
- ✅ **Clarifying Questions** - Ask user to choose between approaches
- ✅ **File Write Approval** - Confirm before writing important files
- ✅ **Cost Approval** - Confirm expensive operations

**Integration with Our UI:**

```
User sends message → Agent creates plan → SSE: approval_required event
                                                      │
                                              Frontend shows modal
                                              "Approve this plan?"
                                                      │
                                              User clicks Approve
                                                      │
                                              API call with approval
                                                      │
                                              Agent continues execution
```

---

### 2. File Checkpointing (Version Control)

**What it does:** Tracks file changes during agent sessions and allows rewinding to any previous state.

**How it works:**

```typescript
import { ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const options: ClaudeAgentOptions = {
  enableFileCheckpointing: true,
  permissionMode: 'acceptEdits',
  extraArgs: { 'replay-user-messages': null },
  env: { 
    ...process.env, 
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' 
  }
};

// Capture checkpoint UUID from response
let checkpointId: string;
for await (const message of query({ prompt, options })) {
  if (message.type === 'user' && message.uuid) {
    checkpointId = message.uuid;
  }
}

// Later, rewind to checkpoint
await client.rewindFiles(checkpointId);
```

**Use Cases:**

- ✅ **Undo Changes** - User doesn't like the report, rewind to plan stage
- ✅ **Multiple Restore Points** - Create checkpoints at key milestones
- ✅ **Safe Experimentation** - Try risky operations, rewind if they fail

**Mapping to Artifacts:**

- Instead of file checkpoints → Use Convex artifact `version` field
- SDK checkpoints work on filesystem → Our artifacts are in Convex
- **Recommendation:** Use SDK checkpointing for E2B sandbox files, Convex versioning for artifacts

---

### 3. Todo Tracking (Progress Display)

**What it does:** SDK automatically creates and tracks todos for multi-step tasks.

**How it works:**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({ 
  prompt: 'Research AI agent patterns with progress tracking',
  options: { maxTurns: 20 }
})) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use' && block.name === 'TodoWrite') {
        const todos = block.input.todos;
        // Update UI with progress
        displayTodos(todos);
      }
    }
  }
}

function displayTodos(todos) {
  todos.forEach((todo, i) => {
    const icon = todo.status === 'completed' ? '✅' : 
                 todo.status === 'in_progress' ? '🔧' : '⏳';
    console.log(`${i+1}. ${icon} ${todo.content}`);
  });
}
```

**Todo Lifecycle:**

```
pending → in_progress → completed
   ↓
(removed when all complete)
```

**Use Cases:**

- ✅ **Research Progress** - Show steps: "Searching...", "Analyzing...", "Writing..."
- ✅ **Multi-Step Tasks** - Break down complex research into trackable items
- ✅ **User Visibility** - Users see what the agent is working on

**Integration with Activities:**

```
Current UI:                    Enhanced with Todos:
┌──────────────────┐          ┌──────────────────────────┐
│ 🔍 Searching...  │          │ Research Progress        │
│ 📊 Analyzing...  │          │ ✅ 1. Find sources       │
│ ✍️ Writing...    │          │ 🔧 2. Analyze patterns   │
└──────────────────┘          │ ⏳ 3. Write report       │
                              │ ⏳ 4. Summarize findings │
                              └──────────────────────────┘
```

---

### 4. Built-In File Tools

The SDK includes built-in tools for file operations:

| Tool | Description | When Called |
|------|-------------|-------------|
| `Read` | Read file content | Agent needs to check artifact/file |
| `Write` | Create/overwrite file | Agent creates new artifact |
| `Edit` | Modify existing file | Agent updates artifact |
| `NotebookEdit` | Edit Jupyter notebooks | Agent works with .ipynb |
| `Bash` | Run shell commands | Agent executes code |

**Mapping to Our Architecture:**

```
SDK File Tools             →  Our Implementation
─────────────────────────────────────────────────
Write(plan.md)             →  artifacts.create({ type: 'plan', ... })
Read(plan.md)              →  artifacts.get({ id })
Edit(plan.md, changes)     →  artifacts.update({ id, content })
```

**Hybrid Approach:**

- Use SDK file tools for **E2B sandbox** (actual code execution)
- Use Convex artifacts for **user-facing documents** (plans, reports)

---

## Refined Architecture: Leveraging SDK Features

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Chat Panel   │  │ Todo Panel   │  │ Artifact     │  │ Approval    │ │
│  │ - messages   │  │ - progress   │  │ Panel        │  │ Modal       │ │
│  │ - streaming  │  │ - checklist  │  │ - view/edit  │  │ - yes/no    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│        │                  ▲                 ▲                ▲          │
│        │ useQuery         │ SSE:todo_update │ useQuery       │ SSE      │
│        ▼                  │                 │                │          │
└─────────────────────────────────────────────────────────────────────────┘
                            │                 │                │
                            │     Real-time Events             │
                            ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          HONO + Agent SDK                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Claude Agent (SDK)                                                │  │
│  │                                                                   │  │
│  │ Built-in:                    Custom:                              │  │
│  │ • TodoWrite (progress)       • create_artifact → Convex           │  │
│  │ • AskUserQuestion (input)    • update_artifact → Convex           │  │
│  │ • Read/Write/Edit (files)    • read_artifact → Convex             │  │
│  │ • Bash (execution)           • search_web → Exa API               │  │
│  │                                                                   │  │
│  │ canUseTool: async (tool, input) => {                              │  │
│  │   if (needsApproval(tool)) await waitForUserApproval();           │  │
│  │ }                                                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                      │                                   │
│                                      │ Convex mutations                  │
│                                      ▼                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONVEX (Real-time Backend)                       │
├─────────────────────────────────────────────────────────────────────────┤
│  threads │ messages │ artifacts (versions) │ Better Auth (users)        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## SSE Event Types (Updated)

```typescript
// Core streaming
{ event: 'text', data: 'Hello...' }
{ event: 'done', data: '' }
{ event: 'error', data: 'Error message' }

// Activities  
{ event: 'status', data: 'Analyzing query...' }
{ event: 'tool', data: '{"name": "search", "input": {...}}' }

// Artifacts (triggers Convex subscription)
{ event: 'artifact_created', data: '{"id": "abc123", "type": "plan"}' }
{ event: 'artifact_updated', data: '{"id": "abc123"}' }

// Todo tracking (from SDK TodoWrite)
{ event: 'todos', data: '[{"content": "Search sources", "status": "completed"}, ...]' }

// User approval required
{ event: 'approval_required', data: '{"type": "plan", "artifactId": "abc123"}' }
{ event: 'question', data: '{"questions": [...]}' }
```

---

## Implementation Order

### Phase 1: Core Artifacts (MVP)

1. ✅ Update Convex schema with artifacts table
2. ✅ Create artifact mutations (create, get, update)
3. ✅ Frontend: ArtifactPanel with Convex `useQuery`
4. ✅ Agent: Custom create_artifact tool → Convex

### Phase 2: User Approval

5. Add `canUseTool` callback for plan approval
2. Add SSE `approval_required` event
3. Frontend: Approval modal component
4. Wire up approval flow

### Phase 3: Todo Progress

9. Parse `TodoWrite` tool calls from SDK response
2. Forward as SSE `todos` events
3. Frontend: Progress checklist component

### Phase 4: Polish

12. Add artifact versioning (undo support)
2. Add `read_artifact` tool for agent to see user edits
3. Add clarifying questions UI
