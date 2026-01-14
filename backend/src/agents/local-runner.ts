/**
 * Local Runner — Direct SDK Execution
 * 
 * Runs Claude Agent SDK directly on the backend.
 * Uses session-based files for isolation.
 * Detailed logging for debugging.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';

const WORKSPACE = './workspace';

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

/**
 * Run research locally using SDK
 * Each run uses a unique session directory
 */
export async function* runLocal(task: string, sessionId?: string): AsyncGenerator<StreamEvent> {
    const session = sessionId || `session_${Date.now()}`;
    const sessionDir = `${WORKSPACE}/${session}`;
    const reportPath = `${sessionDir}/report.md`;

    mkdirSync(sessionDir, { recursive: true });
    console.log(`\n[local] ========== NEW SESSION: ${session} ==========`);
    console.log(`[local] Session dir: ${sessionDir}`);
    console.log(`[local] Task: ${task.slice(0, 100)}...`);

    yield { type: 'status', content: 'Starting research...' };
    console.log('[local] Yielded: status -> Starting research...');

    let reportContent = '';
    let eventCount = 0;

    // Update prompt to use session-specific path
    const sessionPrompt = RESEARCHER_PROMPT.replace(
        'report.md',
        reportPath
    );

    try {
        for await (const msg of query({
            prompt: task,
            options: {
                systemPrompt: sessionPrompt,
                allowedTools: ['WebSearch', 'Write', 'WebFetch', 'Read', 'Task'],
                maxTurns: 15,
                cwd: sessionDir,
                permissionMode: 'acceptEdits',
                includePartialMessages: true,  // Enable real-time streaming
            }
        })) {
            // Handle real-time token streaming
            if (msg.type === 'stream_event') {
                const event = (msg as any).event;
                if (event.type === 'content_block_delta' &&
                    event.delta?.type === 'text_delta' &&
                    event.delta?.text) {
                    yield { type: 'text', content: event.delta.text };
                }
                continue;
            }

            if (msg.type === 'assistant' && msg.message?.content) {
                for (const block of msg.message.content) {
                    // Handle tool calls
                    if ('name' in block && 'input' in block) {
                        const toolName = block.name as string;
                        eventCount++;
                        console.log(`[local] Event #${eventCount}: Tool -> ${toolName}`);

                        // Emit status based on tool
                        let statusMsg = '';
                        if (toolName === 'WebSearch') {
                            statusMsg = 'Searching the web...';
                        } else if (toolName === 'WebFetch') {
                            statusMsg = 'Reading webpage...';
                        } else if (toolName === 'Write') {
                            statusMsg = 'Writing report...';
                            // Capture report content
                            const input = block.input as { content?: string; file_path?: string };
                            if (input.content) {
                                reportContent = input.content;
                                console.log(`[local] Captured report content (${reportContent.length} chars)`);
                            }
                        } else if (toolName === 'Task') {
                            statusMsg = 'Running sub-task...';
                        } else if (toolName === 'Read') {
                            statusMsg = 'Reading file...';
                        } else {
                            statusMsg = `Running ${toolName}...`;
                        }

                        yield { type: 'status', content: statusMsg };
                        console.log(`[local] Yielded: status -> ${statusMsg}`);

                        // Emit tool event
                        yield {
                            type: 'tool',
                            content: toolName,
                            data: { name: toolName, input: block.input }
                        };
                        console.log(`[local] Yielded: tool -> ${toolName}`);
                    }

                    // Skip text blocks - we get these from stream_event now
                }
            }
        }
    } catch (error) {
        console.error('[local] SDK Error:', error);
        yield { type: 'error', content: String(error) };
    }

    console.log(`[local] SDK loop complete. Events: ${eventCount}, Report captured: ${reportContent.length > 0}`);

    // Handle report
    if (reportContent) {
        // Save to session file
        writeFileSync(reportPath, reportContent);
        console.log(`[local] Report saved to: ${reportPath}`);

        yield { type: 'status', content: 'Complete' };
        console.log('[local] Yielded: status -> Complete');

        // Create artifact
        yield {
            type: 'artifact',
            content: JSON.stringify({
                type: 'report',
                title: 'Research Report',
                content: reportContent,
            })
        };
        console.log('[local] Yielded: artifact');

        // Stream the report content
        yield { type: 'text', content: '\n\n---\n\n' + reportContent };
        console.log('[local] Yielded: text (report content)');
    } else {
        // Try to read from file if agent wrote directly
        if (existsSync(reportPath)) {
            const fileContent = readFileSync(reportPath, 'utf-8');
            console.log(`[local] Found report file (${fileContent.length} chars)`);
            yield {
                type: 'artifact',
                content: JSON.stringify({
                    type: 'report',
                    title: 'Research Report',
                    content: fileContent,
                })
            };
            yield { type: 'text', content: '\n\n---\n\n' + fileContent };
        } else {
            console.log('[local] No report generated');
            yield { type: 'status', content: 'No report generated' };
        }
    }

    yield { type: 'done', content: 'complete' };
    console.log('[local] ========== SESSION COMPLETE ==========\n');
}
