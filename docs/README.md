# Documentation

## Architecture

Our implementation documentation:

| Document | Description |
|----------|-------------|
| [System Overview](./architecture/01-system-overview.md) | High-level architecture |
| [Multi-Agent](./architecture/02-multi-agent.md) | Orchestrator + Researcher pattern |
| [File Communication](./architecture/03-file-based-communication.md) | Workspace and artifacts |
| [Sessions](./architecture/04-sessions.md) | Session persistence |
| [Sandbox](./architecture/05-sandbox.md) | Execution modes |
| [Server](./architecture/06-server-streaming.md) | Hono API and SSE |
| [Hybrid Architecture](./architecture/07-hybrid-architecture.md) | Manus-style hybrid |

## E2B SDK Reference

Official E2B TypeScript SDK documentation:

| Document | Description |
|----------|-------------|
| [Sandbox](./e2b/e2b-sandbox.md) | Sandbox lifecycle, pause/resume |
| [Template](./e2b/e2b-template.md) | Custom template builder |

## Quick Reference

### Modes

| Mode | Sandbox | Speed |
|------|---------|-------|
| Chat | ❌ Never | Instant |
| Hybrid | 🔄 When needed | Fast |
| Agent | ✅ Always | Slower |

### Endpoints

```
POST /api/chat           # Chat/hybrid mode
GET  /api/stream/:runId  # SSE stream
GET  /health             # Health check
```

### Environment

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
E2B_API_KEY=e2b_...
SANDBOX_MODE=hybrid  # local | e2b | hybrid
```
