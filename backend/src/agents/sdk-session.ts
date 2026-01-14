/**
 * Agent Session with Approval Flow
 * Uses native SDK session management and subagent definitions.
 */

import { query, ClaudeAgentOptions, AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

// Subagent prompts
const RESEARCHER_PROMPT = `You are a research assistant. Search the web and write findings.

Goal: {goal}

Search for information and write concise notes to files/research_notes/*.md with:
- Key findings
- Source URLs
- Brief analysis

Provide a summary of what you found.`;

const REPORT_WRITER_PROMPT = `You are a report writer. Read research notes from files/research_notes/ and create a comprehensive report.

Format:
- Executive summary
- Key findings with sources
- Analysis and implications
- Conclusion

Write the report to files/reports/*.md.`;

const LEAD_PROMPT = `You are a research coordinator.

When given a research topic:
1. Create a brief research plan with this format:
   ## Research: [Topic]
   **Goal**: One sentence goal
   **Search**: [search query]

2. Wait for user approval before proceeding

3. After approval, delegate to subagents:
   - Use Task tool with subagent_type="researcher" to conduct research
   - Use Task tool with subagent_type="reportWriter" to write the final report

Rules:
- Only use Task tool for subagent delegation
- Keep plans concise (under 100 words)
- The researcher will search the web and write findings
- The reportWriter will create a comprehensive report`;

// Define subagents
export const agents = {
    researcher: {
        description: 'Gathers research via web search and writes findings.',
        tools: ['WebSearch', 'Write'],
        prompt: RESEARCHER_PROMPT,
        model: 'haiku'
    } as AgentDefinition,
    reportWriter: {
        description: 'Creates comprehensive reports from research notes.',
        tools: ['Read', 'Write', 'Glob'],
        prompt: REPORT_WRITER_PROMPT,
        model: 'haiku'
    } as AgentDefinition,
};

export interface ApprovalState {
    pending: boolean;
    plan: string | null;
}

export class AgentSession {
    public readonly threadId: string;
    private sessionId: string | null = null;
    private isRunning = false;
    private approvalState: ApprovalState = { pending: false, plan: null };

    constructor(threadId: string) {
        this.threadId = threadId;
    }

    async *start(initialPrompt: string, onPlan?: (plan: string) => void) {
        this.isRunning = true;
        let planDetected: string | null = null;

        const options: ClaudeAgentOptions = {
            permissionMode: 'bypassPermissions',
            systemPrompt: LEAD_PROMPT,
            allowedTools: ['Task'],
            agents: agents,
            model: 'sonnet',  // Use sonnet for better orchestration
            maxTurns: 50,
        };

        console.log(`[Session] Starting with prompt: ${initialPrompt.substring(0, 50)}...`);

        for await (const message of query({ prompt: initialPrompt, options })) {
            // Capture session ID on first message
            if (!this.sessionId && message.type === 'system' && (message as any).subtype === 'init') {
                this.sessionId = (message as any).session_id;
                console.log(`[Session] Created: ${this.sessionId}`);
            }

            // Check for plan in assistant messages
            if (message.type === 'assistant') {
                const content = (message as any).message?.content;

                if (typeof content === 'string') {
                    if (content.includes('## Research:')) {
                        const planMatch = content.match(/## Research:[\s\S]*?(?=\n\n|$)/);
                        if (planMatch) {
                            planDetected = planMatch[0];
                            this.approvalState = { pending: true, plan: planDetected };
                            console.log(`[Session] Plan detected, waiting for approval`);
                            onPlan?.(planDetected);
                        }
                    }
                } else if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text' && block.text?.includes('## Research:')) {
                            const planMatch = block.text.match(/## Research:[\s\S]*?(?=\n\n|$)/);
                            if (planMatch) {
                                planDetected = planMatch[0];
                                this.approvalState = { pending: true, plan: planDetected };
                                console.log(`[Session] Plan detected, waiting for approval`);
                                onPlan?.(planDetected);
                            }
                        }
                        // Log tool use
                        if (block.type === 'tool_use' && block.name === 'Task') {
                            console.log(`[Session] Task tool call: ${JSON.stringify(block.input)}`);
                        }
                    }
                }
            }

            yield message;
        }

        console.log(`[Session] Start complete, approvalState:`, this.approvalState);
        this.isRunning = false;
    }

    async *continue(prompt: string) {
        if (!this.sessionId) {
            throw new Error('No active session. Call start() first.');
        }

        this.isRunning = true;
        this.approvalState = { pending: false, plan: null };

        const options: ClaudeAgentOptions = {
            permissionMode: 'bypassPermissions',
            systemPrompt: LEAD_PROMPT,
            allowedTools: ['Task'],
            agents: agents,
            model: 'sonnet',  // Use sonnet for better orchestration
            maxTurns: 50,
            resume: this.sessionId,
        };

        console.log(`[Session] Continuing with session: ${this.sessionId}`);
        console.log(`[Session] Continue prompt: ${prompt.substring(0, 50)}...`);

        for await (const message of query({ prompt, options })) {
            // Log Task tool calls
            if (message.type === 'assistant') {
                const content = (message as any).message?.content;
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'tool_use' && block.name === 'Task') {
                            console.log(`[Session] Task tool call: ${JSON.stringify(block.input)}`);
                        }
                    }
                }
            }
            yield message;
        }

        this.isRunning = false;
        console.log(`[Session] Continue complete`);
    }

    approve(plan: string) {
        return this.continue(`APPROVED: Please proceed with the research plan.\n\n${plan}`);
    }

    reject() {
        return this.continue('REJECTED: I do not approve this plan.');
    }

    // Alias for continuation
    resume(prompt: string) {
        return this.continue(prompt);
    }

    getApprovalState() {
        return this.approvalState;
    }

    getSessionId() {
        return this.sessionId;
    }

    isActive() {
        return this.isRunning;
    }
}

// Simple in-memory session store
const sessions = new Map<string, AgentSession>();

export function getOrCreateSession(threadId: string): AgentSession {
    let session = sessions.get(threadId);
    if (!session) {
        session = new AgentSession(threadId);
        sessions.set(threadId, session);
    }
    return session;
}

export function getSession(threadId: string): AgentSession | undefined {
    return sessions.get(threadId);
}

export function removeSession(threadId: string) {
    const session = sessions.get(threadId);
    if (session) {
        sessions.delete(threadId);
    }
}
