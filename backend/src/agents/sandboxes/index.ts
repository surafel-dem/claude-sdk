/**
 * Sandbox Registry — Routes to Provider-Specific Runners
 * 
 * Central registry for all sandbox providers. When a new provider
 * is added, register it here and create its runner file.
 */

import { runE2B } from './e2b-runner.js';
import type { SandboxProvider, SandboxRunner, SandboxRunOptions, StreamEvent } from './types.js';

// Provider registry - add new providers here
const SANDBOX_RUNNERS: Record<SandboxProvider, SandboxRunner> = {
    e2b: runE2B,
    cloudflare: notImplemented('Cloudflare Workers'),
    daytona: notImplemented('Daytona'),
};

/**
 * Run the selected sandbox provider
 */
export async function* runSandbox(
    provider: SandboxProvider,
    options: SandboxRunOptions
): AsyncGenerator<StreamEvent> {
    const runner = SANDBOX_RUNNERS[provider];

    if (!runner) {
        yield { type: 'error', content: `Unknown sandbox provider: ${provider}` };
        return;
    }

    yield* runner(options);
}

/**
 * Placeholder for unimplemented providers
 */
function notImplemented(name: string): SandboxRunner {
    return async function* () {
        yield { type: 'error', content: `${name} sandbox is not yet implemented. Coming soon!` };
        yield { type: 'done', content: 'not_implemented' };
    };
}

// Re-export types for convenience
export * from './types.js';
