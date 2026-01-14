/**
 * Subagent Tracker Hook
 * Logs subagent start/stop events for progress tracking.
 */

import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

export function createTracker(onProgress?: (event: { type: string; data: unknown }) => void) {
    return {
        stopHook: (async (input, toolUseId, { signal }) => {
            onProgress?.({
                type: 'subagent_stop',
                data: { agentType: input.agent_type, toolUseId },
            });
            return {};
        }) as HookCallback,
    };
}
