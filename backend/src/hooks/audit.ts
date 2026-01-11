/**
 * Audit Hooks
 *
 * Log tool usage for debugging and monitoring.
 */

import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

export const auditLogger: HookCallback = async (input) => {
    if (input.hook_event_name === 'PreToolUse') {
        const data = input as PreToolUseHookInput;
        console.log(`[AUDIT] ${new Date().toISOString()} | ${data.tool_name}`);
    }
    return {};
};
