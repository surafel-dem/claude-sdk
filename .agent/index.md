# Agents Index

This project uses co-located documentation files. Each directory contains:

- `CLAUDE.md` - Full documentation (used by Claude Code)
- `agent.md` - Routing file (used by other AI providers like OpenAI, Gemini)

## Directory Documentation

| Directory | Documentation | Routing |
|-----------|---------------|---------|
| Root | `CLAUDE.md` | `agent.md` |
| `frontend/` | `frontend/CLAUDE.md` | `frontend/agent.md` |
| `backend/` | `backend/CLAUDE.md` | `backend/agent.md` |
| `convex/` | `convex/CLAUDE.md` | `convex/agent.md` |
| `claude-demos/simple-chatapp/` | `claude-demos/simple-chatapp/CLAUDE.md` | `claude-demos/simple-chatapp/agent.md` |

## Routing Logic

- UI/pages/layouts → `frontend/`
- API/auth/business logic → `backend/`
- Database/real-time data → `convex/`
- Demo applications → `claude-demos/`

## How to Use

When working in a specific directory, read its local `CLAUDE.md` for full context. The `agent.md` files are provided for non-Claude AI providers that need routing to the correct documentation.
