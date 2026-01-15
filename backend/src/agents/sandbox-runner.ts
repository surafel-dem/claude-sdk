/**
 * Sandbox Runner — E2B Cloud Execution with Real-time Streaming
 *
 * Uses an async queue to bridge E2B's callback-based stdout
 * to our generator-based event streaming.
 */

import type { Sandbox } from '@e2b/code-interpreter';
import { getSandbox, setupSandbox, pause } from '../sandbox/sandbox-manager.js';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';

const FILES_DIR = '/home/user/files';
const REPORT_PATH = `${FILES_DIR}/report.md`;

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

// =============================================================================
// Async Event Queue — Bridges callbacks to async iteration
// =============================================================================

class EventQueue<T> {
    private queue: T[] = [];
    private resolvers: Array<(value: T | null) => void> = [];
    private closed = false;

    push(item: T): void {
        if (this.closed) return;
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift()!;
            resolve(item);
        } else {
            this.queue.push(item);
        }
    }

    close(): void {
        this.closed = true;
        for (const resolve of this.resolvers) {
            resolve(null);
        }
        this.resolvers = [];
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
        while (true) {
            if (this.queue.length > 0) {
                yield this.queue.shift()!;
            } else if (this.closed) {
                return;
            } else {
                const item = await new Promise<T | null>((resolve) => {
                    this.resolvers.push(resolve);
                });
                if (item === null) return;
                yield item;
            }
        }
    }
}

// =============================================================================
// Sandbox Runner
// =============================================================================

export async function* runSandbox(task: string): AsyncGenerator<StreamEvent> {
    yield { type: 'status', content: 'Starting sandbox...' };

    let sandbox: Sandbox | null = null;
    const eventQueue = new EventQueue<StreamEvent>();

    try {
        const result = await getSandbox();
        sandbox = result.sandbox;

        if (result.needsSetup) {
            yield { type: 'status', content: 'Installing SDK (~30s)...' };
            await setupSandbox(sandbox);
        }

        await sandbox.commands.run(`mkdir -p ${FILES_DIR}`);

        const script = generateScript(task);
        await sandbox.files.write('/home/user/agent.mjs', script);

        yield { type: 'status', content: 'Researching...' };

        // Run command in background, streaming events via queue
        const commandPromise = sandbox.commands.run('cd /home/user && node agent.mjs', {
            timeoutMs: 5 * 60 * 1000,
            onStdout: (line) => {
                const event = parseStdoutLine(line);
                if (event) eventQueue.push(event);
            },
            onStderr: (line) => {
                if (line.trim()) console.error('[sandbox stderr]', line);
            },
        }).finally(() => eventQueue.close());

        // Stream events as they arrive
        for await (const event of eventQueue) {
            yield event;
        }

        // Wait for command to fully complete
        await commandPromise;

        // Read and emit report
        const report = await readReport(sandbox);
        if (report) {
            yield { type: 'status', content: 'Complete' };
            yield {
                type: 'artifact',
                content: JSON.stringify({
                    type: 'report',
                    title: 'Research Report',
                    content: report,
                }),
            };
        } else {
            yield { type: 'status', content: 'No report generated' };
        }
    } catch (error) {
        yield { type: 'error', content: String(error) };
    } finally {
        if (sandbox) {
            await pause(sandbox.sandboxId);
        }
    }

    yield { type: 'done', content: 'complete' };
}

// =============================================================================
// Helpers
// =============================================================================

function parseStdoutLine(line: string): StreamEvent | null {
    try {
        const msg = JSON.parse(line);

        // Real-time token streaming
        if (msg.type === 'stream_event') {
            const event = msg.event;
            if (
                event?.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta?.text
            ) {
                return { type: 'text', content: event.delta.text };
            }
        }

        // Tool calls from assistant messages
        if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
                if ('name' in block && 'input' in block) {
                    return {
                        type: 'tool',
                        content: block.name as string,
                        data: { name: block.name, input: block.input },
                    };
                }
            }
        }
    } catch {
        // Non-JSON output, ignore
    }
    return null;
}

async function readReport(sandbox: Sandbox): Promise<string | null> {
    try {
        return await sandbox.files.read(REPORT_PATH);
    } catch {
        // Fallback: find report anywhere
        const findResult = await sandbox.commands.run(
            'find /home/user -name "report.md" 2>/dev/null | head -1'
        );
        const path = findResult.stdout.trim();
        if (path) {
            return await sandbox.files.read(path);
        }
    }
    return null;
}

function generateScript(task: string): string {
    const promptWithPath = RESEARCHER_PROMPT.replace(/report\.md/g, REPORT_PATH);
    const exaApiKey = process.env.EXA_API_KEY || '';

    return `
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import Exa from 'exa-js';

const exaApiKey = ${JSON.stringify(exaApiKey)};
const getExaClient = () => {
    if (!exaApiKey) throw new Error("EXA_API_KEY not set");
    return new Exa(exaApiKey);
};

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
