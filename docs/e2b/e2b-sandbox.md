# E2B Sandbox — TypeScript SDK Reference

> Source: <https://e2b.dev/docs/sdk-reference/js-sdk/v2.8.4/sandbox>

## Static Methods

### Sandbox.create()

Create a new sandbox from default or custom template.

```typescript
// Default template
const sandbox = await Sandbox.create();

// Custom template
const sandbox = await Sandbox.create('my-template');

// With options
const sandbox = await Sandbox.create({
  timeoutMs: 10 * 60 * 1000,  // 10 minutes
  envs: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  metadata: { sessionId: 'abc123' },
});
```

### Sandbox.betaCreate() — Auto-pause Support

Create sandbox with auto-pause for cost savings.

```typescript
// With auto-pause (BETA)
const sandbox = await Sandbox.betaCreate({
  timeoutMs: 10 * 60 * 1000,
  autoPause: true,  // Automatically pauses when idle
});

// With template and auto-pause
const sandbox = await Sandbox.betaCreate('my-template', {
  autoPause: true,
});
```

### Sandbox.connect()

Connect to existing sandbox by ID. Auto-resumes paused sandboxes.

```typescript
const sandbox = await Sandbox.connect(sandboxId, {
  timeoutMs: 10 * 60 * 1000,
});
```

### Sandbox.betaPause() — Static Method

Pause sandbox by ID (recommended over instance method).

```typescript
// Static method (preferred)
await Sandbox.betaPause(sandboxId);

// Instance method
await sandbox.betaPause();
```

### Sandbox.kill()

Kill sandbox by ID.

```typescript
// Static method
await Sandbox.kill(sandboxId);

// Instance method
await sandbox.kill();
```

### Sandbox.getInfo()

Get sandbox information.

```typescript
const info = await Sandbox.getInfo(sandboxId);
// { sandboxId, templateId, startedAt, endAt, metadata, state }
```

### Sandbox.getFullInfo()

Get detailed sandbox info including CPU/memory.

```typescript
const info = await Sandbox.getFullInfo(sandboxId);
// { sandboxId, templateId, cpuCount, memoryMB, state, ... }
```

### Sandbox.list()

List all running sandboxes.

```typescript
const paginator = Sandbox.list();
const sandboxes = await paginator.nextItems();
```

## Instance Methods

### sandbox.commands.run()

Run a command in the sandbox.

```typescript
const result = await sandbox.commands.run('npm install', {
  timeoutMs: 120000,
  cwd: '/home/user/project',
  onStdout: (line) => console.log(line),
  onStderr: (line) => console.error(line),
});
```

### sandbox.files.write() / read()

Write and read files.

```typescript
await sandbox.files.write('/home/user/script.js', 'console.log("hello")');
const content = await sandbox.files.read('/home/user/script.js');
```

### sandbox.files.list()

List directory contents.

```typescript
const files = await sandbox.files.list('/home/user');
```

### sandbox.isRunning()

Check if sandbox is running.

```typescript
const running = sandbox.isRunning();
```

### sandbox.getHost()

Get public URL for exposed port.

```typescript
const url = sandbox.getHost(3000);
// "https://xxx.e2b.app"
```

## Pause/Resume Pattern

```typescript
// Create with auto-pause
const sandbox = await Sandbox.betaCreate({ autoPause: true });
const sandboxId = sandbox.sandboxId;

// Do work...

// Manually pause (or let auto-pause handle it)
await Sandbox.betaPause(sandboxId);

// Later: Resume by connecting
const resumed = await Sandbox.connect(sandboxId);
```

## Best Practices

1. **Use static methods** — `Sandbox.betaPause(id)` not `sandbox.betaPause()`
2. **Use auto-pause** — Saves costs when sandbox is idle
3. **Store sandbox ID** — For resume across requests
4. **Custom templates** — Pre-install dependencies for faster startup
5. **Set timeouts** — Prevent runaway costs

## Common Options

```typescript
interface SandboxOpts {
  timeoutMs?: number;        // Sandbox lifetime (default: 300000 = 5min)
  envs?: Record<string, string>;
  metadata?: Record<string, string>;
}

interface SandboxBetaCreateOpts extends SandboxOpts {
  autoPause?: boolean;       // Auto-pause when idle
}
```
