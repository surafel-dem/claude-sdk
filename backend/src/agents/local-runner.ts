/**
 * Local Runner — Direct SDK Execution with Hooks
 *
 * Runs Claude Agent SDK locally with full hook support.
 * Captures SDK session ID for resumption.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';
import { exaSearchTools } from '../tools/exa-search.js';
import { createStreamingHooks } from './hooks.js';
import { upsertSession, logToolCall } from '../lib/convex.js';

const WORKSPACE = './workspace';

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

type RunOptions = {
    threadId: string;
    task: string;
    mode: 'local' | 'sandbox';
    sdkSessionId?: string; // For resumption
};

/**
 * Run research locally with hooks and session persistence
 */
export async function* runLocal(options: RunOptions): AsyncGenerator<StreamEvent> {
    const { threadId, task, mode } = options;
    const sessionDir = `${WORKSPACE}/${threadId}`;
    const reportPath = `${sessionDir}/report.md`;

    mkdirSync(sessionDir, { recursive: true });

    // Collect events to yield (hooks can't yield directly)
    const pendingEvents: StreamEvent[] = [];
    const emit = (event: StreamEvent) => pendingEvents.push(event);

    // Create hooks with event emitter
    const hooks = createStreamingHooks(emit);

    // Track tool calls to Convex
    const trackToolCall = (toolName: string, input: unknown) => {
        logToolCall(threadId, threadId, 'researcher', toolName, input).catch(() => {});
    };

    yield { type: 'status', content: 'Starting research...' };

    let reportContent = '';
    let capturedSessionId: string | undefined;

    // Build prompt with session-specific path
    const sessionPrompt = RESEARCHER_PROMPT.replace('report.md', reportPath);

    // Streaming input generator (required for MCP)
    async function* generatePrompt() {
        yield {
            type: 'user' as const,
            message: { role: 'user' as const, content: task },
        };
    }

    try {
        console.log(`[local-runner] Starting research for thread: ${threadId}`);
        console.log(`[local-runner] Mode: ${mode}, SessionDir: ${sessionDir}`);
        console.log(`[local-runner] Task length: ${task.length} chars`);

        for await (const msg of query({
            prompt: generatePrompt() as AsyncIterable<any>,
            options: {
                systemPrompt: sessionPrompt,
                mcpServers: { 'exa-search': exaSearchTools },
                allowedTools: [
                    'mcp__exa-search__search',
                    'mcp__exa-search__get_contents',
                    'Write',
                    'Read',
                ],
                maxTurns: 15,
                cwd: sessionDir,
                permissionMode: 'acceptEdits',
                includePartialMessages: true,
                hooks,
            },
        })) {
            // Capture SDK session ID on init
            if (msg.type === 'system' && (msg as any).subtype === 'init') {
                capturedSessionId = (msg as any).session_id;
                if (capturedSessionId) {
                    await upsertSession({
                        threadId,
                        sdkSessionId: capturedSessionId,
                        phase: 'researching',
                        mode,
                    });
                }
            }

            // Real-time token streaming
            if (msg.type === 'stream_event') {
                const event = (msg as any).event;
                if (
                    event?.type === 'content_block_delta' &&
                    event.delta?.type === 'text_delta' &&
                    event.delta?.text
                ) {
                    yield { type: 'text', content: event.delta.text };
                }
                continue;
            }

            // Process assistant messages for tool calls
            if (msg.type === 'assistant' && msg.message?.content) {
                for (const block of msg.message.content) {
                    if ('name' in block && 'input' in block) {
                        const toolName = block.name as string;
                        const input = block.input as Record<string, unknown>;

                        // Track to Convex
                        trackToolCall(toolName, input);

                        // Emit status based on tool
                        const statusMap: Record<string, string> = {
                            'mcp__exa-search__search': 'Searching...',
                            'mcp__exa-search__get_contents': 'Reading sources...',
                            Write: 'Writing report...',
                            Read: 'Reading file...',
                        };
                        yield { type: 'status', content: statusMap[toolName] || `Running ${toolName}...` };

                        // Capture report content from Write
                        if (toolName === 'Write' && input.content) {
                            reportContent = input.content as string;
                        }

                        // Yield tool event
                        yield {
                            type: 'tool',
                            content: toolName,
                            data: { name: toolName, input },
                        };
                    }
                }
            }

            // Yield any pending hook events
            while (pendingEvents.length > 0) {
                yield pendingEvents.shift()!;
            }
        }
    } catch (error) {
        console.error(`[local-runner] Error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        yield { type: 'error', content: errorMessage };
        return;
    }

    // Handle report output
    if (reportContent) {
        writeFileSync(reportPath, reportContent);
        yield { type: 'status', content: 'Complete' };
        yield {
            type: 'artifact',
            content: JSON.stringify({
                type: 'report',
                title: 'Research Report',
                content: reportContent,
            }),
        };
    } else if (existsSync(reportPath)) {
        const fileContent = readFileSync(reportPath, 'utf-8');
        yield {
            type: 'artifact',
            content: JSON.stringify({
                type: 'report',
                title: 'Research Report',
                content: fileContent,
            }),
        };
    } else {
        yield { type: 'status', content: 'No report generated' };
    }

    yield { type: 'done', content: 'complete' };
}
