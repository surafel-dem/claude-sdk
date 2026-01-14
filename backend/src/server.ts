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
import { createArtifact, updateArtifact } from './lib/convex.js';

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
    const { message, threadId, mode } = await c.req.json<{
        message: string;
        threadId?: string;
        mode?: 'local' | 'sandbox'
    }>();
    if (!message) return c.json({ error: 'Message required' }, 400);

    const runId = threadId || crypto.randomUUID();
    initRun(runId, message, mode || 'local');

    console.log(`[server] Run initialized: ${runId} (mode: ${mode || 'local'})`);
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
                // Save artifact to Convex when emitted
                if (event.type === 'artifact' && event.content) {
                    try {
                        const artifactData = JSON.parse(event.content);
                        await createArtifact(runId, artifactData.type, artifactData.title || 'Plan', artifactData.content);
                        console.log(`[server] Saved ${artifactData.type} artifact to Convex`);
                    } catch (e) {
                        console.error('[server] Failed to save artifact:', e);
                    }
                }

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
        console.log(`[sse] Starting SSE stream for runId: ${runId}`);
        let eventCount = 0;

        try {
            for await (const event of runResearch(runId)) {
                eventCount++;

                // Save artifact to Convex when emitted
                if (event.type === 'artifact') {
                    try {
                        const content = event.content || (event.data ? JSON.stringify(event.data) : '');
                        const artifactData = JSON.parse(content);
                        await createArtifact(runId, artifactData.type, artifactData.title || 'Report', artifactData.content);
                        console.log(`[server] Saved ${artifactData.type} artifact to Convex`);
                    } catch (e) {
                        console.error('[server] Failed to save artifact:', e);
                    }
                }

                // For tool events, send the full data as JSON
                const data = event.type === 'tool' && event.data
                    ? JSON.stringify(event.data)
                    : event.content || '';

                console.log(`[sse] Event #${eventCount}: ${event.type} -> ${data.slice(0, 80)}...`);

                await stream.writeSSE({
                    event: event.type,
                    data
                });
            }
            console.log(`[sse] Stream complete. Total events: ${eventCount}`);
        } catch (error) {
            console.error('[sse] Stream error:', error);
            await stream.writeSSE({ event: 'error', data: String(error) });
        }
    });
});

/**
 * PUT /api/artifacts/:id — Update an artifact
 */
app.put('/api/artifacts/:id', async c => {
    const id = c.req.param('id');
    const { content } = await c.req.json<{ content: string }>();

    if (!content) {
        return c.json({ error: 'Content required' }, 400);
    }

    const success = await updateArtifact(id, { content });
    if (!success) {
        return c.json({ error: 'Failed to update artifact' }, 500);
    }

    console.log(`[server] Updated artifact: ${id}`);
    return c.json({ ok: true });
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
