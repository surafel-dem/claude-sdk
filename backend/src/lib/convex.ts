/**
 * Convex HTTP Client
 *
 * HTTP client for Convex operations: artifacts, sessions, tool calls.
 */

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const CONVEX_CLOUD_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

const getBaseUrl = () => {
    if (CONVEX_SITE_URL) return CONVEX_SITE_URL;
    if (CONVEX_CLOUD_URL) return CONVEX_CLOUD_URL.replace('.cloud', '.site');
    return null;
};

const BASE_URL = getBaseUrl();
console.log('[Convex] URL:', BASE_URL ? BASE_URL.slice(0, 40) + '...' : 'NOT SET');

// Generic mutation helper
async function mutation<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
    if (!BASE_URL) return null;
    try {
        const response = await fetch(`${BASE_URL}/api/mutation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, args }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Convex] ${path} failed:`, response.status, errorText);
            return null;
        }
        const result = await response.json();
        return result.value ?? result;
    } catch (e) {
        console.error(`[Convex] ${path} error:`, e);
        return null;
    }
}

// =============================================================================
// Artifacts
// =============================================================================

export async function createArtifact(
    threadId: string,
    type: string,
    title: string,
    content: string
): Promise<{ id: string } | null> {
    const result = await mutation<string>('artifacts:create', { threadId, type, title, content });
    return result ? { id: result } : null;
}

export async function updateArtifact(
    artifactId: string,
    updates: { content?: string; status?: string }
): Promise<boolean> {
    // Use the dedicated update endpoint
    if (!BASE_URL) return false;
    try {
        const response = await fetch(`${BASE_URL}/api/artifacts/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'artifacts:update', args: { id: artifactId, ...updates } }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Convex] artifacts:update failed:`, response.status, errorText);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[Convex] artifacts:update error:`, e);
        return false;
    }
}

// =============================================================================
// Sessions
// =============================================================================

export interface Session {
    threadId: string;
    sdkSessionId: string;
    phase: string;
    plan?: string;
    mode: string;
    provider?: string;  // Sandbox provider (e2b, cloudflare, daytona)
}

export async function getSession(threadId: string): Promise<Session | null> {
    if (!BASE_URL) return null;
    try {
        const params = new URLSearchParams();
        params.set('path', 'sessions:getByThread');
        params.set('args', JSON.stringify({ threadId }));

        const response = await fetch(`${BASE_URL}/api/query?${params}`);
        if (!response.ok) {
            console.log(`[Convex] sessions:getByThread failed for ${threadId}: ${response.status}`);
            return null;
        }

        const result = await response.json();
        const session = result.value ?? result;
        if (session) {
            console.log(`[Convex] Found session for ${threadId}: phase=${session.phase}`);
        }
        return session;
    } catch (e) {
        console.error(`[Convex] sessions:getByThread error:`, e);
        return null;
    }
}

export async function upsertSession(session: Session): Promise<string | null> {
    return mutation<string>('sessions:upsert', session);
}

export async function updateSessionPhase(
    threadId: string,
    phase: string,
    plan?: string
): Promise<boolean> {
    const result = await mutation('sessions:updatePhase', { threadId, phase, plan });
    return result !== null;
}

// =============================================================================
// Tool Calls (Audit Trail)
// =============================================================================

export async function logToolCall(
    threadId: string,
    agentId: string,
    agentType: string,
    toolName: string,
    input: unknown
): Promise<boolean> {
    const result = await mutation('internal:logToolCall', {
        threadId,
        agentId,
        agentType,
        toolName,
        input,
        timestamp: Date.now(),
    });
    return result !== null;
}

// =============================================================================
// Thread History
// =============================================================================

export interface ThreadHistory {
    messages: Array<{ role: string; content: string; createdAt: number }>;
    artifacts: Array<{ type: string; title: string; content: string; createdAt: number }>;
}

export async function getThreadHistory(threadId: string): Promise<ThreadHistory | null> {
    if (!BASE_URL) return null;
    try {
        const response = await fetch(`${BASE_URL}/api/thread-history?threadId=${encodeURIComponent(threadId)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

// =============================================================================
// Uploads
// =============================================================================

export async function createUpload(
    threadId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    storagePath: string
): Promise<{ id: string } | null> {
    const result = await mutation<string>('uploads:create', {
        threadId,
        fileName,
        fileType,
        fileSize,
        storagePath,
    });
    return result ? { id: result } : null;
}

export interface UploadFile {
    _id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    storagePath: string;
}

export async function getUploads(threadId: string): Promise<UploadFile[]> {
    if (!BASE_URL) return [];

    // Skip query for non-Convex IDs (UUIDs, etc.) - they won't have uploads
    // Convex IDs are typically 25-32 alphanumeric characters without hyphens
    if (threadId.includes('-') || threadId.length < 20) {
        return [];
    }

    try {
        const params = new URLSearchParams();
        params.set('path', 'uploads:list');
        params.set('args', JSON.stringify({ threadId }));

        const response = await fetch(`${BASE_URL}/api/query?${params}`);
        if (!response.ok) {
            console.log(`[Convex] uploads:list failed for ${threadId}: ${response.status}`);
            return [];
        }

        const result = await response.json();
        return result.value ?? result ?? [];
    } catch (e) {
        console.error(`[Convex] uploads:list error for ${threadId}:`, e);
        return [];
    }
}
