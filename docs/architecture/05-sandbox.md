# Sandbox Architecture

## Modes

| Mode | Execution | Use Case |
|------|-----------|----------|
| **local** | Direct on machine | Development |
| **e2b** | Cloud sandbox | Production |
| **hybrid** | Orchestrator local + Researcher E2B | Optimal |

## Mode Selection

```typescript
// sandbox/index.ts
export function getMode(): SandboxMode {
  const mode = process.env.SANDBOX_MODE?.toLowerCase();
  if (mode === 'e2b') return 'e2b';
  if (mode === 'hybrid') return 'hybrid';
  return 'local';
}
```

## Local Mode

Direct execution using the SDK:

```typescript
// sandbox/local.ts
import { query } from '@anthropic-ai/claude-agent-sdk';

export function runLocal(prompt: string) {
  mkdirSync('./workspace', { recursive: true });
  return query({
    prompt,
    options: {
      systemPrompt: orchestratorConfig.systemPrompt,
      allowedTools: orchestratorConfig.allowedTools,
      cwd: './workspace',
      agents: { researcher },
    },
  });
}
```

## E2B Mode

Full sandbox execution in Firecracker microVM:

```typescript
// sandbox/e2b.ts
export async function* runInE2B(prompt: string) {
  const sandbox = await Sandbox.create({
    timeoutMs: 10 * 60 * 1000,
    envs: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  await sandbox.commands.run('mkdir -p /home/user/workspace');
  await sandbox.commands.run('npm install @anthropic-ai/claude-agent-sdk');

  const script = generateAgentScript(prompt);
  await sandbox.files.write('/home/user/agent.mjs', script);
  
  await sandbox.commands.run('node /home/user/agent.mjs', {
    onStdout: (line) => messages.push(JSON.parse(line)),
  });

  await sandbox.betaPause();
  // ...
}
```

## Pause/Resume

E2B supports sandbox persistence:

```typescript
// Pause - preserves full state
await sandbox.betaPause();

// Resume
const sandbox = await Sandbox.connect(sandboxId, {
  timeoutMs: 10 * 60 * 1000,
});
```

## Comparison

| Aspect | Local | E2B |
|--------|-------|-----|
| **Speed** | Fast | 3-5s startup |
| **Isolation** | None | Full container |
| **Debugging** | Easy | Harder |
| **Cost** | Free | E2B fees |
| **Persistence** | On disk | Pause/resume |
| **Security** | Trust required | Isolated |

## Workspace Paths

| Mode | Path |
|------|------|
| Local | `./workspace` |
| E2B | `/home/user/workspace` |

## Environment Passthrough

```typescript
const sandbox = await Sandbox.create({
  envs: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  },
});
```

## When to Use Each

### Local

- Development
- Debugging
- Trusted environment
- Fast iteration

### E2B

- Production
- Untrusted input
- Full isolation needed

### Hybrid

- Best of both worlds
- Fast planning (local)
- Isolated execution (E2B)
