/**
 * Researcher Subagent
 *
 * Gathers information and writes reports.
 * Invoked by orchestrator via Task tool.
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { RESEARCHER_PROMPT } from '../prompts/researcher.js';

const MODEL = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || process.env.ANTHROPIC_MODEL || 'haiku';

export const researcher: AgentDefinition = {
    description: 'Researches topics and writes reports. Use for any research task.',
    prompt: RESEARCHER_PROMPT,
    // Minimal tools for fast web research
    tools: ['WebSearch', 'Write'],
    model: MODEL as 'haiku' | 'sonnet' | 'opus' | 'inherit',
};
