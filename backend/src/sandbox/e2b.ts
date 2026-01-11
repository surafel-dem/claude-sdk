/**
 * E2B Sandbox with Improvements
 *
 * Best practices from agent-sandboxes project:
 * - Custom template with SDK pre-installed (faster startup)
 * - Auto-pause for cost savings
 * - Static methods for pause/kill
 * - Structured logging
 */

import { Sandbox, Template } from 'e2b';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { orchestratorConfig, researcher } from '../agents/index.js';

// Configuration
const E2B_WORKSPACE = '/home/user/workspace';
const TEMPLATE_ALIAS = 'research-agent-v1';

// Store sandbox IDs for persistence
const sandboxStore = new Map<string, string>(); // sessionId -> sandboxId

// Logging helper
function log(level: 'INFO' | 'ERROR' | 'WARN', message: string, data?: Record<string, unknown>) {
  const prefix = `[E2B] [${level}]`;
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Build custom template with SDK pre-installed.
 * Run once to create template, then reuse for all sandboxes.
 */
export async function buildTemplate(): Promise<string> {
  log('INFO', 'Building custom template...');

  const template = Template()
    .fromNodeImage('22')
    .setWorkdir('/home/user')
    .makeDir('/home/user/workspace')
    .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
    .setEnvs({
      NODE_PATH: '/usr/local/lib/node_modules',
    });

  const buildInfo = await Template.build(template, {
    alias: TEMPLATE_ALIAS,
    cpuCount: 2,
    memoryMB: 1024,
  });

  log('INFO', 'Template built', { templateId: buildInfo.templateId, alias: TEMPLATE_ALIAS });
  return buildInfo.templateId;
}

/**
 * Create sandbox using custom template (fast) or base template (slow).
 * Uses betaCreate with autoPause for cost savings.
 */
async function createSandbox(): Promise<Sandbox> {
  log('INFO', 'Creating sandbox...');

  try {
    // Try custom template first (fast - SDK already installed)
    const sandbox = await Sandbox.betaCreate(TEMPLATE_ALIAS, {
      timeoutMs: 10 * 60 * 1000,
      autoPause: true, // Auto-pause when idle for cost savings
      envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
      },
    });

    log('INFO', 'Sandbox created from template', {
      sandboxId: sandbox.sandboxId,
      template: TEMPLATE_ALIAS,
      autoPause: true,
    });

    return sandbox;
  } catch {
    // Fallback to base template (slow - need to install SDK)
    log('WARN', `Template ${TEMPLATE_ALIAS} not found, using base template`);

    const sandbox = await Sandbox.betaCreate({
      timeoutMs: 10 * 60 * 1000,
      autoPause: true,
      envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
      },
    });

    log('INFO', 'Sandbox created from base', { sandboxId: sandbox.sandboxId });

    // Need to setup since not using custom template
    await setupSandbox(sandbox);

    return sandbox;
  }
}

/**
 * Setup sandbox (only needed for base template).
 */
async function setupSandbox(sandbox: Sandbox): Promise<void> {
  log('INFO', 'Setting up workspace...');
  await sandbox.commands.run(`mkdir -p ${E2B_WORKSPACE}`);

  log('INFO', 'Installing SDK (this takes ~30s)...');
  await sandbox.commands.run('npm install -g @anthropic-ai/claude-agent-sdk', {
    timeoutMs: 120000,
  });

  log('INFO', 'Setup complete');
}

/**
 * Pause sandbox using static method (preferred).
 */
async function pauseSandbox(sandboxId: string): Promise<boolean> {
  try {
    const paused = await Sandbox.betaPause(sandboxId);
    log('INFO', 'Sandbox paused', { sandboxId, paused });
    return paused;
  } catch (error) {
    log('ERROR', 'Failed to pause sandbox', { sandboxId, error: String(error) });
    // Kill if pause fails
    await Sandbox.kill(sandboxId);
    return false;
  }
}

/**
 * Resume paused sandbox.
 */
async function resumeSandbox(sandboxId: string): Promise<Sandbox | null> {
  try {
    log('INFO', 'Resuming sandbox...', { sandboxId });
    const sandbox = await Sandbox.connect(sandboxId, {
      timeoutMs: 10 * 60 * 1000,
    });
    log('INFO', 'Sandbox resumed', { sandboxId });
    return sandbox;
  } catch (error) {
    log('ERROR', 'Failed to resume sandbox', { sandboxId, error: String(error) });
    return null;
  }
}

/**
 * Run agent in sandbox.
 */
async function runAgentInSandbox(
  sandbox: Sandbox,
  prompt: string,
  resumeSessionId?: string
): Promise<{ messages: SDKMessage[]; sessionId?: string }> {
  const script = generateAgentScript(prompt, resumeSessionId);
  await sandbox.files.write('/home/user/agent.mjs', script);

  const messages: SDKMessage[] = [];
  let sessionId: string | undefined;

  log('INFO', 'Running agent...', { prompt: prompt.slice(0, 50) });

  const result = await sandbox.commands.run('node /home/user/agent.mjs', {
    timeoutMs: 5 * 60 * 1000,
    onStdout: (line) => {
      try {
        const msg = JSON.parse(line) as SDKMessage;
        messages.push(msg);

        // Capture session ID
        if (msg.type === 'system' && msg.subtype === 'init') {
          sessionId = (msg as { session_id?: string }).session_id;
          log('INFO', 'Session initialized', { sessionId });
        }

        // Log tool usage
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if ('name' in block) {
              log('INFO', 'Tool used', { tool: block.name });
            }
          }
        }
      } catch {
        if (line.trim()) console.log('[stdout]', line);
      }
    },
    onStderr: (line) => {
      if (line.trim()) console.error('[stderr]', line);
    },
  });

  if (result.exitCode !== 0) {
    log('ERROR', 'Agent exited with error', { exitCode: result.exitCode });
  }

  return { messages, sessionId };
}

/**
 * Run new E2B session.
 */
export async function* runInE2B(prompt: string): AsyncGenerator<SDKMessage, void, unknown> {
  const sandbox = await createSandbox();
  const sandboxId = sandbox.sandboxId;

  try {
    log('INFO', 'Starting new session');
    const { messages, sessionId } = await runAgentInSandbox(sandbox, prompt);

    // Store mapping and pause for reuse
    if (sessionId) {
      sandboxStore.set(sessionId, sandboxId);
      await pauseSandbox(sandboxId);
      log('INFO', 'Session mapped', { sessionId: sessionId.slice(0, 8), sandboxId });
    } else {
      await Sandbox.kill(sandboxId);
    }

    for (const message of messages) {
      yield message;
    }
  } catch (error) {
    log('ERROR', 'Error in session', { error: String(error) });
    await Sandbox.kill(sandboxId);
    throw error;
  }
}

/**
 * Resume existing E2B session.
 */
export async function* resumeInE2B(prompt: string, sessionId: string): AsyncGenerator<SDKMessage, void, unknown> {
  const existingSandboxId = sandboxStore.get(sessionId);

  let sandbox: Sandbox | null = null;
  let sandboxId: string;
  let isNew = false;

  if (existingSandboxId) {
    sandbox = await resumeSandbox(existingSandboxId);
    sandboxId = existingSandboxId;
  }

  if (!sandbox) {
    log('INFO', 'No existing sandbox, creating new');
    sandbox = await createSandbox();
    sandboxId = sandbox.sandboxId;
    isNew = true;
  } else {
    sandboxId = sandbox.sandboxId;
  }

  try {
    log('INFO', isNew ? 'Starting new session' : 'Resuming session');

    const { messages, sessionId: newSessionId } = await runAgentInSandbox(
      sandbox,
      prompt,
      isNew ? undefined : sessionId
    );

    // Update mapping
    const finalSessionId = newSessionId || sessionId;
    sandboxStore.set(finalSessionId, sandboxId);
    await pauseSandbox(sandboxId);

    for (const message of messages) {
      yield message;
    }
  } catch (error) {
    log('ERROR', 'Error in session', { error: String(error) });
    await Sandbox.kill(sandboxId);
    sandboxStore.delete(sessionId);
    throw error;
  }
}

/**
 * Cleanup all sandboxes.
 */
export async function cleanupSandboxes(): Promise<void> {
  log('INFO', 'Cleaning up sandboxes...');

  for (const [sessionId, sandboxId] of sandboxStore.entries()) {
    try {
      await Sandbox.kill(sandboxId);
      sandboxStore.delete(sessionId);
      log('INFO', 'Killed sandbox', { sandboxId });
    } catch {
      sandboxStore.delete(sessionId);
    }
  }
}

/**
 * Get sandbox stats.
 */
export function getSandboxStats(): { active: number; sessions: string[] } {
  return {
    active: sandboxStore.size,
    sessions: Array.from(sandboxStore.keys()).map(s => s.slice(0, 8)),
  };
}

/**
 * Generate agent script for execution in sandbox.
 */
function generateAgentScript(prompt: string, resumeSessionId?: string): string {
  const resumeOption = resumeSessionId ? `resume: '${resumeSessionId}',` : '';

  return `
import { query } from '@anthropic-ai/claude-agent-sdk';

const config = {
  systemPrompt: ${JSON.stringify(orchestratorConfig.systemPrompt)},
  allowedTools: ${JSON.stringify([...orchestratorConfig.allowedTools])},
  maxTurns: ${orchestratorConfig.maxTurns},
  permissionMode: '${orchestratorConfig.permissionMode}',
  model: process.env.ANTHROPIC_MODEL || '${orchestratorConfig.model}',
  ${resumeOption}
};

const agents = {
  researcher: {
    description: ${JSON.stringify(researcher.description)},
    prompt: ${JSON.stringify(researcher.prompt)},
    tools: ${JSON.stringify(researcher.tools)},
    model: process.env.ANTHROPIC_MODEL || 'inherit',
  },
};

try {
  for await (const msg of query({
    prompt: ${JSON.stringify(prompt)},
    options: { ...config, cwd: '${E2B_WORKSPACE}', agents },
  })) {
    console.log(JSON.stringify(msg));
  }
} catch (error) {
  console.error('[Agent Error]', error.message || error);
  process.exit(1);
}
`;
}
