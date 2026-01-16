/**
 * Orchestrator — Two-Phase Research Agent
 *
 * Phase 1: Planning - Create research plan
 * Phase 2: Research - Execute plan via local or sandbox runner
 *
 * Persists session state to Convex for resumption.
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getSession, upsertSession, updateSessionPhase, getUploads, type UploadFile } from '../lib/convex.js';
import { createStreamingHooks } from './hooks.js';
import { applyProviderConfig, type ProviderId } from '../lib/providers.js';
import type { SandboxProvider } from './sandboxes/types.js';

// =============================================================================
// Types
// =============================================================================

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

export type Phase = 'planning' | 'awaiting_approval' | 'researching' | 'done';

type RunState = {
    phase: Phase;
    mode: 'local' | 'sandbox';
    provider?: SandboxProvider;  // Only used when mode='sandbox'
    prompt: string;
    plan?: string;
    sdkSessionId?: string;
    // LLM provider/model selection
    providerId?: ProviderId;
    modelId?: string;
    // Uploaded files for context
    uploads?: UploadFile[];
};

// In-memory state (backed by Convex)
const runs = new Map<string, RunState>();

// AbortControllers for active runs (enables stop functionality)
const abortControllers = new Map<string, AbortController>();

// Planner prompt - concise planning
const PLANNER_PROMPT = `You are a research planner. Create a brief plan for the research task.

1. Write a plan to "plan.md" with:
   - Topic (1 line)
   - Goal (1 line)
   - 3-5 search queries to use

2. Say "Ready. Click Approve to start research."

Be concise. Stop after writing the plan.`;

/**
 * Format uploaded files as context for the agent
 */
function formatFileContext(uploads: UploadFile[]): string {
    if (!uploads || uploads.length === 0) return '';

    const fileList = uploads.map(f => `- ${f.fileName} (${f.fileType}, ${(f.fileSize / 1024).toFixed(1)}KB) at ${f.storagePath}`).join('\n');

    return `\n\n## Uploaded Files
The user has uploaded the following files that you can reference:
${fileList}

You can read these files using the Read tool if they are relevant to the task.`;
}

// =============================================================================
// Run Management
// =============================================================================

/**
 * Initialize a new run
 */
export async function initRun(
    runId: string,
    prompt: string,
    mode: 'local' | 'sandbox' = 'local',
    provider?: SandboxProvider,
    providerId?: ProviderId,
    modelId?: string
): Promise<RunState> {
    // Apply LLM provider config if specified
    if (providerId) {
        applyProviderConfig(providerId);
        console.log(`[orchestrator] Using LLM provider: ${providerId}, model: ${modelId || 'default'}`);
    }

    // Fetch uploaded files for this thread
    const uploads = await getUploads(runId);
    if (uploads.length > 0) {
        console.log(`[orchestrator] Found ${uploads.length} uploaded files for thread ${runId}`);
    }

    // Check for existing session in Convex
    const existing = await getSession(runId);

    if (existing && existing.phase) {
        if (existing.phase !== 'done') {
            // Resume in-progress session
            const state: RunState = {
                phase: existing.phase as Phase,
                mode: (existing.mode as 'local' | 'sandbox') || mode,
                provider: existing.provider as SandboxProvider | undefined,
                prompt,
                plan: existing.plan,
                sdkSessionId: existing.sdkSessionId,
                providerId,
                modelId,
                uploads,
            };
            runs.set(runId, state);
            console.log(`[orchestrator] Resuming in-progress session: phase=${state.phase}, plan=${!!state.plan}`);
            return state;
        } else {
            // Session is done - start new planning phase but KEEP the session ID for context continuity
            const state: RunState = {
                phase: 'planning',
                mode: (existing.mode as 'local' | 'sandbox') || mode,
                provider: existing.provider as SandboxProvider | undefined,
                prompt,
                plan: undefined, // Clear plan for new research
                sdkSessionId: existing.sdkSessionId, // KEEP session ID for conversation context!
                providerId,
                modelId,
                uploads,
            };
            runs.set(runId, state);
            console.log(`[orchestrator] Continuing after done - resuming session: ${existing.sdkSessionId}`);
            return state;
        }
    }

    // Create new run (fresh start - no existing session)
    const state: RunState = { phase: 'planning', mode, provider, prompt, providerId, modelId, uploads };
    runs.set(runId, state);
    console.log(`[orchestrator] New run: phase=${state.phase}`);
    return state;
}

/**
 * Get run state
 */
export function getRunState(runId: string): RunState | undefined {
    return runs.get(runId);
}

/**
 * Approve run and transition to research phase
 */
export async function approveRun(runId: string, plan?: string): Promise<boolean> {
    const state = runs.get(runId);
    if (!state || state.phase !== 'awaiting_approval') return false;

    state.phase = 'researching';
    if (plan) state.plan = plan;

    await updateSessionPhase(runId, 'researching', plan);
    return true;
}

/**
 * Abort an active run
 */
export function abortRun(runId: string): boolean {
    const controller = abortControllers.get(runId);
    if (controller) {
        controller.abort();
        abortControllers.delete(runId);

        // Update state
        const state = runs.get(runId);
        if (state) {
            state.phase = 'done';
            updateSessionPhase(runId, 'done').catch(() => { });
        }
        return true;
    }
    return false;
}

// =============================================================================
// Phase 1: Planning
// =============================================================================

export async function* runPlanning(runId: string): AsyncGenerator<StreamEvent> {
    const state = runs.get(runId);
    if (!state) {
        yield { type: 'error', content: 'Run not found' };
        return;
    }

    if (state.phase !== 'planning') {
        yield { type: 'error', content: `Invalid phase: ${state.phase}` };
        return;
    }

    const pendingEvents: StreamEvent[] = [];
    const hooks = createStreamingHooks((e) => pendingEvents.push(e));

    // Create AbortController for this run
    const abortController = new AbortController();
    abortControllers.set(runId, abortController);

    let planContent = '';
    let capturedSessionId: string | undefined;

    try {
        // Use selected model or default to sonnet
        const model = state.modelId || 'sonnet';

        // Build system prompt with file context if uploads exist
        const fileContext = formatFileContext(state.uploads || []);
        const systemPrompt = PLANNER_PROMPT + fileContext;

        // Build query options
        const queryOptions: any = {
            systemPrompt,
            allowedTools: ['Write', 'Read'],
            maxTurns: 5,
            model,
            cwd: './workspace',
            includePartialMessages: true,
            hooks,
            abortController,
        };

        // Resume session if we have a session ID (for conversation continuity)
        if (state.sdkSessionId) {
            queryOptions.resume = state.sdkSessionId;
            console.log(`[orchestrator] Resuming planning session: ${state.sdkSessionId}`);
        }

        for await (const msg of query({
            prompt: state.prompt,
            options: queryOptions,
        })) {
            // Capture session ID
            if (msg.type === 'system' && (msg as any).subtype === 'init') {
                capturedSessionId = (msg as any).session_id;
            }

            // Stream tokens
            if (msg.type === 'stream_event') {
                const event = (msg as any).event;
                if (event?.type === 'content_block_delta' && event.delta?.text) {
                    yield { type: 'text', content: event.delta.text };
                }
                continue;
            }

            // Extract tool calls
            const events = extractToolEvents(msg);
            for (const event of events) {
                if (event.type === 'tool' && event.data) {
                    const { name, input } = event.data as { name: string; input: { file_path?: string; content?: string } };
                    if (name === 'Write' && input.file_path?.includes('plan')) {
                        planContent = input.content || '';
                    }
                }
                yield event;
            }

            // Flush pending hook events
            while (pendingEvents.length > 0) {
                yield pendingEvents.shift()!;
            }
        }
    } catch (error) {
        // Check if aborted by user
        if (abortController.signal.aborted) {
            yield { type: 'stopped', content: 'Stopped by user' };
            return;
        }
        yield { type: 'error', content: String(error) };
        return;
    } finally {
        abortControllers.delete(runId);
    }

    // Update state and persist
    if (planContent) {
        state.plan = planContent;
        state.phase = 'awaiting_approval';
        state.sdkSessionId = capturedSessionId;

        await upsertSession({
            threadId: runId,
            sdkSessionId: capturedSessionId || runId,
            phase: 'awaiting_approval',
            plan: planContent,
            mode: state.mode,
        });

        yield {
            type: 'artifact',
            content: JSON.stringify({
                type: 'plan',
                title: 'Research Plan',
                content: planContent,
                editable: true,
            }),
        };
    }

    yield { type: 'done', content: 'awaiting_approval' };
}

// =============================================================================
// Phase 2: Research
// =============================================================================

export async function* runResearch(runId: string): AsyncGenerator<StreamEvent> {
    const state = runs.get(runId);
    if (!state) {
        yield { type: 'error', content: 'Run not found' };
        return;
    }

    if (state.phase !== 'researching') {
        yield { type: 'error', content: `Invalid phase: ${state.phase}` };
        return;
    }

    // Build task with file context if uploads exist
    const fileContext = formatFileContext(state.uploads || []);
    const task = `Research: ${state.prompt}\n\nPlan:\n${state.plan || 'No plan provided'}${fileContext}`;

    // Route to appropriate runner
    // Create AbortController for this run
    const abortController = new AbortController();
    abortControllers.set(runId, abortController);

    try {
        if (state.mode === 'local') {
            const { runLocal } = await import('./local-runner.js');
            yield* runLocal({
                threadId: runId,
                task,
                mode: state.mode,
                sdkSessionId: state.sdkSessionId,
                abortController,
            });
        } else {
            // Use sandbox registry to route to correct provider
            const { runSandbox } = await import('./sandboxes/index.js');
            yield* runSandbox(state.provider || 'e2b', {
                threadId: runId,
                task,
                abortController,
            });
        }
    } finally {
        abortControllers.delete(runId);
    }

    state.phase = 'done';
    await updateSessionPhase(runId, 'done');
}

// =============================================================================
// Helpers
// =============================================================================

function extractToolEvents(msg: SDKMessage): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
            if ('name' in block && 'input' in block) {
                events.push({
                    type: 'tool',
                    content: block.name as string,
                    data: { name: block.name, input: block.input },
                });
            }
        }
    }

    return events;
}
