Multi-Agent Research System

## How It Works

1. **Lead/Orchestrator Agent** communicates with the user,  understand user intent, write initial research plan draft: `workspace/plan/` with 2-3 subtopics.
2. Clarify research questions,  use human-in-the-loop pattern using agent SDK approval [[https://platform.claude.com/docs/en/agent-sdk/user-input]]

3. Once approved, spawns **Researcher** subagent to search the web (using  `Task` tool) .

4. Researcher saves findings to `workspace/report/` or can be direct streaming

5. Spawns **Report Writer** to create final report in `files/reports/`

6. **Lead/Orchestrator Agent** can provide final summary (if needed)

## Agents

| Agent             | Tools                                    | Purpose                                      |
| ----------------- | ---------------------------------------- | -------------------------------------------- |
| **Lead Agent**    | `Task`                                   | Coordinates research, delegates to subagents |
| **Researcher**    | `WebSearch`, `Write`                     | Gathers information from the web             |
| **Report Writer** | `Skill`, `Write`, `Glob`, `Read`, `Bash` | Creates PDF reports with embedded visuals    |

## Subagent Tracking with Hooks

We aim to make the system tracks all tool calls using SDK hooks.

### What Gets Tracked

- **Who**: Which agent (RESEARCHER-1, etc.)

- **What**: Tool name (WebSearch, Write, Bash, etc.)

- **When**: Timestamp

- **Input/Output**: Parameters and results

### How It Works

Hooks intercept every tool call before and after execution:

```python

hooks = Hooks(

pre_tool_use=[tracker.pre_tool_use_hook],

post_tool_use=[tracker.post_tool_use_hook]

)

```

The `parent_tool_use_id` links tool calls to their subagent:

- Lead Agent spawns a Researcher via `Task` tool → gets ID "task_123"

- All tool calls from that Researcher include `parent_tool_use_id = "task_123"`

- Hooks use this ID to identify which subagent made the call
