# System Overview

## Architecture

The Research Agent System uses a hybrid architecture inspired by Manus AI, combining fast direct LLM calls with sandboxed execution when needed.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Research Agent System                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Clients: Frontend (Vite) | CLI (chat.ts) | API (curl)                 │
│                             │                                           │
│                      ┌──────▼──────┐                                    │
│                      │ Hono Server │                                    │
│                      │   :3001     │                                    │
│                      └──────┬──────┘                                    │
│                             │                                           │
│         ┌───────────────────┼───────────────────┐                       │
│         │                   │                   │                       │
│    ┌────▼────┐        ┌─────▼─────┐      ┌──────▼──────┐               │
│    │  CHAT   │        │  HYBRID   │      │   AGENT     │               │
│    │  MODE   │        │   MODE    │      │   MODE      │               │
│    └────┬────┘        └─────┬─────┘      └──────┬──────┘               │
│         │                   │                   │                       │
│    @anthropic-ai/sdk   Orchestrator + E2B      E2B Full                │
│    (direct)            (when needed)           (always)                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Hybrid Over Full Sandbox

**Problem**: E2B sandbox creation takes 3-5 seconds. Simple "hello" messages shouldn't wait for sandbox.

**Solution**: Three modes:

- **Chat Mode**: Direct LLM API, no sandbox, instant response
- **Hybrid Mode**: Orchestrator (direct LLM) + Researcher (E2B when needed)
- **Agent Mode**: Full E2B sandbox for everything

### 2. E2B Pause/Resume

**Problem**: E2B sandboxes are ephemeral. Multi-turn conversations lose context.

**Solution**: Use `sandbox.betaPause()` to preserve state and `Sandbox.connect()` to resume.

### 3. File-Based Communication

**Problem**: Agents need to share context and artifacts.

**Solution**: Shared `/workspace` directory with standardized files:

- `RESEARCH_PLAN.md` — Created by orchestrator
- `progress.json` — Status tracking
- `report.md` — Written by researcher

### 4. SSE Streaming

**Problem**: Agent execution is slow. Users need feedback.

**Solution**: Server-Sent Events stream updates in real-time.

## Components

| Component | File | Purpose |
|-----------|------|---------|
| Server | `server.ts` | Hono API with SSE |
| CLI | `chat.ts` | Terminal interface |
| Hybrid | `sandbox/hybrid.ts` | Manus-style architecture |
| E2B | `sandbox/e2b.ts` | Cloud sandbox |
| Local | `sandbox/local.ts` | Local execution |
| Orchestrator | `agents/orchestrator.ts` | Planning agent |
| Researcher | `agents/researcher.ts` | Execution agent |

## Data Flow

### Chat Mode

```text
User → Server → Direct LLM API → Response → User
```

### Hybrid Mode

```text
User → Server → Orchestrator (LLM)
                     │
                     ├─ Creates plan
                     ├─ Asks approval
                     │
                User approves
                     │
                     ▼
               Researcher (E2B)
                     │
                     ├─ Web search
                     ├─ Writes report
                     │
                     ▼
               Orchestrator (LLM)
                     │
                     └─ Summarizes → User
```

### Agent Mode

```text
User → Server → E2B Sandbox → All tools available → Response → User
```
