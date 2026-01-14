/**
 * Exa Search MCP Server
 * 
 * Provides web search capabilities using Exa API.
 * Replaces the failing SDK WebSearch tool.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import Exa from "exa-js";

// Initialize Exa client
const getExaClient = () => {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
        throw new Error("EXA_API_KEY environment variable is not set");
    }
    return new Exa(apiKey);
};

// Sanitize text to prevent JSON parsing errors
const sanitizeText = (text: string | null | undefined, maxLength: number = 300): string | null => {
    if (!text) return null;
    // Remove control characters and normalize whitespace
    let clean = text
        .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control characters
        .replace(/\s+/g, ' ')               // Normalize whitespace
        .trim();
    // Truncate and add ellipsis
    if (clean.length > maxLength) {
        clean = clean.slice(0, maxLength) + '...';
    }
    return clean;
};

/**
 * Exa Search MCP Server
 * Provides neural search capabilities for research
 */
export const exaSearchTools = createSdkMcpServer({
    name: "exa-search",
    version: "1.0.0",
    tools: [
        tool(
            "search",
            "Search the web using Exa's neural search. Use for finding current information, research papers, and articles.",
            {
                query: z.string().describe("The search query - use natural language for best results"),
                num_results: z.number().min(1).max(10).default(5).describe("Number of results to return"),
                include_text: z.boolean().default(true).describe("Include text snippets from results")
            },
            async (args) => {
                try {
                    const exa = getExaClient();

                    const searchOptions: any = {
                        type: "neural",
                        numResults: args.num_results,
                        useAutoprompt: true,
                    };

                    // Include text content
                    if (args.include_text) {
                        searchOptions.contents = {
                            text: {
                                maxCharacters: 1000
                            }
                        };
                    }

                    console.log(`[exa] Searching: "${args.query}" (${args.num_results} results)`);
                    const results = await exa.searchAndContents(args.query, searchOptions);

                    // Format results with sanitized text
                    const formattedResults = {
                        query: args.query,
                        autoprompt: (results as any).autopromptString || null,
                        total_results: results.results.length,
                        results: results.results.map((r: any) => ({
                            title: sanitizeText(r.title, 200) || "Untitled",
                            url: r.url,
                            published_date: r.publishedDate || "Unknown",
                            text: sanitizeText(r.text, 300)
                        }))
                    };

                    console.log(`[exa] Found ${results.results.length} results`);

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(formattedResults, null, 2)
                        }]
                    };
                } catch (error: any) {
                    console.error(`[exa] Search error: ${error.message}`);
                    return {
                        content: [{
                            type: "text",
                            text: `Error performing search: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        ),

        tool(
            "get_contents",
            "Get full content from specific URLs. Use after search to get more details from promising results.",
            {
                urls: z.array(z.string()).min(1).max(5).describe("URLs to fetch content from (max 5)")
            },
            async (args) => {
                try {
                    const exa = getExaClient();

                    console.log(`[exa] Fetching contents for ${args.urls.length} URLs`);
                    const contents = await exa.getContents(args.urls, {
                        text: {
                            maxCharacters: 2000
                        }
                    });

                    const formattedContents = {
                        total_documents: contents.results.length,
                        documents: contents.results.map((doc: any) => ({
                            url: doc.url,
                            title: sanitizeText(doc.title, 200) || "Untitled",
                            text: sanitizeText(doc.text, 1500)
                        }))
                    };

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(formattedContents, null, 2)
                        }]
                    };
                } catch (error: any) {
                    console.error(`[exa] Content fetch error: ${error.message}`);
                    return {
                        content: [{
                            type: "text",
                            text: `Error fetching contents: ${error.message}`
                        }],
                        isError: true
                    };
                }
            }
        )
    ]
});

export default exaSearchTools;
