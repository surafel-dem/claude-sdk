/**
 * Local Sandbox
 *
 * Runs the agent directly on the local machine.
 */

import { mkdirSync } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { orchestratorConfig, researcher } from '../agents/index.js';

const baseOptions = {
    systemPrompt: orchestratorConfig.systemPrompt,
    allowedTools: [...orchestratorConfig.allowedTools],
    maxTurns: orchestratorConfig.maxTurns,
    permissionMode: orchestratorConfig.permissionMode,
    model: orchestratorConfig.model,
    cwd: './workspace',
    agents: { researcher },
};

export function runLocal(prompt: string): AsyncGenerator<SDKMessage, void, unknown> {
    mkdirSync('./workspace', { recursive: true });
    console.log(`[Local] Starting new session`);
    return query({ prompt, options: baseOptions });
}

export function resumeLocal(prompt: string, sessionId: string): AsyncGenerator<SDKMessage, void, unknown> {
    console.log(`[Local] Resuming session: ${sessionId.slice(0, 8)}...`);
    return query({ prompt, options: { ...baseOptions, resume: sessionId } });
}
