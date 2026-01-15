/**
 * Research Agent Server
 *
 * Two-phase flow with session persistence:
 * 1. POST /api/chat → Init run, return runId
 * 2. GET /api/stream/:runId → Stream Phase 1 (planning)
 * 3. POST /api/continue/:runId → Approve and stream Phase 2 (research)
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
    initRun,
    getRunState,
    approveRun,
    runPlanning,
    runResearch,
} from './agents/index.js';
import { createArtifact, getSession } from './lib/convex.js';

// =============================================================================
// Validation Schemas
// =============================================================================

const chatSchema = z.object({
    message: z.string().min(1),
    threadId: z.string().optional(),
    mode: z.enum(['local', 'sandbox']).default('local'),
});

const continueSchema = z.object({
    action: z.enum(['approve', 'reject']).default('approve'),
    plan: z.string().optional(),
});

// =============================================================================
// App Setup
// =============================================================================

const app = new Hono();

app.use('*', logger());
app.use(
    '*',
    cors({
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true,
    })
);

// =============================================================================
// Routes
// =============================================================================

const routes = app
    .get('/health', (c) => c.json({ status: 'ok' }, 200))

    // Initialize run (checks for existing session)
    .post('/api/chat', zValidator('json', chatSchema), async (c) => {
        const { message, threadId, mode } = c.req.valid('json');
        const runId = threadId || crypto.randomUUID();

        const state = await initRun(runId, message, mode);
        console.log(`[server] Run ${runId}: phase=${state.phase}, mode=${mode}`);

        return c.json({ runId, threadId: runId, phase: state.phase }, 200);
    })

    // Stream planning phase
    .get('/api/stream/:runId', (c) => {
        const runId = c.req.param('runId');
        const state = getRunState(runId);

        if (!state) {
            return c.json({ error: 'Run not found' }, 404);
        }

        if (state.phase !== 'planning') {
            return streamSSE(c, async (stream) => {
                await stream.writeSSE({
                    event: 'info',
                    data: JSON.stringify({ phase: state.phase, plan: state.plan }),
                });
                await stream.writeSSE({ event: 'done', data: state.phase });
            });
        }

        return streamSSE(
            c,
            async (stream) => {
                for await (const event of runPlanning(runId)) {
                    if (event.type === 'artifact') {
                        try {
                            const data = JSON.parse(event.content);
                            // Create in Convex and get the real ID
                            const result = await createArtifact(runId, data.type, data.title, data.content);
                            // Include Convex ID in the event
                            const eventData = { ...data, id: result?.id };
                            await stream.writeSSE({ event: event.type, data: JSON.stringify(eventData) });
                        } catch (e) {
                            console.error('[artifact error]', e);
                            await stream.writeSSE({ event: event.type, data: event.content });
                        }
                    } else {
                        await stream.writeSSE({ event: event.type, data: event.content });
                    }
                }
            },
            async (err, stream) => {
                console.error('[planning error]', err);
                await stream.writeSSE({ event: 'error', data: String(err) });
            }
        );
    })

    // Approve and run research phase
    .post('/api/continue/:runId', zValidator('json', continueSchema), async (c) => {
        const runId = c.req.param('runId');
        const { action, plan } = c.req.valid('json');

        const state = getRunState(runId);
        if (!state) {
            return c.json({ error: 'Run not found' }, 404);
        }

        if (action === 'reject') {
            return c.json({ ok: true, message: 'Cancelled' }, 200);
        }

        const approved = await approveRun(runId, plan);
        if (!approved) {
            return c.json({ error: `Cannot approve in phase: ${state.phase}` }, 400);
        }

        return streamSSE(
            c,
            async (stream) => {
                for await (const event of runResearch(runId)) {
                    if (event.type === 'artifact') {
                        try {
                            const data = JSON.parse(event.content);
                            // Create in Convex and get the real ID
                            const result = await createArtifact(runId, data.type, data.title, data.content);
                            // Include Convex ID in the event
                            const eventData = { ...data, id: result?.id };
                            await stream.writeSSE({ event: event.type, data: JSON.stringify(eventData) });
                        } catch (e) {
                            console.error('[artifact error]', e);
                            await stream.writeSSE({ event: event.type, data: event.content });
                        }
                    } else if (event.type === 'tool' && event.data) {
                        await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) });
                    } else {
                        await stream.writeSSE({ event: event.type, data: event.content });
                    }
                }
            },
            async (err, stream) => {
                console.error('[research error]', err);
                await stream.writeSSE({ event: 'error', data: String(err) });
            }
        );
    })

    // Get run status (with session lookup)
    .get('/api/status/:runId', async (c) => {
        const runId = c.req.param('runId');

        // Check in-memory first
        const state = getRunState(runId);
        if (state) {
            return c.json({
                exists: true,
                phase: state.phase,
                hasPlan: !!state.plan,
                mode: state.mode,
            }, 200);
        }

        // Check Convex for persisted session
        const session = await getSession(runId);
        if (session) {
            return c.json({
                exists: true,
                phase: session.phase,
                hasPlan: !!session.plan,
                mode: session.mode,
                persisted: true,
            }, 200);
        }

        return c.json({ exists: false }, 200);
    });

// =============================================================================
// Export & Start
// =============================================================================

export type AppType = typeof routes;

const PORT = parseInt(process.env.PORT || '3001');
console.log(`\n🚀 Research Agent Server - Port: ${PORT}\n`);
serve({ fetch: app.fetch, port: PORT });
