# Multi-Agent Research System: Agent SDK Migration Plan

## Overview

Refactor from direct LLM calls with string parsing to native Agent SDK multi-agent pattern with human-in-the-loop approval.

**Simplified Scope:**
- Lead Agent → Task tool only
- 2 Subagents: **Researcher** (web search), **Report Writer** (create reports)
- No data analyst for initial testing

## E2B Sandbox Integration (Critical)

Subagents run inside E2B sandboxes for isolation and web access. See [E2B Sandbox Docs](/docs/e2b/e2b-sandbox.md) and [E2B Template Docs](/docs/e2b/e2b-template.md).

### Current Pattern (to migrate FROM)

```typescript
// hybrid-v2.ts - generates script, runs via commands.run()
const script = generateAgentScript(task);
await sandbox.files.write('/home/user/agent.mjs', script);
const result = await sandbox.commands.run('node /home/user/agent.mjs');
```

### Target Pattern (SDK with E2B Sandbox)

```typescript
// Lead agent spawns Task → SDK creates E2B sandbox → runs subagent inside
const sandbox = await Sandbox.betaCreate('research-agent-sandbox', {
    autoPause: true,
    envs: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
});

// Run subagent in sandbox (SDK sandbox option)
const result = await query({
    prompt: task,
    options: {
        sandbox: { type: 'existing', sandboxId: sandbox.sandboxId },
        systemPrompt: RESEARCHER_PROMPT,
        allowedTools: ['WebSearch', 'Write']
    }
});
```

### E2B Template for Subagents

Pre-built template with Claude Agent SDK pre-installed:

```typescript
// Build once, use many times
const template = Template()
    .fromNodeImage('22')
    .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
    .setWorkdir('/home/user/workspace')
    .makeDir('/home/user/workspace');

await Template.build(template, {
    alias: 'research-agent-sandbox',
    cpuCount: 2,
    memoryMB: 1024,
});
```

### Sandbox Lifecycle for Subagents

```typescript
// Create with auto-pause (cost savings)
const sandbox = await Sandbox.betaCreate('research-agent-sandbox', {
    autoPause: true,
    envs: { ANTHROPIC_API_KEY: apiKey }
});

const sandboxId = sandbox.sandboxId;

// When subagent spawns, use existing sandbox or create new one
const subagentSandbox = sessionId && sandboxStore.has(sessionId)
    ? await Sandbox.connect(sandboxStore.get(sessionId))
    : await Sandbox.betaCreate('research-agent-sandbox', { autoPause: true });

// Pause after completion for reuse
await Sandbox.betaPause(subagentSandbox.sandboxId);
```

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Hono Server                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  POST /api/chat  │  GET /api/stream/:id                    │  │
│  │  POST /api/approval/:id (approve/reject)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              SDK Orchestrator Wrapper                      │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Lead Agent (query() with sandbox option)           │  │  │
│  │  │  - Task tool only                                   │  │  │
│  │  │  - Custom approval hook (PreToolUse)                │  │  │
│  │  │  - SubagentStop hook for tracking                   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                              │                              │  │
│  │              ┌───────────────┴───────────────┐             │  │
│  │              ▼                               ▼             │  │
│  │  ┌──────────────┐               ┌──────────────┐          │  │
│  │  │  Researcher  │               │Report Writer │          │  │
│  │  │ (E2B Sand.)  │               │ (E2B Sand.)  │          │  │
│  │  └──────┬───────┘               └──────┬───────┘          │  │
│  │         │ E2B Sandbox lifecycle         │                   │  │
│  │         │ - betaCreate(template)        │                   │  │
│  │         │ - betaPause(id)               │                   │  │
│  │         │ - connect(id)                 │                   │  │
│  └─────────┼───────────────────────────────┼───────────────────┘  │
│            │                               │                       │
│            └───────────┬───────────────────┘                       │
│                        ▼                                           │
│            ┌───────────────────────────┐                          │
│            │   E2B Sandbox Pool/Store  │                          │
│            │   (sessionId → sandboxId) │                          │
│            └───────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Core Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/agents/sdk-orchestrator.ts` | Create | Main SDK wrapper using `query()` |
| `backend/src/agents/subagents.ts` | Create | Subagent definitions (researcher, report-writer) |
| `backend/src/sandbox/sandbox-manager.ts` | Create | E2B sandbox pool, create/pause/connect |
| `backend/src/sandbox/template.ts` | Create | Custom template with SDK pre-installed |
| `backend/src/hooks/approval.ts` | Create | Custom PreToolUse hook for approval |
| `backend/src/hooks/subagent-tracker.ts` | Create | Subagent tracking via hooks |
| `convex/schema.ts` | Modify | Add approvalRequests table |
| `backend/src/server.ts` | Modify | Use new SDK orchestrator |
| `frontend/src/components/ApprovalBanner.tsx` | Create | Status banner |
| `frontend/src/components/ApprovalCard.tsx` | Create | Plan display with approve/edit |
| `frontend/src/hooks/useApproval.ts` | Create | Real-time subscription |

## SDK Wrapper Implementation

### Subagent Definitions (`backend/src/agents/subagents.ts`)

```typescript
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const researcherAgent: AgentDefinition = {
    description: "Use to gather research information from the web. Searches and writes findings.",
    tools: ["WebSearch", "Write"],
    prompt: `You are a research assistant. Search the web for information and write findings to files/research_notes/. Be thorough and cite sources.`,
    model: "haiku"
};

export const reportWriterAgent: AgentDefinition = {
    description: "Creates comprehensive reports from research notes.",
    tools: ["Read", "Write", "Glob"],
    prompt: `You are a report writer. Read research notes from files/research_notes/ and create a comprehensive report in files/reports/. Use markdown format with proper structure.`,
    model: "haiku"
};
```

### SDK Orchestrator (`backend/src/agents/sdk-orchestrator.ts`)

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { researcherAgent, reportWriterAgent } from "./subagents.js";
import { createApprovalHook } from "../hooks/approval.js";
import { createSubagentTracker } from "../hooks/subagent-tracker.js";

interface OrchestratorOptions {
    prompt: string;
    threadId: string;
    onApproval?: (decision: 'approved' | 'rejected', plan?: string) => void;
    onProgress?: (event: { type: string; data: any }) => void;
}

export async function* sdkOrchestrator({ prompt, threadId, onApproval, onProgress }: OrchestratorOptions) {
    const tracker = createSubagentTracker(onProgress);
    const approvalHook = createApprovalHook(threadId, onApproval);

    const options = {
        systemPrompt: `You are a lead research coordinator.

Your workflow:
1. Create a brief research plan (1-2 sentences goal, 1 search query)
2. Wait for user approval before proceeding
3. After approval, delegate to researcher subagent
4. After research completes, delegate to report-writer subagent

Rules:
- Only use Task tool to delegate - never research or write reports yourself
- Wait for approval before spawning researcher
- Keep plans concise`,
        allowedTools: ["Task"] as const,
        agents: {
            researcher: researcherAgent,
            "report-writer": reportWriterAgent
        },
        hooks: {
            PreToolUse: [{ hooks: [approvalHook] }],
            SubagentStop: [{ hooks: [tracker.subagentStopHook] }]
        }
    };

    for await (const message of query({ prompt, options })) {
        yield message;
    }
}
```

## Approval Hook Pattern

The key insight: we intercept the `Task` tool call when the lead agent tries to spawn the researcher, pause execution, wait for user approval, then either allow or deny.

```typescript
// backend/src/hooks/approval.ts
import { HookCallback } from "@anthropic-ai/claude-agent-sdk";

interface ApprovalRequest {
    id: string;
    threadId: string;
    planContent: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
}

// In-memory waiters (replace with Convex/pub-sub in production)
const approvalWaiters = new Map<string, {
    resolve: (result: { decision: 'approved' | 'rejected'; plan?: string }) => void
}>();

export function createApprovalHook(
    threadId: string,
    onApproval?: (decision: 'approved' | 'rejected', plan?: string) => void
): HookCallback {
    return async (input, toolUseId, { signal }) => {
        // Check if agent is trying to spawn researcher
        if (input.tool_name === 'Task' &&
            input.tool_input?.subagent_type === 'researcher') {

            // Extract or generate plan content from the task prompt
            const planContent = extractPlanFromPrompt(input.tool_input.prompt);

            // Notify external system (Convex, SSE, etc.)
            onApproval?.('pending', planContent);

            // Create approval request
            const approvalId = crypto.randomUUID();

            // Wait for user decision
            const result = await new Promise<{ decision: 'approved' | 'rejected'; plan?: string }>((resolve) => {
                approvalWaiters.set(approvalId, { resolve });

                // Timeout after 10 minutes
                setTimeout(() => {
                    approvalWaiters.delete(approvalId);
                    resolve({ decision: 'rejected', plan: 'timeout' });
                }, 10 * 60 * 1000);
            });

            approvalWaiters.delete(approvalId);

            if (result.decision === 'rejected') {
                return {
                    hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: 'deny',
                        permissionDecisionReason: 'User rejected the research plan'
                    }
                };
            }

            // Approved - continue with (possibly modified) plan
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                    updatedInput: {
                        ...input.tool_input,
                        prompt: result.plan || input.tool_input.prompt
                    }
                }
            };
        }
        return {};
    };
}

// Called by API endpoint when user clicks Approve/Reject
export function resolveApproval(id: string, result: { decision: 'approved' | 'rejected'; plan?: string }) {
    const waiter = approvalWaiters.get(id);
    if (waiter) {
        waiter.resolve(result);
    }
}

function extractPlanFromPrompt(prompt: string): string {
    // Simple extraction - in production, the lead agent should output structured plan
    return prompt;
}
```

## Subagent Tracking Hook

```typescript
// backend/src/hooks/subagent-tracker.ts
import { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export function createSubagentTracker(
    onProgress?: (event: { type: string; data: any }) => void
) {
    return {
        subagentStopHook: (async (input, toolUseId, { signal }) => {
            onProgress?.({
                type: 'subagent_stop',
                data: {
                    agentType: input.agent_type,
                    toolUseId,
                    completed: true
                }
            });
            return {};
        }) as HookCallback
    };
}
```

## Convex Schema

```typescript
// convex/schema.ts
defineSchema({
    approvalRequests: defineTable({
        threadId: v.string(),
        planContent: v.string(),
        status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
        createdAt: v.number(),
        resolvedAt: v.optional(v.number()),
    }),
    toolCalls: defineTable({
        threadId: v.string(),
        agentId: v.string(),
        agentType: v.string(),
        toolName: v.string(),
        input: v.any(),
        timestamp: v.number(),
    }),
})
```

## Frontend Components

### ApprovalBanner

```tsx
// frontend/src/components/ApprovalBanner.tsx
interface ApprovalBannerProps {
    plan: string;
    onApprove: () => void;
    onReview: () => void;
    onReject: () => void;
}

export function ApprovalBanner({ plan, onApprove, onReview, onReject }: ApprovalBannerProps) {
    return (
        <div className="approval-banner">
            <div className="approval-status">
                <span className="spinner">⏳</span>
                <span>Waiting for your approval...</span>
            </div>
            <div className="approval-actions">
                <button className="btn-primary" onClick={onApprove}>Approve</button>
                <button className="btn-secondary" onClick={onReview}>Review & Edit</button>
                <button className="btn-ghost" onClick={onReject}>Cancel</button>
            </div>
        </div>
    );
}
```

## E2B Sandbox Manager

```typescript
// backend/src/sandbox/sandbox-manager.ts
import { Sandbox } from '@e2b/code-interpreter';

const TEMPLATE_ALIAS = 'research-agent-sandbox';
const sandboxStore = new Map<string, string>(); // sessionId -> sandboxId

interface SandboxSession {
    sandbox: Sandbox;
    sessionId: string;
    createdAt: number;
}

export class SandboxManager {
    /** Get or create sandbox for a session */
    async getSandbox(sessionId?: string): Promise<{ sandbox: Sandbox; sessionId: string; isNew: boolean }> {
        // Try to resume existing session
        if (sessionId && sandboxStore.has(sessionId)) {
            const sandboxId = sandboxStore.get(sessionId)!;
            try {
                const sandbox = await Sandbox.connect(sandboxId, { timeoutMs: 60_000 });
                return { sandbox, sessionId, isNew: false };
            } catch {
                sandboxStore.delete(sessionId); // Failed to resume, create new
            }
        }

        // Create new sandbox
        const newSessionId = sessionId || crypto.randomUUID();
        const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
            autoPause: true,
            envs: {
                ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
                ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            },
        });

        sandboxStore.set(newSessionId, sandbox.sandboxId);
        return { sandbox, sessionId: newSessionId, isNew: true };
    }

    /** Pause sandbox for reuse */
    async pause(sandboxId: string): Promise<void> {
        try {
            await Sandbox.betaPause(sandboxId);
        } catch {
            await Sandbox.kill(sandboxId).catch(() => {});
        }
    }

    /** Clean up expired sessions */
    cleanup(maxAgeMs: number = 30 * 60 * 1000): void {
        const now = Date.now();
        for (const [sessionId, sandboxId] of sandboxStore.entries()) {
            // In production, track creation time and clean up old sessions
            if (now - (this.getSessionAge(sessionId) || 0) > maxAgeMs) {
                Sandbox.kill(sandboxId).catch(() => {});
                sandboxStore.delete(sessionId);
            }
        }
    }

    private sessionAge = new Map<string, number>();

    private getSessionAge(sessionId: string): number | undefined {
        return this.sessionAge.get(sessionId);
    }
}

export const sandboxManager = new SandboxManager();
```

## E2B Template Definition

```typescript
// backend/src/sandbox/template.ts
import { Template } from 'e2b';

export async function buildResearchAgentTemplate(): Promise<void> {
    const template = Template()
        .fromNodeImage('22')
        .setWorkdir('/home/user')
        .makeDir('/home/user/workspace')
        .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
        .setEnvs({
            NODE_PATH: '/usr/local/lib/node_modules',
            PATH: '/home/user/.local/bin:$PATH',
        });

    await Template.build(template, {
        alias: 'research-agent-sandbox',
        cpuCount: 2,
        memoryMB: 1024,
    });

    console.log('✅ Template built: research-agent-sandbox');
}

// Usage: Run once to build the template
// npx tsx backend/src/sandbox/template.ts
```

## Migration Steps

1. **Build E2B template** (`backend/src/sandbox/template.ts`)
   - Pre-install Node.js 22 + Claude Agent SDK
   - Run once: `npx tsx backend/src/sandbox/template.ts`

2. **Create sandbox manager** (`backend/src/sandbox/sandbox-manager.ts`)
   - Pool of sandboxes with pause/resume
   - Session-based persistence

3. **Create subagent definitions** (`backend/src/agents/subagents.ts`)
   - Researcher: WebSearch + Write
   - Report Writer: Read + Write + Glob

4. **Create approval hook** (`backend/src/hooks/approval.ts`)
   - Intercept Task(researcher) calls
   - Wait for user approval via Promise

5. **Create SDK orchestrator** (`backend/src/agents/sdk-orchestrator.ts`)
   - Use `query()` with sandbox option
   - Connect subagents to E2B sandboxes

6. **Update Convex schema** with approvalRequests table

7. **Update Hono server** to use new orchestrator

8. **Create frontend components** (ApprovalBanner, ApprovalCard)

9. **Test end-to-end flow**

## Keep Intact

- Hono server structure
- Convex database (new tables only)
- Frontend UI (add approval components)
- E2B sandbox SDK patterns (Template, Sandbox.* static methods)
- Environment configuration
