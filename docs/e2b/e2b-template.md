# E2B Template Builder — TypeScript SDK Reference

> Source: <https://e2b.dev/docs/sdk-reference/js-sdk/v2.8.4/template>

## Creating Custom Templates

Pre-build templates with dependencies installed for faster sandbox startup.

## Basic Usage

```typescript
import { Template } from 'e2b';

// Define template
const template = Template()
  .fromNodeImage('22')
  .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
  .setWorkdir('/home/user/workspace')
  .makeDir('/home/user/workspace');

// Build and deploy
await Template.build(template, {
  alias: 'research-agent-sandbox',
  cpuCount: 2,
  memoryMB: 1024,
});
```

## Base Images

```typescript
// Node.js
Template().fromNodeImage('22')      // Node 22
Template().fromNodeImage('20')      // Node 20

// Python
Template().fromPythonImage('3.12')  // Python 3.12

// Ubuntu
Template().fromUbuntuImage('24.04') // Ubuntu 24.04

// Debian
Template().fromDebianImage('12')    // Debian 12

// Base (minimal)
Template().fromBaseImage()

// Bun
Template().fromBunImage('1.2')      // Bun 1.2

// Custom Docker image
Template().fromImage('docker.io/library/node:22-slim')
```

## Installing Packages

### npm

```typescript
// Single package
template.npmInstall('express')

// Multiple packages
template.npmInstall(['lodash', 'axios'])

// Global install
template.npmInstall('tsx', { g: true })

// Dev dependency
template.npmInstall('typescript', { dev: true })

// From package.json
template.npmInstall()
```

### pip

```typescript
// Single package
template.pipInstall('numpy')

// Multiple packages
template.pipInstall(['pandas', 'scikit-learn'])

// User-only install
template.pipInstall('numpy', { g: false })
```

### apt

```typescript
template.aptInstall('git')
template.aptInstall(['curl', 'wget', 'jq'])
```

### bun

```typescript
template.bunInstall('elysia')
template.bunInstall(['hono', 'drizzle-orm'])
```

## Running Commands

```typescript
// Run shell command
template.runCmd('npm install')
template.runCmd('mkdir -p /app/data')

// Piped commands
template.runCmd('curl -fsSL https://example.com/install.sh | bash')
```

## File Operations

```typescript
// Set working directory
template.setWorkdir('/home/user/project')

// Create directory
template.makeDir('/home/user/workspace')

// Copy files (from build context)
template.copy('./local/file.txt', '/home/user/file.txt')

// Remove files
template.remove('/tmp/cache', { recursive: true, force: true })

// Rename/move
template.rename('/tmp/old.txt', '/tmp/new.txt')

// Create symlink
template.makeSymlink('/usr/bin/node22', '/usr/bin/node')
```

## Environment Variables

```typescript
template.setEnvs({
  NODE_ENV: 'production',
  PATH: '/home/user/.local/bin:$PATH',
})
```

## User Settings

```typescript
// Run subsequent commands as root
template.setUser('root')

// Reset to default user
template.setUser('user')
```

## Git Operations

```typescript
template.gitClone('https://github.com/user/repo', '/home/user/repo')
```

## Building Template

```typescript
import { Template } from 'e2b';

const template = Template()
  .fromNodeImage('22')
  .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true });

// Build (blocks until complete)
const buildInfo = await Template.build(template, {
  alias: 'research-agent-sandbox',  // Template name
  cpuCount: 2,                       // CPU cores
  memoryMB: 1024,                    // RAM in MB
});

console.log('Template built:', buildInfo.templateId);
```

## Build in Background

```typescript
// Start build (returns immediately)
const { buildId } = await Template.buildInBackground(template, {
  alias: 'my-template',
});

// Check status
const status = await Template.getBuildStatus(buildId);
// status.state: 'pending' | 'building' | 'success' | 'failed'
```

## Using Custom Template

```typescript
// Create sandbox from custom template
const sandbox = await Sandbox.create('research-agent-sandbox');

// Or with betaCreate for auto-pause
const sandbox = await Sandbox.betaCreate('research-agent-sandbox', {
  autoPause: true,
});
```

## Complete Example: Research Agent Template

```typescript
import { Template, Sandbox } from 'e2b';

// Build template (run once)
async function buildResearchAgentTemplate() {
  const template = Template()
    .fromNodeImage('22')
    .setWorkdir('/home/user')
    .makeDir('/home/user/workspace')
    .npmInstall('@anthropic-ai/claude-agent-sdk', { g: true })
    .setEnvs({
      NODE_PATH: '/usr/local/lib/node_modules',
    });

  await Template.build(template, {
    alias: 'research-agent-v1',
    cpuCount: 2,
    memoryMB: 1024,
  });

  console.log('Template ready!');
}

// Use template (every sandbox creation)
async function createResearchSandbox() {
  const sandbox = await Sandbox.betaCreate('research-agent-v1', {
    autoPause: true,
    envs: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  });

  // SDK already installed — no setup needed!
  return sandbox;
}
```

## Benefits of Custom Templates

| Without Template | With Template |
|------------------|---------------|
| npm install (30s+) | Ready instantly |
| Setup each time | Pre-configured |
| Slower cold start | Fast cold start |
| Higher costs | Lower costs |
