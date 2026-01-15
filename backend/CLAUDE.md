# Backend Context

- **Tech**: Node.js, Hono, Claude Agent SDK, Exa Search, E2B (optional)
- **Purpose**: API server with two-phase agent orchestration and SSE streaming

## Conventions

- **ESM Modules**: All imports use `.js` extension (TypeScript compiles to ESM)
- **Async Generators**: Agent runners yield `StreamEvent` objects
- **SSE Events**: `text`, `tool`, `status`, `artifact`, `done`, `error`
- **Fire-and-Forget**: Convex calls don't block agent execution

## Key Files

- `src/server.ts` — Hono routes: `/api/chat`, `/api/stream/:runId`, `/api/continue/:runId`
- `src/agents/orchestrator.ts` — Phase management: planning → awaiting_approval → researching → done
- `src/agents/local-runner.ts` — SDK execution with hooks and Exa tools
- `src/agents/hooks.ts` — SDK hooks for streaming events
- `src/lib/convex.ts` — Convex HTTP client for persistence

## Where to Look

- For adding new tools: see `src/tools/exa-search.ts`
- For modifying prompts: see `src/prompts/researcher.ts`
- For phase transitions: see `orchestrator.ts` `approveRun()` and `runResearch()`
- For SSE event handling: see `server.ts` routes and `streamSSE()` calls

## Agent Architecture

```
POST /api/chat
  → initRun() creates state
  → returns runId

GET /api/stream/:runId
  → runPlanning() yields events
  → writes plan.md
  → phase → awaiting_approval

POST /api/continue/:runId
  → approveRun() transitions phase
  → runResearch() yields events
  → local-runner executes SDK
```

## Adding New Tools

1. Create MCP tool definition in `src/tools/`
2. Add to `allowedTools` in `local-runner.ts`
3. Update status map for UI feedback

## SDK Patterns

```typescript
// Streaming with hooks
for await (const msg of query({
  prompt: generatePrompt(),
  options: {
    systemPrompt: PROMPT,
    mcpServers: { 'tool-name': toolDefinition },
    allowedTools: ['mcp__tool-name__action'],
    hooks: createStreamingHooks(emit),
  },
})) {
  // Process msg.type: 'stream_event', 'assistant', 'system'
}
```
