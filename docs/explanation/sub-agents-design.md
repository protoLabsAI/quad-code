# Sub-Agents — How They Work

Sub-agents are independent AI agents that proto spawns to handle focused tasks. This page explains how they are designed and why.

## Core model: each sub-agent is an isolated `AgentCore`

When the parent agent calls the `task` tool, proto creates a new `AgentCore` instance for the sub-agent:

- The sub-agent has its own conversation context — it starts fresh, with no access to the parent's conversation history (only the task prompt).
- The sub-agent has its own tool set. If the agent definition includes a `tools` allowlist, only those tools are available. Otherwise, the sub-agent inherits all tools from the parent's registry.
- `disallowedTools` is applied as a denylist on top of the inherited set.

There is no shared tool registry that gets "filtered" — each sub-agent gets its own registry instance.

## Tool inheritance

For the built-in `general-purpose` agent, no allowlist is defined, so it inherits all tools — including `SkillTool` (the tool that loads skills). This lets it use the full suite of proto capabilities.

For `Explore`, an explicit allowlist is defined: read-only tools plus `repo_map`. It cannot write files.

For `verify` and `plan`, no `SkillTool` is included — they are focused on reading and reasoning, not executing skills.

## Storage hierarchy

Sub-agent definitions are loaded in this order (first match wins for the same name):

1. Session (passed via SDK at runtime)
2. Project: `.proto/agents/`
3. User: `~/.proto/agents/`
4. Extension: installed extension's `agents/` directory
5. Built-in: embedded in proto

## Permission mode

A sub-agent can declare its own `permissionMode`:

- `default` — standard confirmation prompts
- `plan` — read-only, no file modifications
- `autoEdit` — auto-approve file edits
- `yolo` — auto-approve everything

If the parent session uses bypass permissions (YOLO mode), it takes precedence.

## Background execution

When `run_in_background: true` is set on an Agent tool call, the parent conversation continues immediately while the sub-agent runs concurrently. A completion notification is injected into the parent's tool-result stream at the next tool boundary.

The `coordinator` built-in uses this extensively to parallelize sub-task delegation.

## Multi-agent teams

Teams are a layer on top of the sub-agent system. They add:

- A shared task list with atomic claiming (`br claim`)
- An inter-agent mailbox (`TeamMailbox`) for direct and broadcast messages
- Lifecycle hooks (`TeammateIdle`, `TaskCreated`, `TaskCompleted`) for orchestration

See [Guides → Use Sub-Agents](../guides/use-sub-agents#agent-teams) for the team command reference.

## Why this design

- **Isolation** prevents a sub-agent's context from polluting the parent's conversation.
- **Explicit tool allowlists** enforce least-privilege: a code reviewer should not be able to write files.
- **Independent `AgentCore` instances** make it straightforward to run sub-agents in parallel without shared state or locking.
- **Stateless and single-use** sub-agents keep the execution model simple: spawn, run, return result, done.
