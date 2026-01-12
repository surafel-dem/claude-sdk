/**
 * E2B Template Builder
 * Pre-installs Node.js 22 + Claude Agent SDK for fast subagent startup.
 * Run: npx tsx backend/src/sandbox/template.ts
 */

import { Template } from 'e2b';

const TEMPLATE_ALIAS = 'research-agent-sandbox';

export async function buildTemplate(): Promise<void> {
    console.log(`Building template: ${TEMPLATE_ALIAS}`);

    const template = Template()
        .fromNodeImage('22')
        .setWorkdir('/home/user')
        .makeDir('/home/user/workspace')
        .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
        .setEnvs({
            NODE_PATH: '/usr/local/lib/node_modules',
            PATH: '/home/user/.local/bin:$PATH',
        });

    await Template.build(template, {
        alias: TEMPLATE_ALIAS,
        cpuCount: 2,
        memoryMB: 1024,
    });

    console.log('✅ Template built successfully');
}
