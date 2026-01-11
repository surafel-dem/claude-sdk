# Research Agent System — Project Context

## Identity

Multi-agent research system using Claude Agent SDK with Manus-inspired hybrid architecture.

## Architecture

```
User → Hono Server → Hybrid Agent
                          │
                          ├─ Orchestrator (direct LLM, no sandbox)
                          │
                          └─ Researcher (E2B sandbox, when needed)
```

## Key Components

| File | Purpose |
|------|---------|
| `server.ts` | Hono API with SSE streaming |
| `sandbox/hybrid.ts` | Hybrid architecture (chat/orchestrator/researcher) |
| `sandbox/e2b.ts` | E2B sandbox with templates and auto-pause |
| `prompts/orchestrator.ts` | Planning prompt |
| `prompts/researcher.ts` | Research execution prompt |
| `agents/` | Agent configurations |

## Project Structure

```
backend/src/
├── agents/
│   ├── orchestrator.ts
│   └── researcher.ts
├── prompts/
│   ├── orchestrator.ts
│   └── researcher.ts
├── sandbox/
│   ├── hybrid.ts      # Main hybrid flow
│   ├── e2b.ts         # E2B with templates
│   ├── local.ts       # Local execution
│   └── index.ts       # Mode switching
├── server.ts          # Hono API
└── chat.ts            # CLI

docs/
├── architecture/      # Our implementation docs
└── e2b/               # E2B SDK reference

frontend/src/
└── App.tsx            # React chat UI
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Start chat (returns runId) |
| `GET /api/stream/:runId` | SSE stream |
| `GET /health` | Health check |

## Environment

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
E2B_API_KEY=e2b_...
SANDBOX_MODE=hybrid  # local | e2b | hybrid
```

## Run Commands

```bash
# Server
cd backend && npm run server

# CLI
cd backend && npx tsx src/chat.ts

# Frontend
cd frontend && npm run dev

# Type check
cd backend && npx tsc --noEmit

# Build custom E2B template (run once for faster sandbox startup)
cd backend && npm run build:template
```

## E2B Best Practices

1. **Custom Templates** — Pre-install SDK for fast startup
2. **Auto-Pause** — Use `autoPause: true` for cost savings
3. **Static Methods** — Use `Sandbox.betaPause(id)` not instance method
4. **Sandbox Persistence** — Store sandboxId, resume with `Sandbox.connect()`

## Hybrid Flow

```
1. User sends message
2. Orchestrator (direct LLM, instant)
   - Plans response
   - Detects if research needed
3. If research needed:
   - Researcher (E2B sandbox)
   - Execute tools
   - Write report
4. Orchestrator summarizes
5. Response to user
```

## Key Patterns

- **Manus-style Hybrid**: Fast for chat, sandbox only for execution
- **File Communication**: Agents share via workspace files
- **Session Persistence**: SDK sessions + E2B pause/resume
- **SSE Streaming**: Real-time updates to frontend
