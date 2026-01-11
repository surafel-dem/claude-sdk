import { query } from "./_generated/server";
import { authComponent } from "./auth";

// Get current authenticated user from Better Auth with full user data
export const current = query({
    args: {},
    handler: async (ctx) => {
        // getAuthUser validates the session and returns the user
        return await authComponent.getAuthUser(ctx);
    },
});

// Get just the user identity (faster, no session validation)
export const identity = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.auth.getUserIdentity();
    },
});
