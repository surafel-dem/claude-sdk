import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Helper to get authenticated user ID from ctx.auth
async function getAuthUserId(ctx: any): Promise<string | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // The subject is the user ID in Better Auth
    return identity.subject;
}

// List all threads for current user
export const list = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        return await ctx.db
            .query("threads")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .take(50);
    },
});

// Get a specific thread
export const get = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) return null;

        return thread;
    },
});

// Create a new thread
export const create = mutation({
    args: { title: v.string() },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        return await ctx.db.insert("threads", {
            userId,
            title: args.title,
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

// Update thread title or status
export const update = mutation({
    args: {
        threadId: v.id("threads"),
        title: v.optional(v.string()),
        status: v.optional(v.union(v.literal("active"), v.literal("completed"), v.literal("archived"))),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) throw new Error("Not found");

        await ctx.db.patch(args.threadId, {
            ...(args.title && { title: args.title }),
            ...(args.status && { status: args.status }),
            updatedAt: Date.now(),
        });
    },
});

// Delete a thread
export const remove = mutation({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) throw new Error("Not found");

        // Delete all messages in thread
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .collect();
        for (const msg of messages) {
            await ctx.db.delete(msg._id);
        }

        // Delete all artifacts in thread
        const artifacts = await ctx.db
            .query("artifacts")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .collect();
        for (const artifact of artifacts) {
            await ctx.db.delete(artifact._id);
        }

        // Delete thread
        await ctx.db.delete(args.threadId);
    },
});
