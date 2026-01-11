# UI State Analysis & Artifact Flow

## Executive Summary

This document analyzes the current UI state management, identifies bugs, and proposes a clean architecture based on Claude Agent SDK patterns.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│                                                                              │
│  ┌────────────────────┐     ┌────────────────────┐     ┌─────────────────┐  │
│  │     MainApp        │     │   MessageContent   │     │  ArtifactPanel  │  │
│  │  ─────────────     │     │  ────────────────  │     │  ─────────────  │  │
│  │  - messages[]      │────▶│  - parts[]         │     │  - Convex query │  │
│  │  - currentParts[]  │     │  - groups[]        │────▶│  - useQuery()   │  │
│  │  - activeArtifactId│     │  - ArtifactCard    │     │                 │  │
│  │  - isLoading       │     │                    │     │                 │  │
│  │  - isStreamingRef  │     │                    │     │                 │  │
│  └────────────────────┘     └────────────────────┘     └─────────────────┘  │
│           │                                                      ▲           │
│           │ SSE Events                                           │           │
│           ▼                                                      │           │
│  ┌────────────────────┐                              useQuery(api.artifacts.get)
│  │   EventSource      │                                          │           │
│  │  ─────────────     │                                          │           │
│  │  - text            │                                          │           │
│  │  - artifact        │──────────────────────────────────────────┘           │
│  │  - artifact_created│                                                      │
│  │  - done            │                                                      │
│  └────────────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Hono Server)                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         hybridAgent()                                    ││
│  │  ───────────────────────────────────────────────────────────────────────││
│  │  Yields events:                                                          ││
│  │   - { type: 'orchestrator_text', content: '...' }                        ││
│  │   - { type: 'artifact', content: JSON.stringify({...}) }                 ││
│  │   - { type: 'phase', content: 'Planning...' }                            ││
│  │   - { type: 'done', content: fullResponse }                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │  orchestrator() │───▶│ writeLocalFile() │───▶│  ./workspace/plan.md   │  │
│  │                 │    │  (plan.md)       │    │                         │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONVEX (Database)                                 │
│                                                                              │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────────┐   │
│  │    threads    │    │   messages    │    │        artifacts          │   │
│  │               │    │               │    │ - id, type, title         │   │
│  │               │    │               │    │ - content, status, version│   │
│  └───────────────┘    └───────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## State Machine: MainApp Component

```
                                    ┌─────────────┐
                                    │    IDLE     │
                                    │             │
                                    │ messages=[] │
                                    │ isLoading=F │
                                    └──────┬──────┘
                                           │
                            User types + submits
                                           │
                                           ▼
                              ┌────────────────────┐
                              │   LOADING_START    │
                              │                    │
                              │ isLoading=true     │
                              │ isStreamingRef=T   │
                              │ messages += user   │
                              │ currentParts=[]    │
                              └────────┬───────────┘
                                       │
                              POST /api/chat
                                       │
                                       ▼
                              ┌────────────────────┐
                              │     STREAMING      │◀──────────────┐
                              │                    │               │
                              │ EventSource open   │               │
                              │ currentParts grows │               │
                              └────────┬───────────┘               │
                                       │                           │
             ┌─────────────────────────┼─────────────────────────┐ │
             │                         │                          │ │
        text event              artifact event              done event
             │                         │                          │
             ▼                         ▼                          ▼
    ┌────────────────┐     ┌────────────────────┐     ┌────────────────────┐
    │ Append to text │     │ Add artifact to    │     │    STREAM_END      │
    │ part           │     │ parts[]            │     │                    │
    │                │     │                    │     │ EventSource.close()│
    │ setCurrentParts│     │ setCurrentParts    │     │ messages += parts  │
    └───────┬────────┘     └─────────┬──────────┘     │ currentParts=[]    │
            │                        │                 │ isLoading=false    │
            │                        │                 │ isStreamingRef=F   │
            └────────────────────────┴─────────────────┤                    │
                     back to STREAMING                 └────────┬───────────┘
                                                                │
                                                                ▼
                                                       ┌────────────────┐
                                                       │   CONV_SYNC    │
                                                       │                │
                                                       │ threadMessages │
                                                       │ query triggers │
                                                       │ useEffect      │
                                                       └────────┬───────┘
                                                                │
                                              ┌─────────────────┼─────────────────┐
                                              │                 │                 │
                                   isStreamingRef=true  isStreamingRef=false      │
                                              │                 │                 │
                                              ▼                 ▼                 │
                                      ┌──────────────┐  ┌─────────────────┐      │
                                      │ SKIP UPDATE  │  │ OVERWRITE       │      │
                                      │              │  │ messages from   │      │
                                      │ Keep current │  │ Convex (TEXT    │      │
                                      │ messages     │  │ ONLY - no       │      │
                                      │              │  │ artifacts!)     │──────┘
                                      └──────────────┘  └─────────────────┘
                                                               ▲
                                                               │
                                                        🐛 BUG HERE!
                                            When Convex syncs, it loads
                                            messages as TEXT parts only,
                                            losing all artifacts!
```

---

## Identified Bugs

### Bug 1: Artifacts Lost on Convex Sync ⚠️ CRITICAL

**Location:** `MainApp useEffect` (lines 460-470)

```typescript
useEffect(() => {
  if (threadMessages && !isStreamingRef.current) {
    const loadedMessages: Message[] = threadMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text', content: msg.content }]  // <-- BUG: Only text parts!
    }));
    setMessages(loadedMessages);  // <-- Overwrites any artifacts
  }
  // ...
}, [threadMessages]);
```

**Problem:** When Convex real-time updates trigger (e.g., after `sendMessage`), this effect runs and replaces `messages` with text-only parts, losing all artifacts.

**Why the artifact card "disappears":**

1. Stream ends → `done` event
2. `sendMessage()` saves assistant message to Convex
3. Convex updates `threadMessages` query
4. `useEffect` fires, overwrites `messages` with text-only
5. Artifact gone!

---

### Bug 2: Artifact ID Mismatch

**Location:** `artifact` event handler (line 600-611)

```typescript
eventSource.addEventListener('artifact', (event) => {
  const artifactData = JSON.parse(event.data) as Artifact;
  // artifactData.id = 'plan' (string)
  // But ArtifactPanel expects Id<"artifacts"> (Convex ID)
  parts = [...parts, { type: 'artifact', content: '', artifact: artifactData }];
});
```

**Problem:** The backend sends `id: 'plan'` as a string, but clicking the artifact card tries to use this as a Convex ID, which fails.

---

### Bug 3: `artifact_created` Event Not Being Sent

**Location:** Backend `server.ts` - artifact SSE logic only runs at END of stream after checking filesystem.

The `artifact_created` event (which includes Convex ID) is only sent after:

1. Agent finishes completely
2. Server checks `./workspace/plan.md` exists
3. Server calls Convex to upsert

But by then, the `artifact` event (with `id: 'plan'`) has already been sent during streaming!

---

## State Machine: Artifact Lifecycle

```
                               ┌───────────────────────────────┐
                               │        NEW SESSION            │
                               │                               │
                               │ workspace/plan.md = (deleted) │
                               │ workspace/report.md = (deleted)│
                               └───────────────┬───────────────┘
                                               │
                                    User sends research request
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │     ORCHESTRATOR RUNNING      │
                               │                               │
                               │ Streaming text...             │
                               │ response accumulates          │
                               └───────────────┬───────────────┘
                                               │
                              Regex extracts "## Research: ..."
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │      PLAN EXTRACTED           │
                               │                               │
                               │ writeLocalFile('plan.md')     │
                               │ yield { type: 'artifact', ... }│
                               └───────────────┬───────────────┘
                                               │
                              server.ts sees 'artifact' event
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │    SSE: artifact EVENT        │
                               │                               │
                               │ id: 'plan' (NOT Convex ID!)   │
                               │ content: [full markdown]      │
                               │ type: 'plan'                  │
                               └───────────────┬───────────────┘
                                               │
                               Frontend receives, adds to parts
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │   ARTIFACT CARD VISIBLE       │
                               │                               │
                               │ ArtifactCard rendered         │
                               │ onClick → setActiveArtifactId │
                               └───────────────┬───────────────┘
                                               │
                               User clicks card (id='plan')
                                               │
                                               ▼
                               ┌───────────────────────────────┐
                               │   🐛 ERROR: Invalid Convex ID │
                               │                               │
                               │ useQuery(api.artifacts.get,   │
                               │   { artifactId: 'plan' })     │
                               │                               │
                               │ 'plan' is not a Convex Id!    │
                               └───────────────────────────────┘
```

---

## Root Cause Analysis

### The Dual-ID Problem

We have **two different artifact identification schemes** that don't work together:

| Event | ID Type | Source | When |
|-------|---------|--------|------|
| `artifact` | `'plan'` (string) | hybrid.ts | During streaming |
| `artifact_created` | Convex `Id<"artifacts">` | server.ts | After stream ends |

The frontend expects Convex IDs, but receives string IDs during streaming.

### The Convex Sync Problem

The `useEffect` that syncs with Convex only knows about text content, not artifacts:

```typescript
// Messages in Convex have: { role, content, threadId, createdAt }
// NO artifact information!

// So when we load from Convex:
parts: [{ type: 'text', content: msg.content }]
// All artifacts are lost!
```

---

## Proposed Solution: Clean Artifact Architecture

### Principle: Artifacts are First-Class Convex Entities

Instead of:

- Streaming artifact content inline
- Using temporary string IDs
- Losing artifacts on Convex sync

We should:

- Create artifacts in Convex FIRST
- Stream only the Convex ID
- Let the UI query Convex for content (real-time!)
- Store artifact IDs in messages

### New Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW ARTIFACT FLOW                                  │
│                                                                              │
│  1. Orchestrator creates plan                                                │
│     │                                                                        │
│     ▼                                                                        │
│  2. Backend saves to Convex artifacts table                                  │
│     ├── Creates artifact record                                              │
│     ├── Gets back Convex Id<"artifacts">                                     │
│     └── Sends SSE: { event: 'artifact', data: { id: CONVEX_ID, type, title }}│
│                                                                              │
│  3. Frontend receives SSE artifact event                                     │
│     ├── Adds artifact part with REAL Convex ID                               │
│     └── ArtifactCard renders with valid ID                                   │
│                                                                              │
│  4. User clicks artifact card                                                │
│     ├── setActiveArtifactId(CONVEX_ID)                                       │
│     └── ArtifactPanel opens, uses useQuery(api.artifacts.get)                │
│                                                                              │
│  5. Assistant message saved to Convex                                        │
│     ├── messages.content = text content                                      │
│     └── messages.artifactIds = [CONVEX_ID, ...]  // NEW FIELD!               │
│                                                                              │
│  6. On page reload / thread switch                                           │
│     ├── Load messages from Convex                                            │
│     ├── For each message with artifactIds: query artifacts                   │
│     └── Reconstruct message parts with artifacts                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Required Changes

#### 1. Backend: Create Artifact in Convex During Streaming

```typescript
// In hybrid.ts - when plan is extracted:
const planMatch = response.match(/## Research(?:\s*Plan)?:[\s\S]*?(?=Ready to|$)/i);
if (planMatch) {
    const plan = planMatch[0].trim();
    writeLocalFile('plan.md', plan);
    
    // NEW: Create in Convex and get real ID
    const artifact = await convex.mutation(api.artifacts.create, {
        threadId,
        type: 'plan',
        title: 'Research Plan',
        content: plan,
    });
    
    yield { 
        type: 'artifact', 
        content: JSON.stringify({
            id: artifact.id,  // REAL Convex ID!
            type: 'plan',
            title: 'Research Plan',
            // NO content - UI will query Convex
        })
    };
}
```

#### 2. Update Convex Messages Schema

```typescript
// convex/schema.ts
messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    artifactIds: v.optional(v.array(v.id("artifacts"))),  // NEW!
    // ...
})
```

#### 3. Frontend: Load Artifacts with Messages

```typescript
// In MainApp useEffect:
useEffect(() => {
  if (threadMessages && !isStreamingRef.current) {
    const loadedMessages: Message[] = threadMessages.map(msg => {
      const parts: MessagePart[] = [{ type: 'text', content: msg.content }];
      
      // NEW: Reconstruct artifact parts from artifactIds
      if (msg.artifactIds) {
        for (const artifactId of msg.artifactIds) {
          parts.push({ 
            type: 'artifact', 
            content: '', 
            artifact: { id: artifactId, type: 'unknown', title: 'Loading...', content: '' } 
          });
        }
      }
      
      return { role: msg.role, parts };
    });
    setMessages(loadedMessages);
  }
}, [threadMessages]);
```

#### 4. Update Message Save to Include Artifact IDs

```typescript
// In handleSubmit done event:
eventSource.addEventListener('done', async () => {
  // Collect artifact IDs from the stream
  const artifactIds = parts
    .filter(p => p.type === 'artifact' && p.artifact?.id)
    .map(p => p.artifact!.id);

  if (fullResponse && threadId) {
    await sendMessage({ 
      threadId, 
      role: 'assistant', 
      content: fullResponse,
      artifactIds,  // NEW!
    });
  }
  // ...
});
```

---

## Quick Fix vs Proper Fix

### Quick Fix (Immediate)

1. Remove the Convex sync that overwrites messages:
   - Only sync on thread switch, not during/after streaming
   - Keep artifacts in local state during session

2. Use the `artifact` event with content:
   - Display artifact content directly from SSE
   - Don't require Convex ID for display

### Proper Fix (Recommended)

Implement the full architecture above:

1. Create artifacts in Convex during streaming
2. Store artifact IDs in messages
3. Reconstruct artifacts on reload

---

## Comparison with Claude Agent SDK

From the Claude Agent SDK guide:

| Our System | Claude Agent SDK |
|------------|------------------|
| File tools write to local `./workspace` | Built-in `Write` tool writes to working directory |
| Plan extracted via regex | Agent naturally creates files as needed |
| Manual artifact SSE events | Message stream includes tool results |
| Complex state management | `query()` generator handles all state |

### Key SDK Pattern We Should Adopt

```typescript
// Claude SDK pattern:
for await (const message of query({ prompt })) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if ('text' in block) console.log(block.text);
      if ('name' in block) {
        // Tool call - could be Write, creating an artifact
        console.log('Tool:', block.name, block.input);
      }
    }
  }
}
```

The SDK doesn't distinguish "artifacts" from regular file operations. A "plan" is just a file the agent wrote. The UI can:

1. Watch for `Write` tool calls
2. Extract file path and content
3. Store in database
4. Display as artifact

---

## Recommended Next Steps

1. **Immediate Fix:** Prevent Convex sync from overwriting during/after streaming
2. **Create Convex HTTP client** in backend for artifact creation during stream
3. **Update messages schema** to include `artifactIds`
4. **Update sendMessage** to save artifact IDs
5. **Update message loading** to reconstruct artifacts
6. **Test full flow:** New session → Plan created → Card visible → Click opens panel → Reload preserves artifact

---

## Appendix: Component Hierarchy

```
App
└── ConvexProviderWithClerk
    └── MainApp
        ├── Sidebar
        │   └── Thread list (from useQuery)
        │
        ├── Chat Area
        │   ├── Messages (map)
        │   │   └── MessageContent
        │   │       ├── ReactMarkdown (text)
        │   │       ├── ActivityGroup (activities)
        │   │       └── ArtifactCard (artifacts)
        │   │
        │   └── Current streaming message
        │       └── MessageContent (currentParts)
        │
        └── ArtifactPanel (if activeArtifactId)
            └── useQuery(api.artifacts.get)
```
