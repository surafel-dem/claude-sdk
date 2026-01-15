# Research Agent System

- **What**: Multi-agent research system with two-phase orchestration (Planning → Research)
- **Why**: Demonstrate Claude Agent SDK patterns with hybrid local/sandbox execution
- **How**: Hono backend + React frontend + Convex persistence + SSE streaming

## Architecture

```
User → Frontend (React) → Backend (Hono :3001) → Orchestrator → Local/Sandbox Runner
                              ↓
                         Convex (persistence)
```

**Two-Phase Flow:**
1. Planning phase creates research plan (no sandbox)
2. User approves plan
3. Research phase executes with Exa Search tools

## How to Work

- Read the local `CLAUDE.md` in any directory before making changes
- Prefer editing existing code; avoid new files unless necessary
- SSE streaming is the single source of truth for UI during agent execution
- Convex mutations are fire-and-forget (persistence only, don't affect UI)
- Run `npm run dev` in both `backend/` and `frontend/` for development

## Directory Guide

| Directory | CLAUDE.md | Purpose |
|-----------|-----------|---------|
| `backend/` | [backend/CLAUDE.md](backend/CLAUDE.md) | Hono server, agent orchestration, SDK integration |
| `frontend/` | [frontend/CLAUDE.md](frontend/CLAUDE.md) | React UI, SSE streaming, state management |
| `convex/` | [convex/CLAUDE.md](convex/CLAUDE.md) | Database schema, auth, persistence functions |

## Key Patterns

- **Orchestrator Pattern**: `backend/src/agents/orchestrator.ts` manages phase transitions
- **Local Runner**: `backend/src/agents/local-runner.ts` executes with Claude SDK hooks
- **SSE Streaming**: Backend emits events, frontend processes via EventSource
- **Convex Sync**: Thread history loaded once per switch, not during streaming

## Scripts

```bash
# Development
cd backend && npm run dev     # Start Hono server on :3001
cd frontend && npm run dev    # Start Vite on :5173

# E2B Sandbox (optional)
cd backend && npm run setup   # Build E2B template
```

## Environment

Required in `backend/.env`:
- `ANTHROPIC_API_KEY` - Claude API key
- `EXA_API_KEY` - Exa Search API key
- `CONVEX_URL` - Convex deployment URL

If unsure where to start, ask for a plan and list which CLAUDE.md files to read.
