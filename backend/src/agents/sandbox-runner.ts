/**
 * Sandbox Runner — E2B Cloud Execution
 * 
 * Runs Claude Agent SDK inside E2B sandbox.
 * Matches local-runner's event streaming pattern.
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
 * Streams events similar to local-runner
 */
export async function* runSandbox(task: string): AsyncGenerator<StreamEvent> {
    console.log('\n[sandbox] ========== NEW SANDBOX SESSION ==========');
    console.log(`[sandbox] Task: ${task.slice(0, 100)}...`);

    yield { type: 'status', content: 'Starting sandbox...' };
    console.log('[sandbox] Yielded: status -> Starting sandbox...');

    let sandbox: Sandbox | null = null;

    // Collect events from stdout to yield after command completes
    const pendingEvents: StreamEvent[] = [];

    try {
        const result = await getSandbox();
        sandbox = result.sandbox;

        // Setup if needed
        if (result.needsSetup) {
            yield { type: 'status', content: 'Installing SDK (~30s)...' };
            console.log('[sandbox] Yielded: status -> Installing SDK...');
            await setupSandbox(sandbox);
        }

        // Create files directory
        await sandbox.commands.run(`mkdir -p ${FILES_DIR}`);
        console.log(`[sandbox] Created ${FILES_DIR}`);

        // Generate and write script
        const script = generateScript(task);
        await sandbox.files.write('/home/user/agent.mjs', script);

        yield { type: 'status', content: 'Researching...' };
        console.log('[sandbox] Yielded: status -> Researching...');

        // Run agent and collect events
        await sandbox.commands.run('cd /home/user && node agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                try {
                    const msg = JSON.parse(line);

                    // Handle real-time token streaming
                    if (msg.type === 'stream_event') {
                        const event = msg.event;
                        if (event?.type === 'content_block_delta' &&
                            event.delta?.type === 'text_delta' &&
                            event.delta?.text) {
                            pendingEvents.push({
                                type: 'text',
                                content: event.delta.text
                            });
                        }
                    }

                    if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if ('name' in block && 'input' in block) {
                                const toolName = block.name as string;
                                console.log(`[sandbox] Tool: ${toolName}`);

                                // Only queue tool event (not status - would be out of order)
                                pendingEvents.push({
                                    type: 'tool',
                                    content: toolName,
                                    data: { name: toolName, input: block.input }
                                });
                            }
                        }
                    }
                } catch {
                    if (line.trim()) console.log('[sandbox stdout]', line);
                }
            },
            onStderr: (line) => {
                if (line.trim()) console.error('[sandbox stderr]', line);
            }
        });

        // Yield pending events
        for (const event of pendingEvents) {
            yield event;
            console.log(`[sandbox] Yielded: ${event.type} -> ${event.content.slice(0, 50)}...`);
        }

        // Read report
        console.log(`[sandbox] Reading report from ${REPORT_PATH}...`);
        let report = '';
        try {
            report = await sandbox.files.read(REPORT_PATH);
            console.log(`[sandbox] Report read (${report.length} chars)`);
        } catch {
            // Fallback: find report anywhere
            console.log('[sandbox] Trying to find report.md...');
            const findResult = await sandbox.commands.run('find /home/user -name "report.md" 2>/dev/null | head -1');
            const path = findResult.stdout.trim();
            if (path) {
                console.log(`[sandbox] Found at: ${path}`);
                report = await sandbox.files.read(path);
            }
        }

        if (report) {
            yield { type: 'status', content: 'Complete' };
            console.log('[sandbox] Yielded: status -> Complete');

            yield {
                type: 'artifact',
                content: JSON.stringify({
                    type: 'report',
                    title: 'Research Report',
                    content: report,
                })
            };
            console.log('[sandbox] Yielded: artifact');

            // Only emit text if no artifact panel (optional)
            // yield { type: 'text', content: report };  // Disabled to avoid duplication
        } else {
            console.error('[sandbox] No report found');
            yield { type: 'status', content: 'No report generated' };
        }

    } finally {
        if (sandbox) {
            await pause(sandbox.sandboxId);
        }
    }

    yield { type: 'done', content: 'complete' };
    console.log('[sandbox] ========== SESSION COMPLETE ==========\n');
}

/**
 * Generate agent script with Exa search tool
 * Creates an inline MCP server for Exa search
 */
function generateScript(task: string): string {
    const promptWithPath = RESEARCHER_PROMPT.replace(/report\.md/g, REPORT_PATH);
    const exaApiKey = process.env.EXA_API_KEY || '';

    return `
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import Exa from 'exa-js';

// Initialize Exa client
const exaApiKey = ${JSON.stringify(exaApiKey)};
const getExaClient = () => {
    if (!exaApiKey) throw new Error("EXA_API_KEY not set");
    return new Exa(exaApiKey);
};

// Create Exa search MCP server
const exaSearchTools = createSdkMcpServer({
    name: "exa-search",
    version: "1.0.0",
    tools: [
        tool(
            "search",
            "Search the web using Exa neural search",
            {
                query: z.string().describe("Search query"),
                num_results: z.number().min(1).max(10).default(5)
            },
            async (args) => {
                try {
                    const exa = getExaClient();
                    const results = await exa.searchAndContents(args.query, {
                        type: "neural",
                        numResults: args.num_results,
                        useAutoprompt: true,
                        contents: { text: { maxCharacters: 1000 } }
                    });
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                total: results.results.length,
                                results: results.results.map(r => ({
                                    title: r.title,
                                    url: r.url,
                                    text: r.text?.slice(0, 500)
                                }))
                            }, null, 2)
                        }]
                    };
                } catch (error) {
                    return { content: [{ type: "text", text: "Search error: " + error.message }], isError: true };
                }
            }
        )
    ]
});

// Run agent
for await (const msg of query({
    prompt: ${JSON.stringify(task)},
    options: {
        systemPrompt: ${JSON.stringify(promptWithPath)},
        mcpServers: { "exa-search": exaSearchTools },
        allowedTools: ['mcp__exa-search__search', 'Write', 'Read'],
        maxTurns: 10,
        cwd: '${FILES_DIR}',
        permissionMode: 'acceptEdits',
        includePartialMessages: true,
    }
})) {
    console.log(JSON.stringify(msg));
}
`;
}
