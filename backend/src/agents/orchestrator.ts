/**
 * SDK Orchestrator — Clean Two-Phase Implementation
 * 
 * Phase 1: Planning - Create plan, emit artifact, store for Phase 2
 * Phase 2: Research - Runs in E2B sandbox after approval
 * 
 * State is managed per-run, enabling clean phase transitions.
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Sandbox } from '@e2b/code-interpreter';
import { getSandbox, setupSandbox, pause } from '../sandbox/sandbox-manager.js';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';

// Run state management
interface RunState {
    phase: 'planning' | 'awaiting_approval' | 'researching' | 'done';
    originalPrompt: string;
    plan?: string;
}

const runStates = new Map<string, RunState>();

// Simple planner prompt for testing
const PLANNER_PROMPT = `You are a quick research planner.

1. Write a 3-line plan to "plan.md": Topic, Goal, 2 search terms
2. Say "Ready. Click Approve."

Be VERY brief. Stop after writing plan.`;

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

/**
 * Initialize a run
 */
export function initRun(runId: string, prompt: string): void {
    runStates.set(runId, {
        phase: 'planning',
        originalPrompt: prompt,
    });
}

/**
 * Get run state
 */
export function getRunState(runId: string): RunState | undefined {
    return runStates.get(runId);
}

/**
 * Mark run as approved and store plan
 */
export function approveRun(runId: string, plan?: string): boolean {
    const state = runStates.get(runId);
    if (!state || state.phase !== 'awaiting_approval') {
        return false;
    }
    state.phase = 'researching';
    if (plan) state.plan = plan;
    return true;
}

/**
 * Phase 1: Planning
 */
export async function* runPlanning(runId: string): AsyncGenerator<StreamEvent> {
    const state = runStates.get(runId);
    if (!state) {
        yield { type: 'error', content: 'Run not found' };
        return;
    }

    if (state.phase !== 'planning') {
        yield { type: 'error', content: `Invalid phase: ${state.phase}` };
        return;
    }

    let planContent = '';

    for await (const msg of query({
        prompt: state.originalPrompt,
        options: {
            systemPrompt: PLANNER_PROMPT,
            allowedTools: ['Write'],
            maxTurns: 5,
            model: 'sonnet',
            cwd: './workspace',
        }
    })) {
        const events = translateMessage(msg);
        for (const event of events) {
            // Capture plan content from Write tool
            if (event.type === 'tool' && event.data) {
                const toolData = event.data as { name: string; input: { content?: string; file_path?: string } };
                if (toolData.name === 'Write' && String(toolData.input.file_path || '').includes('plan')) {
                    planContent = toolData.input.content || '';
                }
            }
            yield event;
        }
    }

    // Store plan and transition to awaiting approval
    if (planContent) {
        state.plan = planContent;
        state.phase = 'awaiting_approval';

        yield {
            type: 'artifact',
            content: JSON.stringify({
                type: 'plan',
                title: 'Research Plan',
                content: planContent,
                editable: true,
            })
        };
    }

    yield { type: 'done', content: 'awaiting_approval' };
}

/**
 * Phase 2: Research (E2B Sandbox)
 */
export async function* runResearch(runId: string): AsyncGenerator<StreamEvent> {
    const state = runStates.get(runId);
    if (!state) {
        yield { type: 'error', content: 'Run not found' };
        return;
    }

    if (state.phase !== 'researching') {
        yield { type: 'error', content: `Invalid phase: ${state.phase}` };
        return;
    }

    yield { type: 'status', content: 'Starting research in sandbox...' };

    let sandbox: Sandbox | null = null;
    try {
        const result = await getSandbox(runId);
        sandbox = result.sandbox;

        // Setup SDK if using base template (needsSetup = true)
        if (result.needsSetup) {
            yield { type: 'status', content: 'Installing research tools (~30s)...' };
            await setupSandbox(sandbox);
        }

        yield { type: 'phase', content: 'researcher' };

        // Run researcher in E2B
        const task = `Research: ${state.originalPrompt}\n\nPlan:\n${state.plan || 'No plan provided'}`;
        const script = generateResearcherScript(task);

        await sandbox.files.write('/home/user/agent.mjs', script);
        await sandbox.commands.run('mkdir -p /home/user/workspace');

        yield { type: 'status', content: 'Searching the web...' };

        // CRITICAL: Run from /home/user where node_modules exists
        await sandbox.commands.run('cd /home/user && node agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                try {
                    const msg = JSON.parse(line) as SDKMessage;
                    if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if ('name' in block) {
                                // Will be logged, but we can't yield from callback
                                console.log(`[researcher] Tool: ${block.name}`);
                            }
                        }
                    }
                } catch {
                    if (line.trim()) console.log('[sandbox]', line);
                }
            },
            onStderr: (line) => {
                if (line.trim()) console.error('[sandbox error]', line);
            }
        });

        // Find and read report (agent may write anywhere)
        try {
            console.log('[orchestrator] Searching for report.md...');
            const findResult = await sandbox.commands.run('find /home/user -name "report.md" 2>/dev/null | head -1');
            const reportPath = findResult.stdout.trim();

            if (reportPath) {
                console.log(`[orchestrator] Found report at: ${reportPath}`);
                const report = await sandbox.files.read(reportPath);
                console.log(`[orchestrator] Report read successfully (${report.length} chars)`);
                yield {
                    type: 'artifact',
                    content: JSON.stringify({
                        type: 'report',
                        title: 'Research Report',
                        content: report,
                    })
                };
                yield { type: 'text', content: report };
            } else {
                console.log('[orchestrator] No report.md found');
                yield { type: 'error', content: 'No report generated' };
            }
        } catch (err) {
            console.error('[orchestrator] Failed to read report:', err);
            yield { type: 'error', content: 'Failed to read report' };
        }

        state.phase = 'done';

    } finally {
        if (sandbox) {
            await pause(sandbox.sandboxId);
        }
    }

    yield { type: 'done', content: 'complete' };
}

/** Translate SDK message to stream events */
function translateMessage(msg: SDKMessage): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
            if ('text' in block) {
                events.push({ type: 'text', content: block.text });
            }
            if ('name' in block && 'input' in block) {
                events.push({
                    type: 'tool',
                    content: block.name,
                    data: { name: block.name, input: block.input }
                });
            }
        }
    }

    return events;
}

/** Generate researcher script for E2B */
function generateResearcherScript(task: string): string {
    return `
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const msg of query({
    prompt: ${JSON.stringify(task)},
    options: {
        systemPrompt: ${JSON.stringify(RESEARCHER_PROMPT)},
        allowedTools: ['WebSearch', 'Write'],
        maxTurns: 5,
        model: 'haiku',
        cwd: '/home/user/workspace',
        permissionMode: 'acceptEdits',
    }
})) {
    console.log(JSON.stringify(msg));
}
`;
}
