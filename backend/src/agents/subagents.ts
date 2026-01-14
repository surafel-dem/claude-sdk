/**
 * Subagent Definitions
 * Defines Researcher and Report Writer agents.
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const researcher: AgentDefinition = {
    description: 'Gathers research via web search and writes findings.',
    tools: ['WebSearch', 'Write'],
    prompt: 'Search the web for information. Write findings to files/research_notes/. Cite sources.',
    model: 'haiku',
};

export const reportWriter: AgentDefinition = {
    description: 'Creates comprehensive reports from research notes.',
    tools: ['Read', 'Write', 'Glob'],
    prompt: 'Read research notes from files/research_notes/. Create a markdown report in files/reports/.',
    model: 'haiku',
};
