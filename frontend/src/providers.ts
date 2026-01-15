/**
 * Execution Mode Providers Configuration
 * 
 * Defines available execution modes and sandbox providers.
 */

export const EXECUTION_MODES = [
    { id: 'local', name: 'Local', icon: 'Monitor', group: null },
    { id: 'e2b', name: 'E2B', icon: 'Cloud', group: 'SANDBOXES' },
    { id: 'cloudflare', name: 'Cloudflare Workers', icon: 'Zap', group: 'SANDBOXES', disabled: true },
    { id: 'daytona', name: 'Daytona', icon: 'Server', group: 'SANDBOXES', disabled: true },
] as const;

export type ExecutionModeId = typeof EXECUTION_MODES[number]['id'];

// Helper to get mode config by id
export function getModeConfig(id: ExecutionModeId) {
    return EXECUTION_MODES.find(m => m.id === id);
}

// Helper to check if mode is a sandbox
export function isSandbox(id: ExecutionModeId): boolean {
    const mode = getModeConfig(id);
    return mode?.group === 'SANDBOXES';
}
