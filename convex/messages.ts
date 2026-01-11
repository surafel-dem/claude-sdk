import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Helper to get authenticated user ID from ctx.auth
async function getAuthUserId(ctx: any): Promise<string | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return identity.subject;
}

// List messages for a thread
export const list = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        // Verify user owns the thread
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) return [];

        return await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("asc")
            .collect();
    },
});

// Send a message
export const send = mutation({
    args: {
        threadId: v.id("threads"),
        role: v.string(),
        content: v.string(),
        artifactIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Verify user owns the thread
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) throw new Error("Not found");

        // Update thread title from first user message if it's generic
        if (args.role === "user" && thread.title === "Research") {
            const preview = args.content.slice(0, 50) + (args.content.length > 50 ? "..." : "");
            await ctx.db.patch(args.threadId, {
                title: preview,
                updatedAt: Date.now()
            });
        }

        return await ctx.db.insert("messages", {
            threadId: args.threadId,
            role: args.role,
            content: args.content,
            artifactIds: args.artifactIds,
            createdAt: Date.now(),
        });
    },
});

// Get a specific message
export const get = query({
    args: { messageId: v.id("messages") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.messageId);
    },
});
