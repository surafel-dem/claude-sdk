/**
 * Hybrid Sandbox Architecture
 *
 * See: docs/architecture/07-hybrid-architecture.md
 * See: docs/architecture/Hybrid-Architecture.png
 *
 * Based on Manus AI patterns:
 * - Orchestration Layer: Direct LLM (fast, no sandbox)
 * - E2B Sandbox: Research/execution agents (when needed)
 * - Server-Managed Workspace: Files synced between local and sandbox
 *
 * Flow:
 * 1. User → Orchestrator (instant, creates plan.md locally)
 * 2. Server uploads plan.md to sandbox
 * 3. Researcher executes (streams updates in real-time)
 * 4. Server downloads report.md from sandbox
 * 5. Orchestrator → Summary to user
 */

import Anthropic from '@anthropic-ai/sdk';
import { Sandbox } from 'e2b';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { ORCHESTRATOR_PROMPT } from '../prompts/orchestrator.js';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';
import { researcher } from '../agents/researcher.js';

// Configuration
const LOCAL_WORKSPACE = './workspace';
const E2B_WORKSPACE = '/home/user/workspace';

// Store sandbox IDs for session persistence
const sandboxStore = new Map<string, string>();

// Anthropic client for direct LLM calls
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: process.env.ANTHROPIC_BASE_URL,
});

// Helper: Logging
function log(tag: string, message: string, data?: Record<string, unknown>) {
    console.log(`[${tag}] ${message}`, data ? JSON.stringify(data) : '');
}

// Helper: Write to local workspace
function writeLocalFile(filename: string, content: string) {
    mkdirSync(LOCAL_WORKSPACE, { recursive: true });
    writeFileSync(`${LOCAL_WORKSPACE}/${filename}`, content, 'utf-8');
    log('Workspace', `Wrote ${filename}`);
}

// Helper: Read from local workspace
function readLocalFile(filename: string): string | null {
    const path = `${LOCAL_WORKSPACE}/${filename}`;
    if (existsSync(path)) {
        return readFileSync(path, 'utf-8');
    }
    return null;
}

/**
 * Chat Mode: Direct LLM, no sandbox
 * For quick Q&A, brainstorming
 */
export async function* chatMode(
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AsyncGenerator<{ type: string; content: string }> {
    log('Chat', 'Direct LLM (no sandbox)');

    const stream = anthropic.messages.stream({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: 'You are a helpful AI assistant. Provide clear, concise answers.',
        messages: [
            ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user' as const, content: prompt }
        ],
    });

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'delta' in event && 'text' in event.delta) {
            yield { type: 'text', content: event.delta.text };
        }
    }
}

/**
 * Orchestrator: Direct LLM for planning
 * Detects when research/execution is needed
 * Parses plan and writes to local workspace
 */
export async function* orchestratorChat(
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AsyncGenerator<{ type: string; content: string; plan?: string }> {
    mkdirSync(LOCAL_WORKSPACE, { recursive: true });
    log('Orchestrator', 'Direct LLM call');

    const stream = anthropic.messages.stream({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: ORCHESTRATOR_PROMPT,
        messages: [
            ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user' as const, content: prompt }
        ],
    });

    let response = '';
    let needsResearch = false;

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'delta' in event && 'text' in event.delta) {
            const text = event.delta.text;
            response += text;
            yield { type: 'text', content: text };

            // Detect research trigger
            if (!needsResearch && response.includes('[EXECUTE_RESEARCH]')) {
                needsResearch = true;
            }
        }
    }

    // Extract and save plan if present
    const planMatch = response.match(/## Research:[^\n]*[\s\S]*?(?=Ready to research|Ready to proceed|$)/);
    if (planMatch) {
        const planContent = planMatch[0].trim();
        writeLocalFile('plan.md', planContent);

        // Emit plan as artifact so it shows in UI with approval button
        yield {
            type: 'artifact',
            content: JSON.stringify({
                id: 'plan-' + Date.now(),
                type: 'plan',
                title: 'Research Plan',
                content: planContent,
                editable: true,  // This enables the approval button!
            })
        };
    }

    // Extract research task
    const taskMatch = response.match(/RESEARCH_TASK:\s*(.+?)(?:\n|$)/);
    if (taskMatch) {
        writeLocalFile('task.md', taskMatch[1].trim());
    }

    if (needsResearch) {
        yield { type: 'needs_sandbox', content: 'Research required' };
    }

    yield { type: 'done', content: response };
}

// Message queue for streaming from sandbox
type MessageQueue = {
    messages: SDKMessage[];
    done: boolean;
    error?: Error;
};

/**
 * Researcher: E2B Sandbox for execution
 * Streams updates in real-time (not batched)
 * Syncs files with local workspace
 */
export async function* researcherExecute(
    task: string,
    sessionId?: string
): AsyncGenerator<{ type: string; content: string; data?: unknown }> {
    // Resume or create sandbox
    let sandbox: Sandbox;
    let needsSetup = false;

    if (sessionId && sandboxStore.has(sessionId)) {
        try {
            sandbox = await Sandbox.connect(sandboxStore.get(sessionId)!, {
                timeoutMs: 10 * 60 * 1000,
            });
            log('Researcher', 'Resumed sandbox', { id: sandbox.sandboxId });
        } catch {
            log('Researcher', 'Resume failed, creating new');
            const result = await createSandbox();
            sandbox = result.sandbox;
            needsSetup = result.needsSetup;
        }
    } else {
        const result = await createSandbox();
        sandbox = result.sandbox;
        needsSetup = result.needsSetup;
    }

    try {
        if (needsSetup) {
            yield { type: 'status', content: 'Setting up sandbox...' };
            await setupSandbox(sandbox);
        }

        // Create workspace in sandbox
        await sandbox.commands.run(`mkdir -p ${E2B_WORKSPACE}`);

        // Upload plan.md if exists locally
        const plan = readLocalFile('plan.md');
        if (plan) {
            await sandbox.files.write(`${E2B_WORKSPACE}/plan.md`, plan);
            yield { type: 'status', content: 'Uploaded research plan to sandbox' };
        }

        // Upload task.md if exists
        const taskContent = readLocalFile('task.md');
        if (taskContent) {
            await sandbox.files.write(`${E2B_WORKSPACE}/task.md`, taskContent);
        }

        log('Researcher', 'Executing in sandbox');
        yield { type: 'status', content: 'Starting research agent...' };

        // Run agent script with real-time streaming
        const script = generateScript(task);
        await sandbox.files.write('/home/user/agent.mjs', script);

        // Use a promise-based approach to stream messages
        const queue: MessageQueue = { messages: [], done: false };

        // Start the command (don't await - it runs in background)
        const commandPromise = sandbox.commands.run('node /home/user/agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                try {
                    const msg = JSON.parse(line) as SDKMessage;
                    queue.messages.push(msg);
                } catch {
                    if (line.trim()) {
                        log('stdout', line);
                    }
                }
            },
            onStderr: (line) => {
                if (line.trim()) console.error('[stderr]', line);
            },
        }).then(() => {
            queue.done = true;
        }).catch((err) => {
            queue.error = err;
            queue.done = true;
        });

        // Poll and yield messages as they arrive
        let processedCount = 0;
        while (!queue.done || processedCount < queue.messages.length) {
            // Process any new messages
            while (processedCount < queue.messages.length) {
                const msg = queue.messages[processedCount];
                processedCount++;

                if (msg.type === 'assistant' && msg.message?.content) {
                    for (const block of msg.message.content) {
                        if ('text' in block) {
                            yield { type: 'researcher_text', content: block.text };
                        } else if ('name' in block) {
                            yield {
                                type: 'tool',
                                content: block.name,
                                data: { name: block.name, input: block.input }
                            };
                        }
                    }
                } else if (msg.type === 'result') {
                    yield {
                        type: 'result',
                        content: 'Research complete',
                        data: { cost: (msg as { total_cost_usd?: number }).total_cost_usd }
                    };
                }
            }

            // Wait a bit before checking again
            if (!queue.done) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Wait for command to fully complete
        await commandPromise;

        // Check for errors
        if (queue.error) {
            throw queue.error;
        }

        // Download report.md if it was created
        try {
            const report = await sandbox.files.read(`${E2B_WORKSPACE}/report.md`);
            writeLocalFile('report.md', report);
            log('Researcher', 'Downloaded report.md');

            // Emit report as artifact so it shows in UI
            yield {
                type: 'artifact',
                content: JSON.stringify({
                    id: 'report-' + Date.now(),
                    type: 'report',
                    title: 'Research Report',
                    content: report,
                    editable: false,
                })
            };
        } catch {
            log('Researcher', 'No report.md found in sandbox');
        }

        // Pause sandbox for reuse
        try {
            await Sandbox.betaPause(sandbox.sandboxId);
            if (sessionId) sandboxStore.set(sessionId, sandbox.sandboxId);
            log('Researcher', 'Sandbox paused', { id: sandbox.sandboxId });
        } catch {
            await Sandbox.kill(sandbox.sandboxId);
        }

    } catch (error) {
        log('Researcher', 'Error', { error: String(error) });
        yield { type: 'error', content: String(error) };
        await Sandbox.kill(sandbox.sandboxId);
        throw error;
    }
}

/**
 * Hybrid Agent: Orchestrator + Researcher
 * Fast planning, sandbox only when needed
 * Real-time streaming throughout
 */
export async function* hybridAgent(
    prompt: string,
    sessionId?: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AsyncGenerator<{ type: string; content: string; data?: unknown }> {
    // Phase 1: Orchestrator (fast, no sandbox)
    log('Hybrid', 'Phase 1: Orchestrator');
    // Only show status when research is actually triggered (not for simple chats)

    let orchestratorResponse = '';
    let needsSandbox = false;
    let researchTask = '';

    for await (const event of orchestratorChat(prompt, history)) {
        if (event.type === 'text') {
            yield { type: 'orchestrator_text', content: event.content };
            orchestratorResponse += event.content;
        } else if (event.type === 'artifact') {
            // Forward artifact events (plan) to frontend
            yield { type: 'artifact', content: event.content };
        } else if (event.type === 'needs_sandbox') {
            needsSandbox = true;
            // Extract research task
            const taskMatch = orchestratorResponse.match(/RESEARCH_TASK:\s*(.+?)(?:\n|$)/);
            researchTask = taskMatch ? taskMatch[1] : prompt;
            yield { type: 'status', content: 'Starting research...' };
        }
    }

    // Phase 2: Researcher (only if needed)
    if (needsSandbox) {
        log('Hybrid', 'Phase 2: Researcher');

        for await (const event of researcherExecute(researchTask, sessionId)) {
            yield event;
        }

        // Phase 3: Orchestrator summarizes
        log('Hybrid', 'Phase 3: Summary');
        yield { type: 'status', content: 'Generating summary...' };

        // Read report if available
        const report = readLocalFile('report.md');
        const summaryPrompt = report
            ? `The research is complete. Here's the report:\n\n${report}\n\nPlease provide a brief summary of the key findings.`
            : 'The research is complete. Please summarize what was found.';

        for await (const event of orchestratorChat(
            summaryPrompt,
            [...history, { role: 'user', content: prompt }, { role: 'assistant', content: orchestratorResponse }]
        )) {
            if (event.type === 'text') {
                yield { type: 'summary_text', content: event.content };
            }
        }
    }

    yield { type: 'done', content: 'Complete' };
}

// === Helpers ===

// Custom template alias (built via: npm run build:template)
const TEMPLATE_ALIAS = 'research-agent-v2';

/**
 * Create sandbox using custom template (instant) or base template (slow).
 * Custom template has SDK pre-installed, no setup needed.
 */
async function createSandbox(): Promise<{ sandbox: Sandbox; needsSetup: boolean }> {
    const envs = {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
    };

    // Try custom template first (fast - SDK already installed)
    try {
        log('Sandbox', `Creating from template: ${TEMPLATE_ALIAS}`);
        const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });
        log('Sandbox', 'Created from template (instant)', { id: sandbox.sandboxId });
        return { sandbox, needsSetup: false };
    } catch {
        // Fallback to base template (slow - need to install SDK)
        log('Sandbox', `Template '${TEMPLATE_ALIAS}' not found, using base template`);
        log('Sandbox', 'TIP: Run "npm run build:template" to create template');

        const sandbox = await Sandbox.betaCreate({
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });
        log('Sandbox', 'Created from base', { id: sandbox.sandboxId });
        return { sandbox, needsSetup: true };
    }
}

/**
 * Setup sandbox (only needed for base template without SDK pre-installed).
 */
async function setupSandbox(sandbox: Sandbox): Promise<void> {
    log('Sandbox', 'Setting up workspace...');
    await sandbox.commands.run(`mkdir -p ${E2B_WORKSPACE}`);

    log('Sandbox', 'Installing SDK... (this takes ~30s, use custom template to skip)');
    await sandbox.commands.run('cd /home/user && npm init -y && npm install @anthropic-ai/claude-agent-sdk', { timeoutMs: 120000 });

    log('Sandbox', 'Setup complete');
}

/**
 * Generate agent script for execution in sandbox.
 * Minimal config for quick research.
 */
function generateScript(task: string): string {
    return `
import { query } from '@anthropic-ai/claude-agent-sdk';

const config = {
  systemPrompt: ${JSON.stringify(RESEARCHER_PROMPT)},
  allowedTools: ${JSON.stringify(researcher.tools)},
  maxTurns: 5,
  permissionMode: 'acceptEdits',
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  cwd: '${E2B_WORKSPACE}',
};

try {
  for await (const msg of query({
    prompt: ${JSON.stringify(task)},
    options: config,
  })) {
    console.log(JSON.stringify(msg));
  }
} catch (error) {
  console.error('[Error]', error.message || error);
  process.exit(1);
}
`;
}
