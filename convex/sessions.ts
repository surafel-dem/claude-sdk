import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get session by threadId
export const getByThread = query({
    args: { threadId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sessions")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .first();
    },
});

// Create or update session
export const upsert = mutation({
    args: {
        threadId: v.string(),
        sdkSessionId: v.string(),
        phase: v.string(),
        plan: v.optional(v.string()),
        mode: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("sessions")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .first();

        const now = Date.now();

        if (existing) {
            await ctx.db.patch(existing._id, {
                sdkSessionId: args.sdkSessionId,
                phase: args.phase,
                ...(args.plan !== undefined && { plan: args.plan }),
                mode: args.mode,
                updatedAt: now,
            });
            return existing._id;
        }

        return await ctx.db.insert("sessions", {
            threadId: args.threadId,
            sdkSessionId: args.sdkSessionId,
            phase: args.phase,
            plan: args.plan,
            mode: args.mode,
            createdAt: now,
            updatedAt: now,
        });
    },
});

// Update session phase
export const updatePhase = mutation({
    args: {
        threadId: v.string(),
        phase: v.string(),
        plan: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .first();

        if (!session) return null;

        await ctx.db.patch(session._id, {
            phase: args.phase,
            ...(args.plan !== undefined && { plan: args.plan }),
            updatedAt: Date.now(),
        });

        return session._id;
    },
});
