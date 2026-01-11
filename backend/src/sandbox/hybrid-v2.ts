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
    type: 'plan' | 'report';
    title: string;
    content: string;
    status: 'draft' | 'approved' | 'complete';
    editable?: boolean;  // Enables approve button in UI
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

        // Phase 3: Summary
        yield* summaryPhase(history, prompt, orchestratorResult.response);
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

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'delta' in event && 'text' in event.delta) {
            const text = event.delta.text;
            response += text;

            // Check for research trigger - DON'T yield this to UI
            if (response.includes('[EXECUTE_RESEARCH]')) {
                needsResearch = true;
                // Extract task
                const taskMatch = response.match(/RESEARCH_TASK:\s*(.+?)(?:\n|$)/);
                task = taskMatch ? taskMatch[1].trim() : prompt;

                // Don't yield internal markers - filter them out
                const cleanText = text
                    .replace(/\[EXECUTE_RESEARCH\]/g, '')
                    .replace(/RESEARCH_TASK:[^\n]*/g, '');

                if (cleanText.trim()) {
                    yield { type: 'text', content: cleanText };
                }
                continue;
            }

            // Emit clean text (filter any stray markers)
            const cleanText = text
                .replace(/\[EXECUTE_RESEARCH\]/g, '')
                .replace(/RESEARCH_TASK:[^\n]*/g, '');

            if (cleanText) {
                yield { type: 'text', content: cleanText };
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
                        editable: true,  // This enables the approve button!
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
        let eventCount = 0;

        log('Researcher', 'Starting agent execution...');

        const result = await sandbox.commands.run('node /home/user/agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                eventCount++;
                try {
                    const msg = JSON.parse(line);

                    // Log ALL events for debugging
                    if (msg.type) {
                        log('Researcher', `[Event ${eventCount}] ${msg.type}: ${JSON.stringify(msg).slice(0, 150)}...`);
                    }

                    // Capture file paths from our PostToolUse hook
                    if (msg.type === 'file_written' && msg.path) {
                        log('Researcher', `>>> FILE WRITTEN: ${msg.path}`);
                        writtenFiles.push(msg.path);
                    }

                    // Capture write detection
                    if (msg.type === 'write_detected') {
                        log('Researcher', `>>> WRITE DETECTED: ${JSON.stringify(msg)}`);
                    }

                    // Capture pre_tool for Write
                    if (msg.type === 'pre_tool' && msg.tool === 'Write') {
                        log('Researcher', `>>> PRE WRITE: ${JSON.stringify(msg.input)}`);
                    }

                    // Capture files summary at end
                    if (msg.type === 'files_summary' && msg.files) {
                        log('Researcher', `>>> FILES SUMMARY: ${msg.files.join(', ')}`);
                        for (const f of msg.files) {
                            if (!writtenFiles.includes(f)) writtenFiles.push(f);
                        }
                    }

                    if (msg.type === 'assistant' && msg.message?.content) {
                        // Tool use detection
                        for (const block of msg.message.content) {
                            if (block.type === 'tool_use') {
                                log('Researcher', `Tool: ${block.name}`);
                            }
                        }
                    }
                } catch {
                    // Not JSON - log raw output
                    if (line.trim()) {
                        log('Researcher', `[Raw] ${line.slice(0, 100)}`);
                    }
                }
            },
            onStderr: (line) => log('Researcher', `stderr: ${line}`),
        });

        log('Researcher', `Agent finished. Exit code: ${result.exitCode}, Events: ${eventCount}`);

        // Log what files were written
        if (writtenFiles.length > 0) {
            log('Researcher', `Files written by agent: ${writtenFiles.join(', ')}`);
        } else {
            log('Researcher', 'No file_written events captured from hooks');
        }

        // ===========================================
        // COMPREHENSIVE DEBUG: Find where report.md is
        // ===========================================
        log('Researcher', '=== BEGIN FILE SEARCH ===');

        // Check workspace
        try {
            const lsWorkspace = await sandbox.commands.run(`ls -la ${E2B_WORKSPACE}`);
            log('Researcher', `[1/5] Workspace ${E2B_WORKSPACE}:\n${lsWorkspace.stdout}`);
        } catch (e) {
            log('Researcher', `[1/5] Workspace error: ${e}`);
        }

        // Check home directory
        try {
            const lsHome = await sandbox.commands.run('ls -la /home/user');
            log('Researcher', `[2/5] Home /home/user:\n${lsHome.stdout}`);
        } catch (e) {
            log('Researcher', `[2/5] Home error: ${e}`);
        }

        // Check .claude directory (THIS IS WHERE SDK WRITES!)
        try {
            const lsClaude = await sandbox.commands.run('ls -laR /home/user/.claude 2>/dev/null | head -50');
            log('Researcher', `[3/5] .claude directory:\n${lsClaude.stdout}`);
        } catch (e) {
            log('Researcher', `[3/5] .claude error: ${e}`);
        }

        // Use find to locate ANY .md files
        try {
            const findMd = await sandbox.commands.run('find /home/user -name "*.md" -type f 2>/dev/null');
            log('Researcher', `[4/5] All .md files found:\n${findMd.stdout || '(none)'}`);
        } catch (e) {
            log('Researcher', `[4/5] Find .md error: ${e}`);
        }

        // Specifically find report.md
        try {
            const findReport = await sandbox.commands.run('find /home/user -name "report.md" -type f 2>/dev/null');
            log('Researcher', `[5/5] report.md locations:\n${findReport.stdout || '(none found)'}`);
        } catch (e) {
            log('Researcher', `[5/5] Find report.md error: ${e}`);
        }

        log('Researcher', '=== END FILE SEARCH ===');


        // Check for report - try both possible locations
        try {
            reportContent = await sandbox.files.read(`${E2B_WORKSPACE}/report.md`);
            writeLocal('report.md', reportContent);
            log('Researcher', 'Report downloaded from workspace');

            // Emit report artifact INLINE
            const artifact: Artifact = {
                id: `report-${Date.now()}`,
                type: 'report',
                title: 'Research Report',
                content: reportContent,
                status: 'complete',
            };

            yield { type: 'status', content: 'Research complete!' };
            yield {
                type: 'artifact',
                content: JSON.stringify(artifact),
                data: artifact
            };
        } catch {
            // Try home directory
            try {
                reportContent = await sandbox.files.read('/home/user/report.md');
                writeLocal('report.md', reportContent);
                log('Researcher', 'Report downloaded from home');

                const artifact: Artifact = {
                    id: `report-${Date.now()}`,
                    type: 'report',
                    title: 'Research Report',
                    content: reportContent,
                    status: 'complete',
                };

                yield { type: 'status', content: 'Research complete!' };
                yield {
                    type: 'artifact',
                    content: JSON.stringify(artifact),
                    data: artifact
                };
            } catch {
                // Try to find report.md ANYWHERE in the sandbox (including .claude directory)
                try {
                    log('Researcher', 'Searching for report.md in all locations...');
                    const findResult = await sandbox.commands.run('find /home/user -name "report.md" 2>/dev/null | head -1');
                    const reportPath = findResult.stdout.trim();

                    if (reportPath) {
                        log('Researcher', `Found report at: ${reportPath}`);
                        reportContent = await sandbox.files.read(reportPath);
                        writeLocal('report.md', reportContent);
                        log('Researcher', 'Report downloaded successfully');

                        const artifact: Artifact = {
                            id: `report-${Date.now()}`,
                            type: 'report',
                            title: 'Research Report',
                            content: reportContent,
                            status: 'complete',
                        };

                        yield { type: 'status', content: 'Research complete!' };
                        yield {
                            type: 'artifact',
                            content: JSON.stringify(artifact),
                            data: artifact
                        };
                    } else {
                        log('Researcher', 'No report.md found anywhere in sandbox');
                        yield { type: 'status', content: 'Research completed (no report generated)' };
                    }
                } catch (findError) {
                    log('Researcher', `Find command failed: ${findError}`);
                    yield { type: 'status', content: 'Research completed (no report generated)' };
                }
            }
        }

        // Pause sandbox for reuse
        try {
            await Sandbox.betaPause(sandbox.sandboxId);
            if (sessionId) sandboxStore.set(sessionId, sandbox.sandboxId);
        } catch {
            await Sandbox.kill(sandbox.sandboxId);
        }

    } catch (error) {
        log('Researcher', 'Error', { error: String(error) });
        yield { type: 'error', content: `Research failed: ${error}` };
        await Sandbox.kill(sandbox.sandboxId).catch(() => { });
    }
}

// === Phase 3: Summary ===
async function* summaryPhase(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    originalPrompt: string,
    _orchestratorResponse: string  // Not used - we use the report!
): AsyncGenerator<StreamEvent> {
    log('Summary', 'Phase 3: Generating summary');

    const report = readLocal('report.md');

    // Only generate summary if we have a report
    if (!report) {
        log('Summary', 'No report found, skipping summary');
        yield { type: 'text', content: '\n\nResearch completed but no report was generated.' };
        return;
    }

    yield { type: 'status', content: 'Summarizing findings...' };

    // Create a focused summary prompt  
    const summaryPrompt = `Based on this research report, provide a brief 2-3 sentence summary of the key findings. Be concise.

---
${report}
---

Summary:`;

    const stream = anthropic.messages.stream({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [
            { role: 'user' as const, content: originalPrompt },
            { role: 'user' as const, content: summaryPrompt }
        ],
    });

    yield { type: 'text', content: '\n\n**Summary:** ' };

    for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'delta' in event && 'text' in event.delta) {
            yield { type: 'text', content: event.delta.text };
        }
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
    hooks: {
        PreToolUse: [{
            hooks: [async (input, toolUseId, context) => {
                console.log(JSON.stringify({ 
                    type: 'pre_tool', 
                    tool: input.tool_name,
                    input: input.tool_input
                }));
                return {};
            }]
        }],
        PostToolUse: [{
            hooks: [async (input, toolUseId, context) => {
                console.log(JSON.stringify({ 
                    type: 'post_tool', 
                    tool: input.tool_name,
                    response: typeof input.tool_response === 'string' 
                        ? input.tool_response.slice(0, 200) 
                        : JSON.stringify(input.tool_response).slice(0, 200)
                }));
                
                // Track when Write tool is used
                if (input.tool_name === 'Write') {
                    const filePath = input.tool_input?.file_path || input.tool_input?.path || input.tool_input?.filename;
                    console.log(JSON.stringify({ 
                        type: 'write_detected', 
                        input: input.tool_input,
                        path: filePath
                    }));
                    if (filePath) {
                        writtenFiles.push(filePath);
                        console.log(JSON.stringify({ 
                            type: 'file_written', 
                            path: filePath 
                        }));
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
