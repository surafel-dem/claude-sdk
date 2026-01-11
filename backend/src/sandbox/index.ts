/**
 * Sandbox Module
 *
 * Switches between local, E2B, and hybrid execution modes.
 * 
 * Modes:
 * - local: Direct execution on local machine
 * - e2b: Full E2B sandbox for all operations
 * - hybrid: Orchetrator (fast, no sandbox) + Researcher (E2B when needed)
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { runLocal, resumeLocal } from './local.js';
import { runInE2B, resumeInE2B } from './e2b.js';
import { hybridAgent, chatMode, orchestratorChat, researcherExecute } from './hybrid.js';

export type SandboxMode = 'local' | 'e2b' | 'hybrid';

export function getMode(): SandboxMode {
    const mode = process.env.SANDBOX_MODE?.toLowerCase();
    if (mode === 'e2b') return 'e2b';
    if (mode === 'hybrid') return 'hybrid';
    return 'local';
}

export function runAgent(prompt: string): AsyncGenerator<SDKMessage, void, unknown> {
    return getMode() === 'e2b' ? runInE2B(prompt) : runLocal(prompt);
}

export function resumeAgent(prompt: string, sessionId: string): AsyncGenerator<SDKMessage, void, unknown> {
    return getMode() === 'e2b' ? resumeInE2B(prompt, sessionId) : resumeLocal(prompt, sessionId);
}

// Export hybrid mode functions
export { hybridAgent, chatMode, orchestratorChat, researcherExecute };
