# E2B Sandbox Documentation

Reference documentation for E2B sandbox integration.

## Quick Start

### 1. Build Template (First Time Only)

```bash
cd backend
npm run setup    # Builds E2B template with pre-installed SDK (2-5 mins)
```

This creates a custom template `claude-research-agent-v1` with:

- Node.js 22
- @anthropic-ai/claude-agent-sdk pre-installed
- `/home/user/workspace` and `/home/user/files` directories

### 2. Verify Template

```bash
npm run template:check   # Should show "✅ Template exists"
```

### 3. Start Server

```bash
npm run dev   # Sandbox creation is now instant!
```

---

## How It Works

### Without Template (Slow)

```
Create sandbox → npm install SDK (~30s) → Run agent
```

### With Template (Fast)

```
Create sandbox from template → Run agent (instant!)
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | Build template (run once) |
| `npm run build:template` | Same as setup |
| `npm run template:check` | Verify template exists |
| `npm run template:ensure` | Build only if missing |

---

## Execution Modes

The server supports two execution modes:

| Mode | Location | Sandbox | Use Case |
|------|----------|---------|----------|
| **Local** | Backend process | No | Development, testing |
| **Sandbox** | E2B cloud | Yes | Production, isolation |

Both modes use the same agent code and prompts.

---

## Template Configuration

**Template Alias:** `claude-research-agent-v1`

Defined in:

- `backend/src/scripts/build-template.ts`
- `backend/src/sandbox/sandbox-manager.ts`

**Pre-installed Packages:**

- `@anthropic-ai/claude-agent-sdk`

**Directories:**

- `/home/user/workspace` - Agent working directory
- `/home/user/files` - File output directory

---

## Sandbox Lifecycle

```
1. Create from template (instant)
2. Run agent script
3. Auto-pause when idle (cost savings)
4. Resume on next request
5. Kill after session ends
```

### Auto-pause

Sandboxes use `autoPause: true` for cost savings:

```typescript
const sandbox = await Sandbox.betaCreate('claude-research-agent-v1', {
  autoPause: true,  // Pauses automatically when idle
});
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `E2B_API_KEY` | Yes | E2B API key |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `ANTHROPIC_AUTH_TOKEN` | Alt | Alternative to API_KEY |
| `ANTHROPIC_MODEL` | No | Model name |

---

## SDK Reference

- [Sandbox API](./e2b-sandbox.md)
- [Template Builder](./e2b-template.md)

## External Links

- <https://e2b.dev/docs/sdk-reference/js-sdk/v2.8.4/sandbox>
- <https://e2b.dev/docs/sdk-reference/js-sdk/v2.8.4/template>
- <https://e2b.dev/docs/sandbox/overview>
- <https://e2b.dev/docs/template/quickstart>
