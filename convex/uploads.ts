import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
    args: {
        threadId: v.id("threads"),
        fileName: v.string(),
        fileType: v.string(),
        fileSize: v.number(),
        storagePath: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("uploads", {
            ...args,
            createdAt: Date.now(),
        });
    },
});

export const list = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("uploads")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .collect();
    },
});

export const remove = mutation({
    args: { id: v.id("uploads") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    },
});
