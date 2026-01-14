/**
 * Approval Hook
 * Pauses agent when spawning researcher, waits for user approval.
 */

import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

const waiters = new Map<string, (result: ApprovalResult) => void>();

export interface ApprovalResult {
    decision: 'approved' | 'rejected';
    plan?: string;
}

/** Create hook that intercepts Task(researcher) calls */
export function createApprovalHook(threadId: string): HookCallback {
    return async (input, toolUseId, { signal }) => {
        if (input.tool_name === 'Task' && input.tool_input?.subagent_type === 'researcher') {
            const approvalId = crypto.randomUUID();
            const plan = input.tool_input.prompt;

            // Notify external system (Convex, SSE, etc.)
            console.log(`[Approval] Request ${approvalId} pending for thread ${threadId}`);

            // Wait for user decision
            const result = await new Promise<ApprovalResult>((resolve) => {
                waiters.set(approvalId, resolve);
                setTimeout(() => {
                    waiters.delete(approvalId);
                    resolve({ decision: 'rejected', plan: 'timeout' });
                }, 10 * 60 * 1000);
            });

            waiters.delete(approvalId);

            if (result.decision === 'rejected') {
                return {
                    hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: 'deny',
                        permissionDecisionReason: 'User rejected the research plan',
                    },
                };
            }

            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                    updatedInput: {
                        ...input.tool_input,
                        prompt: result.plan || input.tool_input.prompt,
                    },
                },
            };
        }
        return {};
    };
}

/** Called by API when user approves/rejects */
export function resolve(id: string, result: ApprovalResult): void {
    waiters.get(id)?.(result);
}
