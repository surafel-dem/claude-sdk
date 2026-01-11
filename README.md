# Research Agent System

A multi-agent research system built with the Claude Agent SDK, featuring a hybrid architecture inspired by Manus AI patterns.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Research Agent System                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│  │  Frontend   │     │    CLI      │     │      API Clients        │   │
│  │  (Vite)     │     │  (chat.ts)  │     │    (curl, etc)          │   │
│  └──────┬──────┘     └──────┬──────┘     └───────────┬─────────────┘   │
│         │                   │                        │                  │
│         └───────────────────┼────────────────────────┘                  │
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
│    Direct LLM         Orchestrator         E2B Sandbox                 │
│    (no sandbox)       (fast LLM) +         (full tools)                │
│                       Researcher                                        │
│                       (E2B when needed)                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Hybrid Architecture** — Fast chat mode + sandbox execution when needed
- **Three Execution Modes** — Chat, Hybrid, and Full Agent
- **E2B Sandbox Persistence** — Pause/resume sandboxes across requests
- **Multi-Agent Orchestration** — Orchestrator + Researcher pattern
- **Session Management** — Resume conversations with context
- **File-Based Communication** — Agents share artifacts via `/workspace`
- **SSE Streaming** — Real-time updates to frontend

## Quick Start

### 1. Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
SANDBOX_MODE=hybrid   # Options: local, e2b, hybrid
E2B_API_KEY=e2b_...   # Required for e2b/hybrid modes
```

### 3. Run

```bash
# Terminal 1: Backend
cd backend && npm run server

# Terminal 2: Frontend
cd frontend && npm run dev

# Or use CLI directly
cd backend && npx tsx src/chat.ts
```

## Execution Modes

| Mode | Sandbox | Speed | Use Case |
|------|---------|-------|----------|
| **Chat** | Never | Instant | Q&A, brainstorming |
| **Hybrid** | When needed | Fast planning | Research with approval |
| **Agent** | Always | Slower | Full execution |

### Chat Mode

Direct LLM calls without sandbox. Instant responses for simple queries.

```bash
curl -X POST http://localhost:3001/api/quick-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is quantum computing?"}'
```

### Hybrid Mode

Orchestrator plans without sandbox, then spins up E2B only for execution.

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Research AI agents", "mode": "hybrid"}'
```

### Agent Mode

Full E2B sandbox from the start with all tools available.

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Research AI agents", "mode": "agent"}'
```

## Project Structure

```
research-agent-system/
├── backend/
│   ├── src/
│   │   ├── agents/              # Agent definitions
│   │   │   ├── orchestrator.ts  # Main agent config
│   │   │   └── researcher.ts    # Subagent for research
│   │   ├── prompts/             # Agent prompts
│   │   │   ├── orchestrator.ts  # Planning prompt
│   │   │   └── researcher.ts    # Research prompt
│   │   ├── sandbox/             # Execution environments
│   │   │   ├── local.ts         # Local execution
│   │   │   ├── e2b.ts           # E2B cloud sandbox
│   │   │   ├── hybrid.ts        # Hybrid architecture
│   │   │   └── index.ts         # Mode switching
│   │   ├── server.ts            # Hono API server
│   │   ├── chat.ts              # CLI chat interface
│   │   └── index.ts             # CLI entry point
│   ├── workspace/               # Shared agent files
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Chat UI
│   │   └── App.css              # Styles
│   └── package.json
│
└── docs/
    └── architecture/            # Architecture documentation
```

## API Reference

### POST /api/quick-chat

Chat mode - no sandbox, instant response.

```json
{
  "message": "Hello",
  "history": []
}
```

### POST /api/chat

Start or resume agent session.

```json
{
  "message": "Research topic",
  "mode": "hybrid",
  "runId": "optional-existing-id"
}
```

### GET /api/stream/:runId

SSE stream for real-time updates.

**Events:**

- `init` — Session initialized
- `text` — Text content
- `tool` — Tool usage
- `sandbox` — Sandbox status
- `done` — Complete
- `error` — Error occurred

## Agent Workflow

```
1. User Request
       │
       ▼
2. Orchestrator (no sandbox)
   • Creates RESEARCH_PLAN.md
   • Asks for approval
       │
       ▼
3. User Approves
       │
       ▼
4. Researcher (E2B sandbox)
   • Reads plan
   • Executes web search
   • Writes report.md
       │
       ▼
5. Orchestrator
   • Reads report
   • Summarizes findings
```

## Workspace Files

| File | Owner | Purpose |
|------|-------|---------|
| `RESEARCH_PLAN.md` | Orchestrator | Research objectives |
| `progress.json` | Orchestrator | Status tracking |
| `report.md` | Researcher | Final findings |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `ANTHROPIC_MODEL` | No | Model name (default: claude-sonnet-4-20250514) |
| `ANTHROPIC_BASE_URL` | No | API base URL |
| `SANDBOX_MODE` | No | local, e2b, or hybrid (default: local) |
| `E2B_API_KEY` | For E2B | E2B API key |
| `PORT` | No | Server port (default: 3001) |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| LLM API | @anthropic-ai/sdk |
| Backend | Hono + Node.js |
| Sandbox | E2B (Firecracker microVMs) |
| Frontend | Vite + React + TypeScript |
| Streaming | Server-Sent Events |

## License

MIT
