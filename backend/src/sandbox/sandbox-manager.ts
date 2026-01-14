/**
 * E2B Sandbox Manager
 * 
 * Handles sandbox lifecycle with proper ESM module resolution.
 * Uses hybrid-v2.ts pattern with needsSetup flag.
 */

/// <reference types="node" />
import { Sandbox } from '@e2b/code-interpreter';

const TEMPLATE_ALIAS = 'claude-research-agent-v1';
const E2B_WORKSPACE = '/home/user/workspace';
const sandboxStore = new Map<string, string>(); // sessionId -> sandboxId

interface SandboxResult {
    sandbox: Sandbox;
    sessionId: string;
    isNew: boolean;
    needsSetup: boolean;
}

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] [E2B] [${level}] ${message}`, data ? JSON.stringify(data) : '');
}

/** Get or resume sandbox for session */
export async function getSandbox(sessionId?: string): Promise<SandboxResult> {
    log('INFO', '=== getSandbox called ===', { sessionId: sessionId?.slice(0, 8) });

    const envs = {
        // Support both API_KEY and AUTH_TOKEN for compatibility
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    };

    log('INFO', 'Sandbox envs', {
        hasApiKey: !!envs.ANTHROPIC_API_KEY,
        baseUrl: envs.ANTHROPIC_BASE_URL || '(default)',
        model: envs.ANTHROPIC_MODEL
    });

    // Try to resume existing sandbox
    if (sessionId && sandboxStore.has(sessionId)) {
        const existingId = sandboxStore.get(sessionId)!;
        log('INFO', 'Found existing sandbox, trying to resume', { sandboxId: existingId.slice(0, 8) });
        try {
            const sandbox = await Sandbox.connect(existingId, { timeoutMs: 10 * 60 * 1000 });
            log('INFO', 'Sandbox resumed successfully');
            return { sandbox, sessionId, isNew: false, needsSetup: false };
        } catch (err) {
            log('WARN', 'Failed to resume, will create new', { error: String(err).slice(0, 50) });
            sandboxStore.delete(sessionId);
        }
    }

    // Create new sandbox
    const newId = sessionId || crypto.randomUUID();

    try {
        // Try custom template (SDK already installed locally)
        log('INFO', `Trying custom template: ${TEMPLATE_ALIAS}`);
        const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });

        sandboxStore.set(newId, sandbox.sandboxId);
        log('INFO', 'Sandbox created from template (no setup needed)', { sandboxId: sandbox.sandboxId.slice(0, 8) });
        return { sandbox, sessionId: newId, isNew: true, needsSetup: false };

    } catch (err) {
        // Fallback to base template (needs SDK install)
        log('WARN', `Template failed: ${String(err).slice(0, 50)}. Using base template...`);

        const sandbox = await Sandbox.betaCreate({
            timeoutMs: 10 * 60 * 1000,
            autoPause: true,
            envs,
        });

        sandboxStore.set(newId, sandbox.sandboxId);
        log('INFO', 'Sandbox created from base (needs setup)', { sandboxId: sandbox.sandboxId.slice(0, 8) });
        return { sandbox, sessionId: newId, isNew: true, needsSetup: true };
    }
}

/** Setup sandbox - install SDK locally for ESM resolution */
export async function setupSandbox(sandbox: Sandbox): Promise<void> {
    log('INFO', 'Setting up workspace...');
    await sandbox.commands.run(`mkdir -p ${E2B_WORKSPACE}`);

    // CRITICAL: Local npm install for ESM module resolution
    log('INFO', 'Installing SDK locally in /home/user (this may take ~30s)...');
    const result = await sandbox.commands.run(
        'cd /home/user && npm init -y && npm install @anthropic-ai/claude-agent-sdk',
        { timeoutMs: 120000 }
    );

    if (result.exitCode !== 0) {
        log('ERROR', 'SDK install failed', { exitCode: result.exitCode, stderr: result.stderr.slice(0, 200) });
        throw new Error(`SDK install failed: ${result.stderr}`);
    }

    // Verify installation
    const verify = await sandbox.commands.run('ls /home/user/node_modules/@anthropic-ai');
    log('INFO', 'Setup complete', { modules: verify.stdout.trim() });
}

/** Pause sandbox for reuse */
export async function pause(sandboxId: string): Promise<void> {
    log('INFO', 'Pausing sandbox...', { sandboxId: sandboxId.slice(0, 8) });
    try {
        await Sandbox.betaPause(sandboxId);
        log('INFO', 'Sandbox paused');
    } catch (err) {
        log('WARN', 'Failed to pause, killing instead', { error: String(err).slice(0, 50) });
        await Sandbox.kill(sandboxId).catch(() => { });
    }
}

/** Kill sandbox immediately */
export async function kill(sandboxId: string): Promise<void> {
    await Sandbox.kill(sandboxId).catch(() => { });
}

/** Check if session exists */
export function hasSession(sessionId: string): boolean {
    return sandboxStore.has(sessionId);
}
