/**
 * Progress Hooks
 *
 * Track subagent start/stop for UI updates.
 */

import type {
    HookCallback,
    SubagentStartHookInput,
    SubagentStopHookInput,
} from '@anthropic-ai/claude-agent-sdk';

type ProgressEvent = {
    type: 'subagent_start' | 'subagent_stop';
    agentId?: string;
    agentType?: string;
};

type ProgressCallback = (event: ProgressEvent) => void;

export function createProgressHooks(onProgress: ProgressCallback) {
    const tracker: HookCallback = async (input) => {
        if (input.hook_event_name === 'SubagentStart') {
            const data = input as SubagentStartHookInput;
            onProgress({
                type: 'subagent_start',
                agentId: data.agent_id,
                agentType: data.agent_type,
            });
        }

        if (input.hook_event_name === 'SubagentStop') {
            onProgress({ type: 'subagent_stop' });
        }

        return {};
    };

    return {
        SubagentStart: [{ hooks: [tracker] }],
        SubagentStop: [{ hooks: [tracker] }],
    };
}
