# Root CLAUDE.md Template

Use this template for the root-level CLAUDE.md file:

```md
# Project Overview

- **What**: [Brief one-line description of the project]
- **Why**: [Product/domain purpose - what problem does it solve?]
- **How**: [High-level architecture overview]

## Tech Stack

- **Frontend**: [Framework, UI library]
- **Backend**: [Framework, API style]
- **Database**: [Database type, ORM]
- **Other**: [Any other key technologies]

## How to Work

- Prefer editing existing code; avoid new files unless necessary
- Before changing anything, scan related files and recent tests
- Keep changes small and incremental
- Run relevant tests before considering a task done
- Follow existing patterns; don't introduce new conventions without discussion

## Directory Guide

When working in a directory, read its local CLAUDE.md:

- `[directory1]/CLAUDE.md` – [brief description of what it covers]
- `[directory2]/CLAUDE.md` – [brief description of what it covers]
- `[directory3]/CLAUDE.md` – [brief description of what it covers]

## Common Commands

```bash
# Development
[command to start dev server]

# Testing
[command to run tests]

# Building
[command to build]
```

## Getting Started

If unsure where to start, ask for a plan and list which CLAUDE files to read.

```

## Notes

- Keep the root CLAUDE.md **short and high-level** (< 100 lines ideal)
- Focus on **project-wide** conventions, not directory-specific details
- Use it as a **router** to point agents to the right sub-CLAUDE files
