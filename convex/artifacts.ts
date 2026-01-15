import { v } from "convex/values";
import { query, mutation, httpAction } from "./_generated/server";

// Helper to get authenticated user ID from ctx.auth
async function getAuthUserId(ctx: any): Promise<string | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return identity.subject;
}

// Create a new artifact
export const create = mutation({
    args: {
        threadId: v.string(),  // Accept string since backend sends convex ID as string
        type: v.string(),
        title: v.string(),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        // Parse threadId - it might be a raw Convex ID string
        let threadId;
        try {
            // If it's a valid ID, use it directly
            threadId = args.threadId as any;
        } catch {
            throw new Error("Invalid thread ID");
        }

        return await ctx.db.insert("artifacts", {
            threadId,
            type: args.type,
            title: args.title,
            content: args.content,
            status: "draft",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

// Update an artifact
export const update = mutation({
    args: {
        id: v.string(),
        content: v.optional(v.string()),
        status: v.optional(v.string()),
    },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, args) => {
        // Normalize string to Convex ID
        const artifactId = ctx.db.normalizeId("artifacts", args.id);
        if (!artifactId) {
            console.error("[artifacts:update] Invalid ID:", args.id);
            return null;
        }

        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (args.content !== undefined) updates.content = args.content;
        if (args.status !== undefined) updates.status = args.status;

        await ctx.db.patch(artifactId, updates);
        return args.id;
    },
});

// Get artifacts for a thread
export const listByThread = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("artifacts")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("desc")
            .collect();
    },
});

// Get a specific artifact
export const get = query({
    args: { id: v.id("artifacts") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// HTTP action for creating artifacts from backend
export const createHttp = httpAction(async (ctx, request) => {
    const body = await request.json();

    const { threadId, type, title, content } = body.args || body;

    if (!threadId || !type || !title || !content) {
        return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const id = await ctx.runMutation("artifacts:create" as any, {
            threadId,
            type,
            title,
            content,
        });

        return new Response(
            JSON.stringify({ value: id }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
