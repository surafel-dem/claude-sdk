/**
 * Approval System
 * 
 * Promise-based approval waiting for human-in-the-loop pattern.
 * Used by canUseTool to pause until user approves.
 */

type ApprovalResult = { approved: boolean; plan?: string };

const waiters = new Map<string, { resolve: (r: ApprovalResult) => void }>();

/** Create a waiter for a thread, returns promise that resolves when user approves */
export function createApprovalWaiter(threadId: string) {
    return {
        wait: () => new Promise<ApprovalResult>(resolve => {
            waiters.set(threadId, { resolve });
            // 60s timeout (SDK requirement)
            setTimeout(() => {
                if (waiters.has(threadId)) {
                    waiters.delete(threadId);
                    resolve({ approved: false });
                }
            }, 60_000);
        }),
    };
}

/** Resolve a pending approval (called from /api/approve endpoint) */
export function resolveApproval(threadId: string, approved: boolean, plan?: string) {
    const waiter = waiters.get(threadId);
    if (waiter) {
        waiter.resolve({ approved, plan });
        waiters.delete(threadId);
    }
}

/** Check if thread has pending approval */
export function hasPendingApproval(threadId: string): boolean {
    return waiters.has(threadId);
}
