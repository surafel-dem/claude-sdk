---
name: claude-md-initializer
description: Initializes a hierarchical CLAUDE.md documentation system across a codebase with a provider-agnostic .agent/ routing layer. This skill should be used when users want to set up project documentation for AI agents, create CLAUDE.md files, or establish a documentation structure for both Claude Code and other AI providers.
---

# Claude-MD-Initializer

This skill creates a hierarchical CLAUDE.md documentation system across any codebase, establishing a "source of truth" for AI agents with a provider-agnostic routing layer.

## Dual-Layer Architecture

| Layer | Files | Used By | Purpose |
|-------|-------|---------|---------|
| **Source of Truth** | `CLAUDE.md` | Claude Code | Full documentation with patterns, conventions, rules |
| **Routing Layer** | `agent.md` (co-located) | OpenAI, Gemini, etc. | One-liner pointers to corresponding CLAUDE.md |
| **Hub** | `.agent/index.md` | All providers | Central index listing all documentation files |

> **Key principle**: Each `agent.md` is placed in the **same directory** as its corresponding `CLAUDE.md`, not in a separate `.agent/` folder structure.

## Workflow

Execute the following steps in order:

### Step 1: Analyze Codebase Structure

Map the project's directory structure to identify major components:

1. Use `list_dir` on the project root to get top-level directories
2. Identify key directories that warrant their own CLAUDE.md (e.g., `frontend/`, `backend/`, `components/`, `database/`, `app/`, `lib/`, `src/`)
3. Note the tech stack from `package.json`, `requirements.txt`, or similar config files

### Step 2: Detect Existing CLAUDE.md Files

Search for existing documentation:

1. Use `find_by_name` with pattern `CLAUDE.md` to locate existing files
2. If found, present them to the user with a summary of their contents
3. Ask the user: **"Do you want to disregard existing CLAUDE.md files and start fresh, or integrate their content?"**
   - If **disregard**: Proceed to Step 3
   - If **integrate**: Read existing files to understand current patterns and incorporate relevant content

### Step 3: Understand Project Context

Build understanding by reviewing:

1. `README.md` or `README` for project purpose
2. `package.json`, `pyproject.toml`, or similar for dependencies and scripts
3. Key entry files (e.g., `index.ts`, `main.py`, `app/layout.tsx`)
4. Any existing documentation in `docs/` or similar

### Step 4: Create Directory CLAUDE.md Files

For each major directory identified in Step 1, create a `CLAUDE.md` file following this structure:

```md
# [Directory Name] Context

- **Tech**: [Framework, language, key libraries]
- **Purpose**: [What this directory is responsible for]

## Conventions

- [Pattern 1]: [Description]
- [Pattern 2]: [Description]
- [Pattern 3]: [Description]

## Key Files

- `[file1]`: [Purpose]
- `[file2]`: [Purpose]

## Where to Look

- For [X]: see `[path]`
- For [Y]: see `[path]`
```

Design principles:

- Keep each file **< 200 lines**
- Focus on **local context only** (this directory and below)
- Use **pointers to files**, not inline code snippets
- Include **patterns specific to this layer** (routing, error handling, testing, etc.)

### Step 5: Create Root CLAUDE.md

Create the root `CLAUDE.md` as the project's "README for agents":

```md
# Project Overview

- **What**: [Brief description of the project]
- **Why**: [Product/domain purpose]
- **How**: [High-level architecture listing key directories]

## How to Work

- Prefer editing existing code; avoid new files unless necessary
- Before changing anything, scan related files and recent tests
- Keep changes small and incremental
- Run relevant tests before considering a task done

## Directory Guide

When working in a directory, read its local CLAUDE.md:

- `frontend/CLAUDE.md` – [brief description]
- `backend/CLAUDE.md` – [brief description]
- `components/CLAUDE.md` – [brief description]
- `database/CLAUDE.md` – [brief description]

If unsure where to start, ask for a plan and list which CLAUDE files to read.
```

### Step 6: Create Co-located agent.md Files

For each directory that has a `CLAUDE.md`, create an `agent.md` **in the same directory**:

1. Place `agent.md` in the **same folder** as `CLAUDE.md`
2. Each `agent.md` contains only a **single routing line**:

```md
Read and follow all instructions in `CLAUDE.md`.
```

Example structure:

```
backend/
├── CLAUDE.md      ← Full documentation
├── agent.md       ← One-liner: "Read CLAUDE.md"
└── src/
```

### Step 7: Create .agent/index.md Hub

Create a hub file at `.agent/index.md` that serves as a central index:

```md
# Agents Index

This project uses co-located documentation files. Each directory contains:
- `CLAUDE.md` - Full documentation (used by Claude Code)
- `agent.md` - Routing file (used by other AI providers)

## Directory Documentation

| Directory | Documentation | Routing |
|-----------|---------------|--------|
| `frontend/` | `frontend/CLAUDE.md` | `frontend/agent.md` |
| `backend/` | `backend/CLAUDE.md` | `backend/agent.md` |
| `components/` | `components/CLAUDE.md` | `components/agent.md` |
| `database/` | `database/CLAUDE.md` | `database/agent.md` |

## Routing Logic

- UI/pages/layouts → `frontend/`
- API/auth/business logic → `backend/`
- Shared UI/design system → `components/`
- Schema/migrations/data → `database/`
```

### Step 8: Present Results to User

After creating all files, present a summary:

1. List all created files with their paths
2. Explain the structure briefly
3. Suggest the user review the generated content for accuracy
4. Offer to make adjustments if needed

## Best Practices

- **Lean files**: Keep each CLAUDE.md under 200-300 lines
- **Local context**: Each file describes only its directory and below
- **Progressive disclosure**: Point to detailed docs, don't duplicate content
- **No cross-copying**: Avoid duplicating rules across CLAUDE.md files
- **Trivial agent.md**: Just one-liner routing, nothing else
- **Update pattern**: When evolving patterns, update CLAUDE.md first, then refactor code to comply
