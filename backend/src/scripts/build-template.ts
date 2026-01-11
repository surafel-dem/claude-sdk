/**
 * E2B Template Builder
 *
 * Build a custom template with the Claude Agent SDK pre-installed.
 * Run once to create the template, then reuse for all sandboxes.
 *
 * Usage:
 *   npm run build:template
 *
 * After building, sandboxes will start instantly (no npm install needed).
 */

import 'dotenv/config';
import { Template } from 'e2b';

const TEMPLATE_ALIAS = 'research-agent-v2';

async function buildTemplate() {
    console.log('🏗️  Building custom E2B template...\n');
    console.log(`   Template: ${TEMPLATE_ALIAS}`);
    console.log('   Pre-installing: @anthropic-ai/claude-agent-sdk\n');

    // Build template with SDK installed LOCALLY (not globally)
    // This ensures Node.js can find it when running scripts
    const template = Template()
        .fromNodeImage('22')
        .setWorkdir('/home/user')
        .makeDir('/home/user/workspace')
        // Create package.json first
        .runCmd('cd /home/user && npm init -y')
        // Install SDK locally (not globally)
        .runCmd('cd /home/user && npm install @anthropic-ai/claude-agent-sdk');

    console.log('   Building... (this takes 2-5 minutes)\n');

    try {
        const buildInfo = await Template.build(template, {
            alias: TEMPLATE_ALIAS,
            cpuCount: 2,
            memoryMB: 1024,
        });

        console.log('✅ Template built successfully!\n');
        console.log(`   Template ID: ${buildInfo.templateId}`);
        console.log(`   Alias: ${TEMPLATE_ALIAS}`);
        console.log('\n📝 Usage in code:');
        console.log(`   Sandbox.create('${TEMPLATE_ALIAS}')`);
        console.log(`   Sandbox.betaCreate('${TEMPLATE_ALIAS}', { autoPause: true })`);

        return buildInfo;
    } catch (error) {
        console.error('❌ Build failed:', error);
        throw error;
    }
}

// Run if called directly
buildTemplate().catch(console.error);
