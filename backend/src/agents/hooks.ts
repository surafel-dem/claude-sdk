/**
 * Agent Hooks — SDK Lifecycle Interceptors
 *
 * Provides observability and control over agent execution.
 * Uses SDK hook patterns for logging, tracking, and notifications.
 */

import type {
    HookCallback,
    PreToolUseHookInput,
    PostToolUseHookInput,
} from '@anthropic-ai/claude-agent-sdk';

export type ToolEvent = {
    toolName: string;
    input: unknown;
    timestamp: number;
    toolUseId: string | null;
};

export type ToolResult = {
    toolName: string;
    response: unknown;
    timestamp: number;
    toolUseId: string | null;
};

export type HookEventHandler = {
    onToolStart?: (event: ToolEvent) => void;
    onToolEnd?: (result: ToolResult) => void;
    onNotification?: (message: string, type: string) => void;
};

/**
 * Create SDK-compatible hooks with event handlers
 */
export function createHooks(handlers: HookEventHandler) {
    const preToolUse: HookCallback = async (input, toolUseId) => {
        const preInput = input as PreToolUseHookInput;

        handlers.onToolStart?.({
            toolName: preInput.tool_name,
            input: preInput.tool_input,
            timestamp: Date.now(),
            toolUseId,
        });

        // Allow all operations (logging only)
        return {};
    };

    const postToolUse: HookCallback = async (input, toolUseId) => {
        const postInput = input as PostToolUseHookInput;

        handlers.onToolEnd?.({
            toolName: postInput.tool_name,
            response: postInput.tool_response,
            timestamp: Date.now(),
            toolUseId,
        });

        return {};
    };

    const notification: HookCallback = async (input) => {
        const notifInput = input as { message?: string; notification_type?: string };

        handlers.onNotification?.(
            notifInput.message || '',
            notifInput.notification_type || 'info'
        );

        return {};
    };

    return {
        PreToolUse: [{ hooks: [preToolUse] }],
        PostToolUse: [{ hooks: [postToolUse] }],
        Notification: [{ hooks: [notification] }],
    };
}

/**
 * Create hooks that emit to a stream event callback
 */
export function createStreamingHooks(emit: (event: { type: string; content: string; data?: unknown }) => void) {
    return createHooks({
        onToolStart: (event) => {
            emit({
                type: 'tool_start',
                content: event.toolName,
                data: { name: event.toolName, input: event.input, toolUseId: event.toolUseId },
            });
        },
        onToolEnd: (result) => {
            emit({
                type: 'tool_end',
                content: result.toolName,
                data: { name: result.toolName, toolUseId: result.toolUseId },
            });
        },
        onNotification: (message, type) => {
            emit({
                type: 'notification',
                content: message,
                data: { notificationType: type },
            });
        },
    });
}
