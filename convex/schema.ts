import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
    ...authTables,

    threads: defineTable({
        userId: v.string(),
        title: v.string(),
        status: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    messages: defineTable({
        threadId: v.id("threads"),
        role: v.string(),
        content: v.string(),
        artifactIds: v.optional(v.array(v.string())),
        createdAt: v.number(),
    }).index("by_thread", ["threadId"]),

    artifacts: defineTable({
        threadId: v.any(),
        type: v.string(),
        title: v.string(),
        content: v.string(),
        status: v.string(),
        version: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_thread", ["threadId"]),

    // Approval requests for human-in-the-loop
    approvalRequests: defineTable({
        threadId: v.string(),
        planContent: v.string(),
        status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
        createdAt: v.number(),
        resolvedAt: v.optional(v.number()),
    }).index("by_thread", ["threadId"]),

    // Tool call audit trail
    toolCalls: defineTable({
        threadId: v.string(),
        agentId: v.string(),
        agentType: v.string(),
        toolName: v.string(),
        input: v.any(),
        timestamp: v.number(),
    }).index("by_thread", ["threadId"]),
});
