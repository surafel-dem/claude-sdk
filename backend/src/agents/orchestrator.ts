/**
 * SDK Orchestrator — Clean Two-Phase Implementation
 * 
 * Phase 1: Planning - Create plan, emit artifact, store for Phase 2
 * Phase 2: Research - Routes to local or sandbox runner based on mode
 * 
 * State is managed per-run, enabling clean phase transitions.
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';


// Run state management
interface RunState {
    phase: 'planning' | 'awaiting_approval' | 'researching' | 'done';
    mode: 'local' | 'sandbox';
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
export function initRun(runId: string, prompt: string, mode: 'local' | 'sandbox' = 'local'): void {
    runStates.set(runId, {
        phase: 'planning',
        mode,
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
 * Phase 2: Research — Routes to local or sandbox based on mode
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

    const task = `Research: ${state.originalPrompt}\n\nPlan:\n${state.plan || 'No plan provided'}`;
    console.log(`[orchestrator] Running in ${state.mode} mode`);

    // Route to appropriate runner
    if (state.mode === 'local') {
        const { runLocal } = await import('./local-runner.js');
        yield* runLocal(task, runId);  // Pass runId for session isolation
    } else {
        const { runSandbox } = await import('./sandbox-runner.js');
        yield* runSandbox(task);
    }

    state.phase = 'done';
}

/**
 * Translate SDK message to stream events
 */
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
