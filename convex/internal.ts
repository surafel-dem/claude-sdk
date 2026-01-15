import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

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

// Log tool call for audit trail
export const logToolCall = mutation({
    args: {
        threadId: v.string(),
        agentId: v.string(),
        agentType: v.string(),
        toolName: v.string(),
        input: v.any(),
        timestamp: v.number(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("toolCalls", args);
    },
});
