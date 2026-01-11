/**
 * Convex HTTP Client
 * 
 * Simple HTTP client for creating artifacts in Convex from the backend.
 */

declare const process: { env: Record<string, string | undefined> };

// Check multiple possible env var names
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;  // Already correct format (*.convex.site)
const CONVEX_CLOUD_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;  // Cloud URL (*.convex.cloud)

// Use site URL if available, otherwise convert cloud URL to site URL
const getApiUrl = () => {
    if (CONVEX_SITE_URL) {
        return `${CONVEX_SITE_URL}/api/mutation`;
    }
    if (CONVEX_CLOUD_URL) {
        return `${CONVEX_CLOUD_URL.replace('.cloud', '.site')}/api/mutation`;
    }
    return null;
};

const API_URL = getApiUrl();
console.log('[Convex Client] API URL:', API_URL ? API_URL.slice(0, 40) + '...' : 'NOT SET');

interface ArtifactResult {
    id: string;
}

/**
 * Create an artifact in Convex via HTTP mutation
 */
export async function createArtifact(
    threadId: string,
    type: string,
    title: string,
    content: string
): Promise<ArtifactResult | null> {
    if (!API_URL) {
        console.warn('[Convex] No CONVEX_URL configured, skipping artifact creation');
        return null;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: 'artifacts:create',
                args: {
                    threadId,
                    type,
                    title,
                    content,
                },
            }),
        });

        if (!response.ok) {
            console.error('[Convex] Failed to create artifact:', response.status);
            return null;
        }

        const result = await response.json();
        return { id: result.value || result };
    } catch (error) {
        console.error('[Convex] Error creating artifact:', error);
        return null;
    }
}

/**
 * Update an artifact in Convex
 */
export async function updateArtifact(
    artifactId: string,
    updates: { content?: string; status?: string }
): Promise<boolean> {
    if (!API_URL) {
        return false;
    }

    try {
        // Use same API_URL but for update path
        const updateUrl = API_URL.replace('/api/mutation', '/api/update');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: 'artifacts:update',
                args: {
                    id: artifactId,
                    ...updates,
                },
            }),
        });

        return response.ok;
    } catch (error) {
        console.error('[Convex] Error updating artifact:', error);
        return false;
    }
}

/**
 * Fetch thread history (messages + artifacts) from Convex
 */
export interface ThreadHistory {
    messages: Array<{ role: string; content: string; createdAt: number }>;
    artifacts: Array<{ type: string; title: string; content: string; createdAt: number }>;
}

export async function getThreadHistory(threadId: string): Promise<ThreadHistory | null> {
    if (!API_URL) {
        console.warn('[Convex] No CONVEX_URL configured, cannot fetch history');
        return null;
    }

    try {
        // Use the site URL for query endpoint
        const historyUrl = API_URL.replace('/api/mutation', '/api/thread-history');
        const urlWithParams = `${historyUrl}?threadId=${encodeURIComponent(threadId)}`;

        console.log('[Convex] Fetching thread history...');

        const response = await fetch(urlWithParams, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            console.error('[Convex] Failed to fetch history:', response.status);
            return null;
        }

        const data = await response.json();
        console.log(`[Convex] Loaded ${data.messages?.length || 0} messages, ${data.artifacts?.length || 0} artifacts`);
        return data;
    } catch (error) {
        console.error('[Convex] Error fetching thread history:', error);
        return null;
    }
}
