# Architecture Documentation

Technical documentation for the Research Agent System.

## Documents

| Document | Description |
|----------|-------------|
| [Hybrid Architecture](./hybrid-architecture.md) | Core two-phase flow with orchestrator |
| [Sandbox Hooks](./hooks.md) | Event streaming from E2B sandbox |

## Quick Reference

### API Endpoints

```bash
POST /api/chat           # Initialize run, returns runId
GET  /api/stream/:runId  # SSE stream for Phase 1 (planning)
POST /api/continue/:runId # SSE stream for Phase 2 (research)
PUT  /api/artifacts/:id  # Update artifact content
GET  /api/status/:runId  # Check run status
GET  /health             # Health check
```

### Execution Flow

```
1. POST /api/chat → runId
2. GET /api/stream/{runId} → Plan artifact + done
3. User approves
4. POST /api/continue/{runId} → Research events + Report artifact
```

### Agents

| Agent | File | Role |
|-------|------|------|
| Orchestrator | `orchestrator.ts` | Planning, state management |
| Local Runner | `local-runner.ts` | SDK execution on backend |
| Sandbox Runner | `sandbox-runner.ts` | SDK execution in E2B |

### Tech Stack

| Component | Technology |
|-----------|------------|
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| Server | Hono |
| Sandbox | E2B |
| Frontend | Vite + React |
| Database | Convex |

### Environment

```bash
ANTHROPIC_API_KEY=sk-ant-...
E2B_API_KEY=e2b_...
CONVEX_URL=https://...
```
