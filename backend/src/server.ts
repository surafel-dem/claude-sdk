/**
 * Research Agent Server
 * 
 * Clean, minimal server for artifact-based research:
 * - Orchestrator creates plans (stored in Convex)
 * - Artifacts streamed with Convex IDs
 * - Real-time sync via SSE
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

import { getMode } from './sandbox/index.js';
import { hybridAgent } from './sandbox/hybrid-v2.js';
import { authMiddleware, getAuthUser, type AuthVariables } from './middleware/auth.js';
import { createArtifact, getThreadHistory } from './lib/convex.js';

const app = new Hono<{ Variables: AuthVariables }>();

// Session storage
interface Session {
    sessionId?: string;
    userId?: string;
    threadId?: string;
    pendingMessage?: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
}
const sessions = new Map<string, Session>();

// CORS
app.use('/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// Auth middleware
app.use('/*', authMiddleware);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', mode: getMode() }));

// Start chat
app.post('/api/chat', async (c) => {
    const user = getAuthUser(c);
    const { message, runId: existingRunId, sessionId: existingSessionId, threadId } = await c.req.json<{
        message: string;
        runId?: string;
        sessionId?: string;
        threadId?: string;
    }>();

    if (!message?.trim()) {
        return c.json({ error: 'Message required' }, 400);
    }

    const runId = existingRunId || randomUUID();
    const isNewSession = !sessions.has(runId);
    const session = sessions.get(runId) || { history: [] };

    // If it's a new session for an existing thread, load history from Convex
    if (isNewSession && threadId && session.history.length === 0) {
        try {
            const history = await getThreadHistory(threadId);
            if (history) {
                // Convert Convex messages to agent history
                const messages = history.messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content
                }));

                // Add artifacts as system-like context if they exist
                if (history.artifacts.length > 0) {
                    const artifactsSummary = history.artifacts.map(a =>
                        `[PAST ARTIFACT: ${a.type.toUpperCase()}] ${a.title}\nContent:\n${a.content}`
                    ).join('\n\n---\n\n');

                    messages.unshift({
                        role: 'user',
                        content: `CONTEXT: Here are the artifacts from our previous research in this thread:\n\n${artifactsSummary}\n\nPlease keep these in mind for our future interactions.`
                    });
                    messages.push({
                        role: 'assistant',
                        content: "I've reviewed the previous research and artifacts. I'm ready to continue."
                    });
                }

                session.history = messages;
                console.log(`[Server] Loaded ${session.history.length} messages from Convex history`);
            }
        } catch (error) {
            console.error('[Server] Error loading history:', error);
        }
    }

    session.pendingMessage = message;
    session.threadId = threadId;
    if (user) session.userId = user.id;
    if (existingSessionId) session.sessionId = existingSessionId;

    sessions.set(runId, session);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 ${existingRunId ? 'CONTINUE' : 'NEW'} | Thread: ${threadId?.slice(0, 8)}...`);
    console.log(`   "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`);
    console.log('='.repeat(50));

    return c.json({ runId, threadId });
});

// Stream results
app.get('/api/stream/:runId', async (c) => {
    const runId = c.req.param('runId');
    const session = sessions.get(runId);

    if (!session?.pendingMessage) {
        return c.json({ error: 'No pending message' }, 400);
    }

    const message = session.pendingMessage;
    const threadId = session.threadId;
    delete session.pendingMessage;

    return streamSSE(c, async (stream) => {
        try {
            // Clear workspace for new sessions
            if (session.history.length === 0) {
                mkdirSync('./workspace', { recursive: true });
                ['./workspace/plan.md', './workspace/report.md'].forEach(f => {
                    if (existsSync(f)) { unlinkSync(f); console.log(`[Clean] Removed ${f}`); }
                });
            }

            let fullResponse = '';

            for await (const event of hybridAgent(message, session.sessionId, session.history)) {
                switch (event.type) {
                    case 'text':
                        fullResponse += event.content;
                        await stream.writeSSE({ event: 'text', data: event.content });
                        break;

                    case 'status':
                        console.log(`[Status] ${event.content}`);
                        await stream.writeSSE({ event: 'status', data: event.content });
                        break;

                    case 'tool':
                        console.log(`[Tool] ${event.content}`);
                        await stream.writeSSE({ event: 'tool', data: JSON.stringify(event.data) });
                        break;

                    case 'artifact':
                        // Parse artifact data
                        const artifactData = JSON.parse(event.content);
                        console.log(`[Artifact] ${artifactData.type}: ${artifactData.title}`);

                        // Create in Convex if we have a threadId
                        let convexId: string | undefined;
                        if (threadId) {
                            const result = await createArtifact(
                                threadId,
                                artifactData.type,
                                artifactData.title,
                                artifactData.content
                            );
                            convexId = result?.id;
                            console.log(`[Convex] Artifact created: ${convexId}`);
                        }

                        // Send to frontend with Convex ID
                        await stream.writeSSE({
                            event: 'artifact',
                            data: JSON.stringify({
                                ...artifactData,
                                convexId,
                            })
                        });
                        break;

                    case 'error':
                        console.error('[Error]', event.content);
                        await stream.writeSSE({ event: 'error', data: event.content });
                        break;

                    case 'done':
                        // Don't send done here, we do it at the end
                        break;
                }
            }

            // Update history
            session.history.push({ role: 'user', content: message });
            session.history.push({ role: 'assistant', content: fullResponse });

            console.log(`\n✅ DONE\n`);
            await stream.writeSSE({ event: 'done', data: JSON.stringify({ status: 'success' }) });

        } catch (error) {
            console.error('[Stream Error]', error);
            await stream.writeSSE({ event: 'error', data: String(error) });
        }
    });
});

// Start server
const PORT = parseInt(process.env.PORT || '3001');
console.log(`\n🚀 Research Agent Server`);
console.log(`   Port: ${PORT}`);
console.log(`   Mode: ${getMode()}\n`);

serve({ fetch: app.fetch, port: PORT });
