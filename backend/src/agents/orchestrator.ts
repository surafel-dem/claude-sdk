/**
 * Orchestrator Configuration
 *
 * The orchestrator is the main query() call, not a subagent.
 */

import { ORCHESTRATOR_PROMPT } from '../prompts/orchestrator.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'sonnet';

export const orchestratorConfig = {
    systemPrompt: ORCHESTRATOR_PROMPT,
    allowedTools: ['Read', 'Write', 'Glob', 'Task'] as const,
    maxTurns: 15,
    permissionMode: 'acceptEdits' as const,
    model: MODEL,
};
