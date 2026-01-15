/**
 * Sandbox Provider Types
 * 
 * Shared types for all sandbox providers (E2B, Cloudflare, Daytona, etc.)
 */

export type SandboxProvider = 'e2b' | 'cloudflare' | 'daytona';

export type StreamEvent = {
    type: string;
    content: string;
    data?: unknown;
};

export type SandboxRunOptions = {
    threadId: string;
    task: string;
    abortController?: AbortController;
};

export type SandboxRunner = (
    options: SandboxRunOptions
) => AsyncGenerator<StreamEvent>;
