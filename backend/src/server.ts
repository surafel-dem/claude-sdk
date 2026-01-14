/**
 * Research Agent Server — Clean Two-Phase
 * 
 * Flow:
 * 1. POST /api/chat → Init run, return runId
 * 2. GET /api/stream/:runId → Stream Phase 1 (planning)
 * 3. POST /api/continue/:runId → Approve and stream Phase 2 (research)
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import {
    initRun,
    getRunState,
    approveRun,
    runPlanning,
    runResearch
} from './agents/index.js';

const app = new Hono();

app.use('/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));

app.get('/health', c => c.json({ status: 'ok' }));

/**
 * POST /api/chat — Initialize run
 */
app.post('/api/chat', async c => {
    const { message, threadId } = await c.req.json<{ message: string; threadId?: string }>();
    if (!message) return c.json({ error: 'Message required' }, 400);

    const runId = threadId || crypto.randomUUID();
    initRun(runId, message);

    return c.json({ runId, threadId: runId });
});

/**
 * GET /api/stream/:runId — Stream Phase 1 (Planning)
 */
app.get('/api/stream/:runId', async c => {
    const runId = c.req.param('runId');
    const state = getRunState(runId);

    if (!state) {
        return c.json({ error: 'Run not found' }, 404);
    }

    // Only run planning if in planning phase
    if (state.phase !== 'planning') {
        return streamSSE(c, async stream => {
            await stream.writeSSE({
                event: 'error',
                data: `Already past planning phase: ${state.phase}`
            });
        });
    }

    return streamSSE(c, async stream => {
        try {
            for await (const event of runPlanning(runId)) {
                await stream.writeSSE({
                    event: event.type,
                    data: event.content || ''
                });
            }
        } catch (error) {
            console.error('[planning error]', error);
            await stream.writeSSE({ event: 'error', data: String(error) });
        }
    });
});

/**
 * POST /api/continue/:runId — Approve and run Phase 2 (Research)
 * 
 * This endpoint:
 * 1. Approves the run
 * 2. Returns SSE stream of research results
 */
app.post('/api/continue/:runId', async c => {
    const runId = c.req.param('runId');
    const body = await c.req.json<{ action: 'approve' | 'reject'; plan?: string }>()
        .catch(() => ({ action: 'approve' as const, plan: undefined }));

    const state = getRunState(runId);
    if (!state) {
        return c.json({ error: 'Run not found' }, 404);
    }

    if (body.action === 'reject') {
        return c.json({ ok: true, message: 'Research cancelled' });
    }

    // Approve the run
    if (!approveRun(runId, body.plan)) {
        return c.json({ error: `Cannot approve run in phase: ${state.phase}` }, 400);
    }

    // Stream Phase 2 (Research)
    return streamSSE(c, async stream => {
        try {
            for await (const event of runResearch(runId)) {
                await stream.writeSSE({
                    event: event.type,
                    data: event.content || ''
                });
            }
        } catch (error) {
            console.error('[research error]', error);
            await stream.writeSSE({ event: 'error', data: String(error) });
        }
    });
});

/**
 * GET /api/status/:runId — Check run status
 */
app.get('/api/status/:runId', async c => {
    const runId = c.req.param('runId');
    const state = getRunState(runId);

    if (!state) {
        return c.json({ exists: false });
    }

    return c.json({
        exists: true,
        phase: state.phase,
        hasPlan: !!state.plan
    });
});

const PORT = parseInt(process.env.PORT || '3001');
console.log(`\n🚀 Research Agent Server (Clean Two-Phase) - Port: ${PORT}\n`);
serve({ fetch: app.fetch, port: PORT });
