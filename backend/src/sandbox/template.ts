/**
 * E2B Template Builder
 * 
 * Creates template with Claude Agent SDK installed LOCALLY.
 * ESM module resolution requires node_modules in script directory.
 * 
 * Run: cd backend && npx tsx src/sandbox/template.ts
 */

import 'dotenv/config';
import { Template } from 'e2b';

const TEMPLATE_ALIAS = 'agent-sandbox';

async function buildTemplate() {
    console.log(`\n🏗️  Building template: ${TEMPLATE_ALIAS}\n`);

    const template = Template()
        .fromNodeImage('24')
        .setWorkdir('/home/user')
        .makeDir('/home/user/workspace')
        // Local npm install for ESM module resolution
        .runCmd('npm init -y')
        .npmInstall('@anthropic-ai/claude-agent-sdk');

    console.log('📦 Template:');
    console.log('   - Node.js 24');
    console.log('   - SDK: @anthropic-ai/claude-agent-sdk (LOCAL)');
    console.log('   - Workdir: /home/user\n');

    console.log('⏳ Building... (2-5 minutes)\n');

    await Template.build(template, {
        alias: TEMPLATE_ALIAS,
        cpuCount: 2,
        memoryMB: 1024,
    });

    console.log(`\n✅ Template ready: ${TEMPLATE_ALIAS}`);
}

buildTemplate().catch(console.error);
