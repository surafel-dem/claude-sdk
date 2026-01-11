import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { createHttp as createArtifact } from "./artifacts";

const http = httpRouter();

// CORS handling is required for client side frameworks
authComponent.registerRoutes(http, createAuth, { cors: true });

// Artifact creation endpoint for backend
http.route({
    path: "/api/mutation",
    method: "POST",
    handler: createArtifact,
});

// Get thread history (messages + artifacts) for backend context
const getThreadHistory = httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");

    if (!threadId) {
        return new Response(
            JSON.stringify({ error: "threadId required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        // Fetch messages for thread
        const messages = await ctx.runQuery("messages:list" as any, { threadId });

        // Fetch artifacts for thread  
        const artifacts = await ctx.runQuery("artifacts:listByThread" as any, { threadId });

        return new Response(
            JSON.stringify({
                messages: messages || [],
                artifacts: artifacts || []
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});

http.route({
    path: "/api/thread-history",
    method: "GET",
    handler: getThreadHistory,
});

// CORS preflight for thread-history
http.route({
    path: "/api/thread-history",
    method: "OPTIONS",
    handler: httpAction(async () => {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }),
});

export default http;
