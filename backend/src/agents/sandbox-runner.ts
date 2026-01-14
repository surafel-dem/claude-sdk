/**
 * Sandbox Runner — E2B Cloud Execution
 * 
 * Runs Claude Agent SDK inside E2B sandbox.
 * Uses explicit file paths for reliable file access.
 */

import type { Sandbox } from '@e2b/code-interpreter';
import { getSandbox, setupSandbox, pause } from '../sandbox/sandbox-manager.js';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';

// Explicit paths for file operations
const FILES_DIR = '/home/user/files';
const REPORT_PATH = `${FILES_DIR}/report.md`;

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

/**
 * Run research in E2B sandbox
 */
export async function* runSandbox(task: string): AsyncGenerator<StreamEvent> {
    yield { type: 'status', content: 'Starting research in sandbox...' };

    let sandbox: Sandbox | null = null;
    try {
        const result = await getSandbox();
        sandbox = result.sandbox;

        // Setup if needed
        if (result.needsSetup) {
            yield { type: 'status', content: 'Installing research tools (~30s)...' };
            await setupSandbox(sandbox);
        }

        // Create files directory
        await sandbox.commands.run(`mkdir -p ${FILES_DIR}`);

        // Generate and write script
        const script = generateScript(task);
        await sandbox.files.write('/home/user/agent.mjs', script);

        yield { type: 'status', content: 'Searching the web...' };

        // Run agent
        await sandbox.commands.run('cd /home/user && node agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if ('name' in block) {
                                console.log(`[sandbox] Tool: ${block.name}`);
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

        // Read report from explicit path
        try {
            console.log(`[sandbox] Reading report from ${REPORT_PATH}...`);
            const report = await sandbox.files.read(REPORT_PATH);
            console.log(`[sandbox] Report read (${report.length} chars)`);
            yield {
                type: 'artifact',
                content: JSON.stringify({
                    type: 'report',
                    title: 'Research Report',
                    content: report,
                })
            };
            yield { type: 'text', content: report };
        } catch (err) {
            // Fallback: find report anywhere
            console.log('[sandbox] Trying to find report.md...');
            const findResult = await sandbox.commands.run('find /home/user -name "report.md" 2>/dev/null | head -1');
            const path = findResult.stdout.trim();
            if (path) {
                console.log(`[sandbox] Found at: ${path}`);
                const report = await sandbox.files.read(path);
                yield { type: 'text', content: report };
            } else {
                console.error('[sandbox] No report found');
                yield { type: 'error', content: 'No report generated' };
            }
        }

    } finally {
        if (sandbox) {
            await pause(sandbox.sandboxId);
        }
    }

    yield { type: 'done', content: 'complete' };
}

/**
 * Generate agent script with explicit file path
 */
function generateScript(task: string): string {
    return `
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const msg of query({
    prompt: ${JSON.stringify(task)},
    options: {
        systemPrompt: ${JSON.stringify(RESEARCHER_PROMPT.replace('report.md', REPORT_PATH))},
        allowedTools: ['WebSearch', 'Write'],
        maxTurns: 5,
        cwd: '${FILES_DIR}',
        permissionMode: 'acceptEdits',
    }
})) {
    console.log(JSON.stringify(msg));
}
`;
}
