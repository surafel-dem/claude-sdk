/**
 * Hybrid Agent v2 - Claude.ai Style Artifacts
 * 
 * Clean implementation with:
 * - Inline artifact emission (like Claude.ai)
 * - Status updates during research
 * - Convex-first artifact storage
 * - No internal markers leaked to UI
 */

import Anthropic from '@anthropic-ai/sdk';
import { Sandbox } from '@e2b/code-interpreter';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { ORCHESTRATOR_PROMPT } from '../prompts/orchestrator.js';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';
import { researcher } from '../agents/researcher.js';

// === Types ===
interface StreamEvent {
    type: 'text' | 'artifact' | 'status' | 'tool' | 'done' | 'error';
    content: string;
    data?: unknown;  // Allow any data type
}

interface Artifact {
    id: string;
    type: 'plan';
    title: string;
    content: string;
    status: 'draft' | 'approved' | 'complete';
    editable?: boolean;
}

// === Config ===
const LOCAL_WORKSPACE = './workspace';
const E2B_WORKSPACE = '/home/user/workspace';
const TEMPLATE_ALIAS = 'research-agent-v2';

// Session storage for sandbox reuse
const sandboxStore = new Map<string, string>();

// Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: process.env.ANTHROPIC_BASE_URL,
});

// === Helpers ===
function log(tag: string, msg: string, data?: Record<string, unknown>) {
    console.log(`[${tag}] ${msg}`, data ? JSON.stringify(data) : '');
}

function writeLocal(filename: string, content: string) {
    mkdirSync(LOCAL_WORKSPACE, { recursive: true });
    writeFileSync(`${LOCAL_WORKSPACE}/${filename}`, content);
}

function readLocal(filename: string): string | null {
    try {
        return readFileSync(`${LOCAL_WORKSPACE}/${filename}`, 'utf-8');
    } catch { return null; }
}

// === Main Hybrid Agent v2 ===
export async function* hybridAgentV2(
    prompt: string,
    sessionId?: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): AsyncGenerator<StreamEvent> {
    log('Hybrid', 'Starting', { prompt: prompt.slice(0, 50) });

    // Phase 1: Orchestrator (fast, no sandbox)
    const orchestratorResult = yield* orchestratorPhase(prompt, history);

    // If research needed, continue to Phase 2
    if (orchestratorResult.needsResearch && orchestratorResult.task) {
        // Phase 2: Researcher (E2B sandbox)
        yield* researcherPhase(orchestratorResult.task, sessionId);
    }

    yield { type: 'done', content: 'Complete' };
}

// === Phase 1: Orchestrator ===
async function* orchestratorPhase(
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
): AsyncGenerator<StreamEvent, { needsResearch: boolean; task: string; response: string }> {
    log('Orchestrator', 'Phase 1: Planning');
    mkdirSync(LOCAL_WORKSPACE, { recursive: true });

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
    let planEmitted = false;
    let task = '';

    let yieldedResponse = '';

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'delta' in event && 'text' in event.delta) {
            const text = event.delta.text;
            response += text;

            // Don't yield ANYTHING if we are in the research trigger block
            const currentLineRange = response.substring(yieldedResponse.length);

            if (currentLineRange.includes('[EXECUTE_RESEARCH]') || currentLineRange.includes('RESEARCH_TASK:')) {
                needsResearch = true;
                const taskMatch = response.match(/RESEARCH_TASK:\s*(.+?)(?:\n|$)/);
                if (taskMatch) task = taskMatch[1].trim();
                continue; // Skip yielding this chunk
            }

            // Regular text yielding with extra precaution
            const cleanText = text
                .replace(/\[EXECUTE_RESEARCH\]/g, '')
                .replace(/RESEARCH_TASK:[^\n]*/g, '')
                .replace(/```\s*$/g, ''); // Don't leak the closing backticks if they are part of the trigger

            if (cleanText) {
                yield { type: 'text', content: cleanText };
                yieldedResponse += text;
            }

            // Emit plan artifact INLINE when we detect the pattern
            if (!planEmitted && response.includes('Ready to research')) {
                const planMatch = response.match(/## Research:[^\n]*[\s\S]*?(?=Ready to research|Ready to proceed)/);
                if (planMatch) {
                    const planContent = planMatch[0].trim();
                    writeLocal('plan.md', planContent);

                    const artifact: Artifact = {
                        id: `plan-${Date.now()}`,
                        type: 'plan',
                        title: 'Research Plan',
                        content: planContent,
                        status: 'draft',
                        editable: true,
                    };

                    yield {
                        type: 'artifact',
                        content: JSON.stringify(artifact),
                        data: artifact
                    };
                    planEmitted = true;
                    log('Orchestrator', 'Plan artifact emitted inline');
                }
            }
        }
    }

    return { needsResearch, task, response };
}

// === Phase 2: Researcher ===
async function* researcherPhase(
    task: string,
    sessionId?: string
): AsyncGenerator<StreamEvent> {
    log('Researcher', 'Phase 2: Executing research');
    yield { type: 'status', content: 'Preparing research environment...' };

    // Create or resume sandbox
    const { sandbox, needsSetup } = await getOrCreateSandbox(sessionId);

    try {
        if (needsSetup) {
            yield { type: 'status', content: 'Installing dependencies...' };
            await setupSandbox(sandbox);
        }

        // Prepare workspace
        await sandbox.commands.run(`mkdir -p ${E2B_WORKSPACE}`);

        // Upload plan if exists
        const plan = readLocal('plan.md');
        if (plan) {
            await sandbox.files.write(`${E2B_WORKSPACE}/plan.md`, plan);
        }

        yield { type: 'status', content: 'Searching the web...' };

        // Generate and run agent script
        const script = generateAgentScript(task);
        await sandbox.files.write('/home/user/agent.mjs', script);

        // Run with streaming - capture file paths written by the agent
        let reportContent = '';
        const writtenFiles: string[] = [];

        // Event queue for real-time status yielding
        const eventQueue: StreamEvent[] = [];
        let isAgentRunning = true;

        log('Researcher', 'Starting agent execution...');

        // Start agent execution in background so we can yield events
        const agentRunPromise = sandbox.commands.run('node /home/user/agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line: string) => {
                try {
                    const msg = JSON.parse(line);

                    // Capture tool calls from hooks for real-time updates
                    if (msg.type === 'tool_call') {
                        eventQueue.push({
                            type: 'tool',
                            content: msg.name,
                            data: { name: msg.name, input: msg.input }
                        });
                    }

                    // Capture file paths for report tracking
                    if (msg.type === 'file_written' && msg.path) {
                        writtenFiles.push(msg.path);
                    }

                    // Aggregated file summary
                    if (msg.type === 'files_summary' && msg.files) {
                        for (const f of msg.files) {
                            if (!writtenFiles.includes(f)) writtenFiles.push(f);
                        }
                    }
                } catch { /* ignore non-JSON */ }
            },
            onStderr: (line: string) => log('Researcher', `stderr: ${line}`),
        }).then(result => {
            isAgentRunning = false;
            return result;
        }).catch(err => {
            isAgentRunning = false;
            throw err;
        });

        // Loop to yield events while agent is running
        while (isAgentRunning || eventQueue.length > 0) {
            if (eventQueue.length > 0) {
                const event = eventQueue.shift();
                if (event) yield event;
            } else {
                // Short wait to avoid busy loop
                await new Promise(r => setTimeout(r, 100));
            }
        }

        const result = await agentRunPromise;
        log('Researcher', `Agent finished. Exit code: ${result.exitCode}`);

        // Try to find report.md ANYWHERE in the sandbox (including .claude directory)
        try {
            const findResult = await sandbox.commands.run('find /home/user -name "report.md" 2>/dev/null | head -1');
            const reportPath = findResult.stdout.trim();

            if (reportPath) {
                log('Researcher', `Found report at: ${reportPath}`);
                reportContent = await sandbox.files.read(reportPath);
                writeLocal('report.md', reportContent);
                log('Researcher', 'Report downloaded successfully');

                yield { type: 'status', content: 'Research complete!' };

                // Stream report content directly as text
                yield { type: 'text', content: '\n\n' };
                yield { type: 'text', content: reportContent };
                yield { type: 'text', content: '\n\n' };
            } else {
                log('Researcher', 'No report.md found anywhere in sandbox');
                yield { type: 'status', content: 'Research completed (no report generated)' };
            }
        } catch (findError) {
            log('Researcher', `Find command failed: ${findError}`);
            yield { type: 'status', content: 'Research completed (no report generated)' };
        }

        // Pause sandbox for reuse
        try {
            await Sandbox.betaPause(sandbox.sandboxId);
            if (sessionId) sandboxStore.set(sessionId, sandbox.sandboxId);
        } catch {
            await Sandbox.kill(sandbox.sandboxId).catch(() => { });
        }

    } catch (error) {
        log('Researcher', 'Error', { error: String(error) });
        yield { type: 'error', content: `Research failed: ${error}` };
        if (sandbox) await Sandbox.kill(sandbox.sandboxId).catch(() => { });
    }
}

// === Sandbox Helpers ===
async function getOrCreateSandbox(sessionId?: string): Promise<{ sandbox: Sandbox; needsSetup: boolean }> {
    const envs = {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    };

    // Try to resume existing sandbox
    if (sessionId && sandboxStore.has(sessionId)) {
        try {
            const sandbox = await Sandbox.connect(sandboxStore.get(sessionId)!, { timeoutMs: 10 * 60 * 1000 });
            log('Sandbox', 'Resumed', { id: sandbox.sandboxId });
            return { sandbox, needsSetup: false };
        } catch {
            log('Sandbox', 'Resume failed, creating new');
        }
    }

    // Create new sandbox
    try {
        const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });
        log('Sandbox', 'Created from template', { id: sandbox.sandboxId });
        return { sandbox, needsSetup: false };
    } catch {
        const sandbox = await Sandbox.betaCreate({
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });
        log('Sandbox', 'Created from base (needs setup)', { id: sandbox.sandboxId });
        return { sandbox, needsSetup: true };
    }
}

async function setupSandbox(sandbox: Sandbox): Promise<void> {
    log('Sandbox', 'Installing Claude Agent SDK...');
    await sandbox.commands.run('cd /home/user && npm init -y && npm install @anthropic-ai/claude-agent-sdk', { timeoutMs: 120000 });
    log('Sandbox', 'Setup complete');
}

function generateAgentScript(task: string): string {
    return `
import { query } from '@anthropic-ai/claude-agent-sdk';

// Track files written by the agent
const writtenFiles = [];

console.log(JSON.stringify({ type: 'agent_start', task: ${JSON.stringify(task)} }));

const config = {
    systemPrompt: ${JSON.stringify(RESEARCHER_PROMPT)},
    allowedTools: ${JSON.stringify(researcher.tools)},
    maxTurns: 5,
    permissionMode: 'acceptEdits',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    cwd: '${E2B_WORKSPACE}',
    resume: process.env.AGENT_SESSION_ID || undefined,
    hooks: {
        PostToolUse: [{
            hooks: [async (input, toolUseId, context) => {
                // Return tool events for UI
                console.log(JSON.stringify({ 
                    type: 'tool_call', 
                    name: input.tool_name,
                    input: input.tool_input
                }));
                
                // Track when Write tool is used
                if (input.tool_name === 'Write') {
                    const filePath = input.tool_input?.file_path || input.tool_input?.path || input.tool_input?.filename;
                    if (filePath) {
                        writtenFiles.push(filePath);
                        console.log(JSON.stringify({ type: 'file_written', path: filePath }));
                    }
                }
                return {};
            }]
        }]
    }
};

try {
    console.log(JSON.stringify({ type: 'query_start' }));
    for await (const msg of query({
        prompt: ${JSON.stringify(task)},
        options: config,
    })) {
        console.log(JSON.stringify(msg));
    }
    
    // Output final list of written files
    if (writtenFiles.length > 0) {
        console.log(JSON.stringify({ 
            type: 'files_summary', 
            files: writtenFiles 
        }));
    }
} catch (error) {
    console.error('[Error]', error.message || error);
    process.exit(1);
}
`;
}

// Export for backward compatibility
export { hybridAgentV2 as hybridAgent };
