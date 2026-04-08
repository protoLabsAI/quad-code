# Use Sub-Agents

Delegate focused tasks to specialized AI agents with their own system prompts, tool restrictions, and model selection.

## Create a sub-agent

Sub-agents are Markdown files with YAML frontmatter stored in `.proto/agents/` (project) or `~/.proto/agents/` (global).

```bash
mkdir -p .proto/agents
```

Create `.proto/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Reviews code for quality, security, and maintainability. Use proactively when changes are ready for review.
tools:
  - read_file
  - grep_search
  - glob
---

You are an experienced code reviewer. For each file you review:

1. Check for security vulnerabilities
2. Identify performance issues
3. Note maintainability concerns

Cite the exact file path and line number for each finding.
```

## Use the agent

Ask naturally — proto delegates based on the `description` field:

```
Review the authentication module for security issues
```

Or invoke explicitly:

```
Use the code-reviewer agent to check my recent changes
```

## Configuration reference

### Frontmatter fields

| Field                        | Required | Description                                        |
| ---------------------------- | -------- | -------------------------------------------------- |
| `name`                       | Yes      | Unique identifier (lowercase, hyphens, 2–50 chars) |
| `description`                | Yes      | When to delegate to this agent                     |
| `tools`                      | No       | Allowlist of permitted tools. Omit to inherit all. |
| `disallowedTools`            | No       | Denylist of tools to exclude from inherited set    |
| `permissionMode`             | No       | `default`, `plan`, `autoEdit`, `yolo`              |
| `modelConfig.model`          | No       | `haiku`, `sonnet`, `opus`, or full model ID        |
| `modelConfig.temp`           | No       | Temperature (0–2)                                  |
| `runConfig.max_turns`        | No       | Maximum agentic turns                              |
| `runConfig.max_time_minutes` | No       | Maximum execution time                             |
| `color`                      | No       | Display color for UI                               |

### Tool restrictions

**Allowlist (`tools`)** — only these tools are available:

```yaml
tools:
  - read_file
  - grep_search
  - glob
```

**Denylist (`disallowedTools`)** — remove from the inherited set:

```yaml
disallowedTools:
  - write_file
  - edit
```

### Permission modes

| Mode       | Behavior                         |
| ---------- | -------------------------------- |
| `default`  | Standard confirmation prompts    |
| `plan`     | Read-only, no file modifications |
| `autoEdit` | Auto-approve file edits          |
| `yolo`     | Auto-approve everything          |

### Storage hierarchy

| Level     | Location                        | Priority |
| --------- | ------------------------------- | -------- |
| Session   | Passed via SDK at runtime       | Highest  |
| Project   | `.proto/agents/`                | 2        |
| User      | `~/.proto/agents/`              | 3        |
| Extension | Extension's `agents/` directory | 4        |
| Built-in  | Embedded in proto               | Lowest   |

## Built-in agents

| Agent             | Purpose                               | Gets SkillTool?        |
| ----------------- | ------------------------------------- | ---------------------- |
| `general-purpose` | Complex multi-step tasks, code search | ✅ all tools           |
| `Explore`         | Fast codebase search and analysis     | ✅ explicitly listed   |
| `verify`          | Review changes for correctness        | ❌ read-only, no skill |
| `coordinator`     | Orchestrate multi-agent work          | ✅ explicitly listed   |
| `plan`            | Design implementation plans           | ❌ no skill tool       |

## Multi-sample retry

For high-stakes tasks where failure is costly:

```json
{
  "subagent_type": "general-purpose",
  "multi_sample": true,
  "prompt": "..."
}
```

The harness retries up to 2 more times with escalating temperatures, scoring each attempt and returning the best result. See [Explanation → Agent Harness](../explanation/agent-harness) for the scoring reference.

## Behavior verification gate

Run automatic post-task verification by creating `.proto/verify-scenarios.json`:

```json
[
  {
    "name": "Unit tests pass",
    "command": "npm test -- --run",
    "timeoutMs": 60000
  },
  {
    "name": "Build succeeds",
    "command": "npm run build",
    "timeoutMs": 30000
  }
]
```

Scenarios run in parallel after each successful subagent completion. If any fail, the output is fed back to the agent for self-correction.

## Background execution

Agents can run concurrently using `run_in_background: true` in the Agent tool call. The `coordinator` agent uses this to delegate subtasks in parallel.

## Agent teams

Teams run multiple coordinated agents concurrently. Each member is a live in-process agent with its own system prompt and tools, plus two extras injected automatically: `mailbox_send` and `mailbox_receive` for direct peer-to-peer messaging.

```
/team start research researcher:Explore implementer:general-purpose
```

Default team (no members specified): `lead` (coordinator) + `scout` (Explore).

### Team commands

| Command                                | Description                           |
| -------------------------------------- | ------------------------------------- |
| `/team start <name> [member:type ...]` | Spawn live agents and start the team  |
| `/team status <name>`                  | Show live member status               |
| `/team stop <name>`                    | Kill all agents and release resources |
| `/team list`                           | List all teams in the project         |
| `/team delete <name>`                  | Delete a team's config directory      |

### Shared task list

All team members share the same task list. Members can create, claim, and update tasks using the standard task tools (`task_create`, `task_list`, `task_update`).

### Inter-agent messaging

Each agent gets `mailbox_send` and `mailbox_receive` tools at spawn time. Agents address each other by agentId (`<name>-<index>`, e.g. `lead-0`, `scout-1`).

See [Guides → Use Agent Teams](./use-teams) for the full reference including message patterns, status tracking, hooks integration, and implementation details.

## Management commands

| Command          | Purpose                            |
| ---------------- | ---------------------------------- |
| `/agents create` | Guided agent creation wizard       |
| `/agents manage` | View, edit, delete existing agents |

## Design guidelines

**Single responsibility** — one agent, one purpose. Split "testing and documentation" into two agents.

**Actionable descriptions** — write the description so proto knows exactly when to delegate:

```yaml
description: Reviews code for security vulnerabilities, performance issues, and maintainability. Use after implementing any change.
```

**Minimal tool access** — grant only what the agent needs.

## SDK usage

When using the TypeScript SDK, pass subagent configs via the `agents` option:

```typescript
import { query, type SubagentConfig } from '@proto/sdk';

const reviewer: SubagentConfig = {
  name: 'code-reviewer',
  description:
    'Reviews code for bugs, security issues, and performance problems',
  systemPrompt: 'You are a code reviewer...',
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const conversation = query({
  prompt: 'Review the changes in the current branch',
  options: { agents: [reviewer] },
});
```

See [Contributing → Examples → SDK Sub-Agents](../contributing/examples/sdk-agents) for more patterns.
