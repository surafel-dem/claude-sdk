# Architecture Documentation

Comprehensive technical documentation for the Research Agent System.

## Documents

| Document | Description |
|----------|-------------|
| [Hybrid Architecture](./07-hybrid-architecture.md) | **Core** - Manus-style chat + agent modes (v2) |
| [Sandbox Hooks](./hooks.md) | Technical details on event streaming |
| [Multi-Agent Orchestration](./02-multi-agent.md) | Agent delegation patterns |
| [File-Based Communication](./03-file-based-communication.md) | Workspace and artifacts |
| [Session Management](./04-sessions.md) | Session persistence and resumption |
| [Sandbox Architecture](./05-sandbox.md) | Local vs E2B execution |
| [Server & Streaming](./06-server-streaming.md) | Hono API and SSE |

## Quick Reference

### Execution Modes

| Mode | Sandbox | Speed | Use |
|------|---------|-------|-----|
| Chat | ❌ | Instant | Q&A |
| Hybrid | 🔄 | Fast + Slow | Research |
| Agent | ✅ | Slower | Full execution |

### Endpoints

```bash
POST /api/quick-chat     # Chat mode (no sandbox)
POST /api/chat           # Agent/hybrid mode
GET  /api/stream/:runId  # SSE stream
GET  /health             # Health check
```

### Agents

| Agent | Role | Tools |
|-------|------|-------|
| Orchestrator | Planning | None (direct LLM) |
| Researcher | Execution | WebSearch, WebFetch, Write |

### Workspace

```text
/workspace (E2B) or ./workspace (local)
├── RESEARCH_PLAN.md   # Orchestrator creates
├── progress.json      # Status tracking
└── report.md          # Researcher writes
```

### Environment

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
SANDBOX_MODE=hybrid  # local | e2b | hybrid
E2B_API_KEY=e2b_...
```

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    Hono Server (:3001)                      │
├─────────────────────────────────────────────────────────────┤
│                           │                                 │
│      ┌────────────────────┼────────────────────┐            │
│      │                    │                    │            │
│  ┌───▼───┐          ┌─────▼─────┐        ┌─────▼─────┐     │
│  │ CHAT  │          │  HYBRID   │        │   AGENT   │     │
│  │ MODE  │          │   MODE    │        │   MODE    │     │
│  └───┬───┘          └─────┬─────┘        └─────┬─────┘     │
│      │                    │                    │            │
│  Direct LLM          Orchestrator          E2B Full        │
│  (instant)           (LLM) + Researcher    (all tools)     │
│                      (E2B when needed)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Patterns

### 1. Hybrid Architecture

Orchestrator runs without sandbox for fast planning. Sandbox only spins up when researcher needs to execute.

### 2. E2B Pause/Resume

```typescript
// Pause - preserves full state
await sandbox.betaPause();

// Resume - reconnect to paused sandbox
const sandbox = await Sandbox.connect(sandboxId);
```

### 3. File-Based Communication

Agents communicate via shared workspace files, not direct message passing.

### 4. SSE Streaming

Real-time updates sent to frontend via Server-Sent Events.

### 5. Session Management

SDK sessions persist across requests. Sandbox state preserved via pause/resume.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| LLM API | @anthropic-ai/sdk |
| Server | Hono |
| Sandbox | E2B (Firecracker) |
| Frontend | Vite + React |
