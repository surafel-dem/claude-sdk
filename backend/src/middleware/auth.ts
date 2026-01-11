/**
 * Auth Middleware for Hono
 * 
 * Verifies Better Auth sessions from Convex.
 * The frontend sends auth token in Authorization header.
 */

import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

// User type from Better Auth
export interface AuthUser {
    id: string;
    email: string;
    name?: string;
    image?: string;
}

// Context variables
export interface AuthVariables {
    user: AuthUser | null;
}

// Convex site URL for verifying sessions
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || 'https://upbeat-starfish-443.convex.site';

/**
 * Verify session with Convex Better Auth
 */
async function verifySession(token: string): Promise<AuthUser | null> {
    try {
        // Call Convex Better Auth session endpoint
        const response = await fetch(`${CONVEX_SITE_URL}/api/auth/session`, {
            method: 'GET',
            headers: {
                'Cookie': `better-auth.session_token=${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            console.log('[Auth] Session verification failed:', response.status);
            return null;
        }

        const session = await response.json();

        if (session?.user) {
            return {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
                image: session.user.image,
            };
        }

        return null;
    } catch (error) {
        console.error('[Auth] Error verifying session:', error);
        return null;
    }
}

/**
 * Auth middleware - extracts and verifies token
 * Sets c.get('user') to the authenticated user or null
 */
export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
    async (c: Context, next: Next) => {
        // Try to get token from Authorization header or Cookie
        const authHeader = c.req.header('Authorization');
        const cookieHeader = c.req.header('Cookie');

        let token: string | null = null;

        // Check Authorization header (Bearer token)
        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.replace('Bearer ', '');
        }
        // Check for session cookie
        else if (cookieHeader) {
            const cookies = cookieHeader.split(';').map(c => c.trim());
            const sessionCookie = cookies.find(c => c.startsWith('better-auth.session_token='));
            if (sessionCookie) {
                token = sessionCookie.split('=')[1];
            }
        }

        if (token) {
            const user = await verifySession(token);
            c.set('user', user);
        } else {
            c.set('user', null);
        }

        await next();
    }
);

/**
 * Require authentication middleware
 * Returns 401 if not authenticated
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c: Context, next: Next) => {
        const user = c.get('user');

        if (!user) {
            return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
        }

        await next();
    }
);

/**
 * Optional auth middleware - doesn't block unauthenticated requests
 * Use authMiddleware first, then access c.get('user')
 */
export function getAuthUser(c: Context<{ Variables: AuthVariables }>): AuthUser | null {
    return c.get('user');
}
