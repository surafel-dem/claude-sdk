# Multi-Agent Orchestration

## Agent Architecture

The system uses two agents with distinct roles:

| Agent | Role | Execution | Tools |
|-------|------|-----------|-------|
| **Orchestrator** | Planning, approval, summarization | Direct LLM (fast) | None |
| **Researcher** | Execution, research | E2B Sandbox | WebSearch, WebFetch, Write |

## Orchestrator

The orchestrator handles user interaction and coordination without using a sandbox.

### Configuration

```typescript
// agents/orchestrator.ts
export const orchestratorConfig = {
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  systemPrompt: ORCHESTRATOR_PROMPT,
  maxTurns: 10,
  permissionMode: 'acceptEdits' as const,
  allowedTools: ['Task', 'TaskOutput', 'Write', 'Read'],
};
```

### Prompt

```typescript
// prompts/orchestrator.ts
export const ORCHESTRATOR_PROMPT = `
You are a research orchestrator. Your job is to:

1. Understand the user's research request
2. Create a RESEARCH_PLAN.md file with:
   - Research objectives
   - Key questions to answer
   - Sources to investigate
3. Ask for user approval before proceeding
4. Delegate research to the researcher agent
5. Summarize findings for the user

IMPORTANT: Always wait for user approval before delegating research.
`;
```

## Researcher

The researcher executes research tasks in an E2B sandbox with web access.

### Configuration

```typescript
// agents/researcher.ts
export const researcher = {
  description: 'Conducts web research and writes reports',
  prompt: RESEARCHER_PROMPT,
  tools: ['WebSearch', 'WebFetch', 'Write', 'Read'],
};
```

### Prompt

```typescript
// prompts/researcher.ts
export const RESEARCHER_PROMPT = `
You are a research agent. Your job is to:

1. Read the RESEARCH_PLAN.md to understand objectives
2. Search the web using WebSearch and WebFetch
3. Analyze and synthesize information
4. Write comprehensive report.md

Output format: Markdown with citations and sources.
`;
```

## Task Tool

The Claude Agent SDK's `Task` tool enables agent-to-agent delegation:

```typescript
// How orchestrator delegates to researcher
{
  name: 'Task',
  input: {
    subagent_type: 'researcher',
    prompt: 'Execute the research plan in RESEARCH_PLAN.md'
  }
}
```

## Hybrid Flow

```text
Phase 1: Orchestrator (No Sandbox)
┌─────────────────────────────────────┐
│  User: "Research AI agents"         │
│            │                        │
│            ▼                        │
│  Orchestrator: Creates plan.md     │
│  Orchestrator: "Do you approve?"   │
└─────────────────────────────────────┘

Phase 2: User Approval
┌─────────────────────────────────────┐
│  User: "Yes, proceed"              │
└─────────────────────────────────────┘

Phase 3: Researcher (E2B Sandbox)
┌─────────────────────────────────────┐
│  [E2B Sandbox Created]              │
│  Researcher: Reads plan             │
│  Researcher: WebSearch(...)         │
│  Researcher: WebFetch(...)          │
│  Researcher: Writes report.md       │
│  [E2B Sandbox Paused]               │
└─────────────────────────────────────┘

Phase 4: Orchestrator (No Sandbox)
┌─────────────────────────────────────┐
│  Orchestrator: Reads report         │
│  Orchestrator: Summarizes to user   │
└─────────────────────────────────────┘
```

## Implementation

### sandbox/hybrid.ts

```typescript
export async function* hybridAgent(prompt, sessionId, history) {
  // Phase 1: Orchestrator (direct LLM, fast)
  for await (const event of orchestratorChat(prompt, history)) {
    yield event;
    if (event.type === 'needs_sandbox') {
      // Phase 2: Researcher (E2B sandbox)
      for await (const msg of researcherExecute(task, sessionId)) {
        yield msg;
      }
    }
  }
  // Phase 3: Summarize
}
```

## Why Two Agents?

| Single Agent | Two Agents |
|--------------|------------|
| Slower (always sandbox) | Fast planning |
| Higher cost | Sandbox only when needed |
| Simple | Better separation of concerns |
| Monolithic | Modular, testable |
