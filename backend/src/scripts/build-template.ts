/// <reference types="node" />
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
import { Template, Sandbox } from 'e2b';

// Must match sandbox-manager.ts
export const TEMPLATE_ALIAS = 'claude-research-agent-v1';

/**
 * Check if template exists
 */
export async function templateExists(): Promise<boolean> {
    try {
        // Try to create a sandbox with the template (quick check)
        const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
            timeoutMs: 30000,
            autoPause: true,
        });
        await Sandbox.kill(sandbox.sandboxId);
        return true;
    } catch {
        return false;
    }
}

/**
 * Build the template
 */
export async function buildTemplate(): Promise<void> {
    console.log('🏗️  Building E2B template...\n');
    console.log(`   Alias: ${TEMPLATE_ALIAS}`);
    console.log('   Pre-installing: @anthropic-ai/claude-agent-sdk\n');

    const template = Template()
        .fromNodeImage('22')
        .setWorkdir('/home/user')
        .makeDir('/home/user/workspace')
        .makeDir('/home/user/files')
        .runCmd('cd /home/user && npm init -y')
        .runCmd('cd /home/user && npm install @anthropic-ai/claude-agent-sdk');

    console.log('   Building... (2-5 minutes)\n');

    const buildInfo = await Template.build(template, {
        alias: TEMPLATE_ALIAS,
        cpuCount: 2,
        memoryMB: 1024,
    });

    console.log('✅ Template built!\n');
    console.log(`   Template ID: ${buildInfo.templateId}`);
    console.log(`   Alias: ${TEMPLATE_ALIAS}\n`);
}

/**
 * Ensure template exists - build if missing
 */
export async function ensureTemplate(): Promise<void> {
    console.log(`🔍 Checking for template: ${TEMPLATE_ALIAS}`);

    if (await templateExists()) {
        console.log('✅ Template exists\n');
        return;
    }

    console.log('⚠️  Template not found, building...\n');
    await buildTemplate();
}

// Run if called directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    const command = process.argv[2];

    if (command === '--check') {
        templateExists().then(exists => {
            console.log(exists ? '✅ Template exists' : '❌ Template not found');
            process.exit(exists ? 0 : 1);
        });
    } else if (command === '--ensure') {
        ensureTemplate().catch(err => {
            console.error('❌ Failed:', err);
            process.exit(1);
        });
    } else {
        // Default: build
        buildTemplate().catch(err => {
            console.error('❌ Build failed:', err);
            process.exit(1);
        });
    }
}
