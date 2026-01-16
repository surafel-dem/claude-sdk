import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// CORS handling is required for client side frameworks
authComponent.registerRoutes(http, createAuth, { cors: true });

// Generic mutation endpoint for all backend calls
const genericMutation = httpAction(async (ctx, request) => {
    const body = await request.json();
    const { path, args } = body;

    if (!path || !args) {
        return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const result = await ctx.runMutation(path as any, args);
        return new Response(
            JSON.stringify({ value: result }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        );
    } catch (error) {
        console.error(`[HTTP] Mutation ${path} failed:`, error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});

// Main mutation endpoint for backend
http.route({
    path: "/api/mutation",
    method: "POST",
    handler: genericMutation,
});

// Generic query endpoint for backend calls
const genericQuery = httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    const argsJson = url.searchParams.get("args");

    if (!path) {
        return new Response(
            JSON.stringify({ error: "Missing path parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const args = argsJson ? JSON.parse(argsJson) : {};
        const result = await ctx.runQuery(path as any, args);
        return new Response(
            JSON.stringify({ value: result }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        );
    } catch (error) {
        console.error(`[HTTP] Query ${path} failed:`, error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});

http.route({
    path: "/api/query",
    method: "GET",
    handler: genericQuery,
});

// CORS preflight for query
http.route({
    path: "/api/query",
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

// CORS preflight for mutation
http.route({
    path: "/api/mutation",
    method: "OPTIONS",
    handler: httpAction(async () => {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }),
});

// Alias for artifact updates (backward compat)
http.route({
    path: "/api/artifacts/update",
    method: "POST",
    handler: genericMutation,
});

// CORS preflight for artifacts/update
http.route({
    path: "/api/artifacts/update",
    method: "OPTIONS",
    handler: httpAction(async () => {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }),
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
        // Fetch messages for thread using internal query
        const messages = await ctx.runQuery("internal:listMessagesInternal" as any, { threadId });

        // Fetch artifacts for thread using internal query
        const artifacts = await ctx.runQuery("internal:listArtifactsInternal" as any, { threadId });

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
