# Sandbox Hooks & Event Streaming

Our hybrid architecture relies on the **Claude Agent SDK**'s hook system to provide real-time visibility into the sandbox's "Thinking" process and to track file operations.

## PostToolUse Hook

In `hybrid-v2.ts`, we inject a `PostToolUse` hook into the agent script. This hook executes after every tool call within the E2B sandbox.

### Implementation Pattern

The hook catches tool interactions and serializes them as JSON strings to `stdout`.

```javascript
hooks: {
    PostToolUse: [{
        hooks: [async (input, toolUseId, context) => {
            // 1. Emit tool call details for the frontend StatusIndicator
            console.log(JSON.stringify({ 
                type: 'tool_call', 
                name: input.tool_name,
                input: input.tool_input
            }));
            
            // 2. Specialized tracking for 'Write' tool to find the report
            if (input.tool_name === 'Write') {
                const filePath = input.tool_input?.file_path || input.tool_input?.path;
                if (filePath) {
                    console.log(JSON.stringify({ 
                        type: 'file_written', 
                        path: filePath 
                    }));
                }
            }
            return {};
        }]
    }]
}
```

## Backend Event Parsing

The backend execution loop (`researcherPhase`) listens to the sandbox's `stdout` in real-time. It uses an `eventQueue` to bridge the gap between the sandbox command exit and the streaming SSE responses.

### Stdout Handler

```typescript
onStdout: (line: string) => {
    try {
        const msg = JSON.parse(line);
        if (msg.type === 'tool_call') {
            eventQueue.push({
                type: 'tool',
                content: msg.name,
                data: { name: msg.name, input: msg.input }
            });
        }
    } catch { 
        // Ignore non-JSON output (regular agent logs)
    }
}
```

## UI Integration

The frontend receives these events and reflects them in the `StatusIndicator` component:

1. **Tool Event**: Replaces the generic "Searching..." status with the specific tool name (e.g., `WebSearch`).
2. **Log Entry**: Adds a bullet point to the detailed "How the agent is researching" log.
3. **Persistence**: These steps are merged into the message parts following the `hybridAgentV2` flow, ensuring they remain visible in history.

## Benefits

- **Zero Latency**: Users see what the agent is doing *while* it's doing it, rather than waiting for the entire task to finish.
- **Improved Debugging**: Errors during tool use are immediately visible via the hook's feedback loop.
- **Dynamic UX**: The UI can adapt based on the *type* of tool being used (e.g., showing a globe for searches).
