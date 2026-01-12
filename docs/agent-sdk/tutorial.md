# The Complete Guide to Building Agents with the Claude Agent SDK

> This is cross-posted from [this post on X](https://x.com/dabit3/status/2009131298250428923?s=20). You can also view it in markdown in its entirety [here](https://github.com/anthropics/claude-agent-sdk-typescript).

---

If you’ve used **Claude Code**, you’ve seen what an AI agent can actually do: read files, run commands, edit code, and figure out the steps to accomplish a task. It doesn’t just help you write code; it takes ownership of problems and works through them the way a thoughtful engineer would.

The [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) is the same engine, yours to point at whatever problem you want. It’s the infrastructure behind Claude Code, exposed as a library. You get the agent loop, built-in tools, and context management—basically everything you’d otherwise have to build yourself.

This guide walks through building a **code review agent** from scratch. By the end, you’ll have a tool that can analyze a codebase, find bugs, and return structured feedback.

### Our Agent’s Capabilities

1. **Analyze** a codebase for bugs and security issues.
2. **Read** files and search through code autonomously.
3. **Provide** structured, actionable feedback.
4. **Track** its progress as it works.

---

## 🛠 Prerequisites

* **Runtime:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
* **SDK:** [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
* **Language:** TypeScript
* **Model:** Claude 3.7 Sonnet or Claude 3.5 Sonnet (Note: SDK supports various models)

---

## 🏗 Understanding the SDK Loop

If you’ve built agents with the raw API, you know the pattern: call the model, check for tool use, execute, and repeat. The SDK handles this logic for you.

### Comparison: Raw API vs. SDK

**Without the SDK (Manual Management):**

```typescript
let response = await client.messages.create({...});
while (response.stop_reason === "tool_use") {
  const result = yourToolExecutor(response.tool_use);
  response = await client.messages.create({ tool_result: result, ... });
}

```

**With the SDK (Automated Loop):**

```typescript
for await (const message of query({ prompt: "Fix the bug in auth.py" })) {
  console.log(message); // Claude reads files, finds bugs, and edits code automatically
}

```

### Built-in Tools

* **Read:** Read any file in the working directory.
* **Write:** Create new files.
* **Edit:** Make precise edits to existing files.
* **Bash:** Run terminal commands.
* **Glob:** Find files by pattern.
* **Grep:** Search file contents with regex.
* **WebSearch/WebFetch:** Search and parse the web.

---

## 🚀 Getting Started

### Step 1: Install Claude Code CLI

The Agent SDK uses Claude Code as its runtime.

```bash
npm install -g @anthropic-ai/claude-code

```

Run `claude` in your terminal and follow the prompts to authenticate.

### Step 2: Initialize Your Project

```bash
mkdir code-review-agent && cd code-review-agent
npm init -y
npm install @anthropic-ai/claude-agent-sdk
npm install -D typescript @types/node tsx

```

### Step 3: Set Your API Key

```bash
export ANTHROPIC_API_KEY=your-api-key

```

---

## 💻 Building the Agent

### Basic Implementation (`agent.ts`)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  for await (const message of query({
    prompt: "What files are in this directory?",
    options: {
      model: "claude-3-5-sonnet-latest",
      allowedTools: ["Glob", "Read"],
      maxTurns: 250
    }
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if ("text" in block) {
          console.log(block.text);
        }
      }
    }
    
    if (message.type === "result") {
      console.log("\nDone:", message.subtype);
    }
  }
}

main();

```

### Structured Code Review Agent (`review-agent.ts`)

This version provides a professional analysis of a directory.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function reviewCode(directory: string) {
  console.log(`\n🔍 Starting code review for: ${directory}\n`);
  
  for await (const message of query({
    prompt: `Review the code in ${directory} for:
1. Bugs and potential crashes
2. Security vulnerabilities  
3. Performance issues
4. Code quality improvements

Be specific about file names and line numbers.`,
    options: {
      model: "claude-3-5-sonnet-latest",
      allowedTools: ["Read", "Glob", "Grep"],
      permissionMode: "bypassPermissions", // Auto-approve read operations
      maxTurns: 250
    }
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if ("text" in block) {
          console.log(block.text);
        } else if ("name" in block) {
          console.log(`\n📁 Using ${block.name}...`);
        }
      }
    }
    
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`\n✅ Review complete! Cost: ${message.total_cost_usd.toFixed(4)}`);
      } else {
        console.log(`\n❌ Review failed: ${message.subtype}`);
      }
    }
  }
}

reviewCode(".");

```

---

## 📊 Working with Structured Output

For programmatic use, you can define a JSON schema to ensure Claude returns a specific data structure.

```typescript
const reviewSchema = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          category: { type: "string", enum: ["bug", "security", "performance", "style"] },
          file: { type: "string" },
          line: { type: "number" },
          description: { type: "string" },
          suggestion: { type: "string" }
        },
        required: ["severity", "category", "file", "description"]
      }
    },
    summary: { type: "string" },
    overallScore: { type: "number" }
  },
  required: ["issues", "summary", "overallScore"]
};

```

Apply this in your `query` options under `outputFormat`:

```typescript
outputFormat: {
  type: "json_schema",
  schema: reviewSchema
}

```

---

## 🛡 Advanced Features

### Permission Modes

* **`default`**: Prompts user for approval before tool execution.
* **`acceptEdits`**: Auto-approves file edits.
* **`bypassPermissions`**: Full automation (use with caution).

### Subagents (Delegation)

You can define specialized agents (e.g., a "security-reviewer") and allow the main agent to delegate tasks using the `Task` tool.

```typescript
agents: {
  "security-reviewer": {
    description: "Security specialist for vulnerability detection",
    prompt: "Focus on SQL injection, XSS, and exposed secrets.",
    tools: ["Read", "Grep"],
    model: "claude-3-5-sonnet-latest"
  }
}

```

### Model Context Protocol (MCP)

Extend Claude with custom tools by creating an MCP server:

```typescript
const customServer = createSdkMcpServer({
  name: "code-metrics",
  version: "1.0.0",
  tools: [
    tool("analyze_complexity", "Calculate complexity", { filePath: z.string() }, async (args) => {
      return { content: [{ type: "text", text: "Complexity: 10" }] };
    })
  ]
});

```

---

## 🏁 Conclusion

The Claude Agent SDK effectively bridges the gap between LLM reasoning and file-system execution. By utilizing `query()`, `allowedTools`, and `structured_output`, you can build production-ready agents that operate autonomously.

### Next Steps

* Explore **[File Checkpointing](https://platform.claude.com/docs/en/agent-sdk/file-checkpointing)** to revert changes.
* Implement **[Skills](https://platform.claude.com/docs/en/agent-sdk/skills)** for reusable agent capabilities.
* Visit the **[TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)** for full API details.

> **Note:** This guide covers V1 of the SDK. V2 is currently in development.
> Build verifiable agents with **[EigenCloud](https://developers.eigencloud.xyz/)**.

---

Would you like me to help you generate a specialized system prompt for a specific subagent, or perhaps create a custom MCP tool for this setup?
