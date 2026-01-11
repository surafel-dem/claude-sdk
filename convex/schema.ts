import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
    // Auth tables from Better Auth
    ...authTables,

    // Threads table
    threads: defineTable({
        userId: v.string(),
        title: v.string(),
        status: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Messages table
    messages: defineTable({
        threadId: v.id("threads"),
        role: v.string(),
        content: v.string(),
        artifactIds: v.optional(v.array(v.string())),  // Associated artifact IDs
        createdAt: v.number(),
    }).index("by_thread", ["threadId"]),

    // Artifacts table - research plans and reports
    artifacts: defineTable({
        threadId: v.any(),  // Can be string or id, flexible for HTTP calls
        type: v.string(),   // 'plan' or 'report'
        title: v.string(),
        content: v.string(),
        status: v.string(), // 'draft', 'approved', 'complete'
        version: v.optional(v.number()),  // Optional version for edits
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index("by_thread", ["threadId"]),
});
