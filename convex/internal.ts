import { v } from "convex/values";
import { query } from "./_generated/server";

// Internal query to list messages without auth check (for backend use)
export const listMessagesInternal = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("asc")
            .collect();
    },
});

// Internal query to list artifacts without auth check (for backend use)
export const listArtifactsInternal = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("artifacts")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("desc")
            .collect();
    },
});
