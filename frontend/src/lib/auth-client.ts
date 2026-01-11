import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";

const baseURL = import.meta.env.VITE_CONVEX_SITE_URL;

// Debug logging
console.log('[Auth Client] Creating auth client with baseURL:', baseURL);

if (!baseURL) {
    console.error('[Auth Client] ERROR: VITE_CONVEX_SITE_URL is not set!');
}

export const authClient = createAuthClient({
    baseURL,
    plugins: [convexClient(), crossDomainClient()],
});

// Helper hooks and methods
export const { signIn, signUp, signOut, useSession } = authClient;
