# Use Agent Teams

Run multiple coordinated agents that share tasks and communicate with each other directly.

## Overview

An agent team is a group of named agents that:

- Share a task list — any member can create, claim, or update tasks
- Have a direct messaging channel to each other via `mailbox_send` / `mailbox_receive`
- Run concurrently as live in-process agents
- Persist their status to `.proto/teams/<name>/config.json`

Teams are built on top of sub-agents. Each team member is a fully-fledged agent with its own system prompt, tool access, and model config.

## Quick start

```
/team start research researcher:Explore implementer:general-purpose
```

This spawns two live agents immediately:

- `researcher` — an Explore agent focused on codebase analysis
- `implementer` — a general-purpose agent for implementation work

Both agents are registered in a shared `TeamMailbox` and can message each other.

**Default team** (no members specified):

```
/team start my-team
```

Creates `lead` (coordinator) + `scout` (Explore).

## Team commands

| Command                                | Description                           |
| -------------------------------------- | ------------------------------------- |
| `/team start <name> [member:type ...]` | Create and start a team               |
| `/team status <name>`                  | Show live member status               |
| `/team stop <name>`                    | Stop all agents and release resources |
| `/team list`                           | List all teams in the project         |
| `/team delete <name>`                  | Delete a team's config directory      |

## Member types

Each member spec takes the form `name:agentType`. The `agentType` resolves to a built-in or user-defined sub-agent:

```
/team start dev lead:coordinator scout:Explore coder:general-purpose reviewer:verify
```

| Built-in type     | Purpose                               |
| ----------------- | ------------------------------------- |
| `coordinator`     | Orchestrate work across other members |
| `Explore`         | Fast codebase search and analysis     |
| `general-purpose` | Multi-step implementation tasks       |
| `verify`          | Review and correctness checking       |
| `plan`            | Design plans before implementation    |

Any user-defined sub-agent from `.proto/agents/` or `~/.proto/agents/` can also be used as a team member type.

## Inter-agent messaging

Every agent in a team gets two extra tools injected at spawn time:

### `mailbox_send`

Send a message to a teammate by their agentId (e.g. `lead-0`, `scout-1`).

```
mailbox_send({ to: "lead-0", content: "Search complete. Found 3 relevant files." })
```

### `mailbox_receive`

Drain all unread messages from your inbox.

```
mailbox_receive({})
```

Returns all pending messages with sender ID and timestamp, then clears them.

> **Agent IDs**: The agentId for each member is `<name>-<index>` where index is the member's position in the team (0-based). For a team with `lead` and `scout`, the IDs are `lead-0` and `scout-1`.

## Shared task list

Team members share the same task list via the standard task tools (`task_create`, `task_list`, `task_update`). The coordinator pattern works naturally: the lead creates tasks, scouts claim and execute them, reporters mark them done.

```
# Coordinator creates tasks
task_create({ title: "Audit auth module", priority: "high" })
task_create({ title: "Write tests for auth", priority: "medium" })

# Other agents claim and complete
task_update({ taskId: "...", status: "in_progress" })
```

## Status tracking

Check live member status at any time:

```
/team status my-team
```

Output:

```
## Team: my-team
Status: active
Created: 4/8/2026, 10:30:00 AM

### Members

- **lead** (coordinator) — running [45s]
- **scout** (Explore) — running [45s]
```

Member statuses:

| Status      | Meaning                  |
| ----------- | ------------------------ |
| `idle`      | Spawned, not yet working |
| `running`   | Actively processing      |
| `completed` | Exited successfully      |
| `failed`    | Exited with an error     |

Status is persisted to `.proto/teams/<name>/config.json` and updated in real-time as agents exit.

## Stopping a team

```
/team stop my-team
```

`/team stop` kills all live agent processes, releases backend resources, and updates the config file. If the team is not running in the current session (e.g., from a previous session), it updates the config file only.

## Hooks for team events

proto fires hook events during team coordination. See [Use Hooks → Agent & team events](./use-hooks#agent--team-events) for the full list. Example — notify on task completion:

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "type": "command",
        "command": "echo 'Task done: $TASK_TITLE' >> ~/team-log.txt"
      }
    ]
  }
}
```

## Implementation details

Teams are backed by:

- **`TeamOrchestrator`** — owns the `InProcessBackend`, `TeamMailbox`, and agent lifecycle
- **`InProcessBackend`** — runs each agent as an in-process `AgentInteractive` (no PTY subprocess)
- **`TeamMailbox`** — in-memory inbox-per-agent message bus
- **`teamRegistry`** — module-level map from team name → live orchestrator, shared across slash-command handlers

The orchestrator registers all members in the mailbox before spawning the first agent, so agents can message each other from turn one.

## Related

- [Use Sub-Agents](./use-sub-agents) — single-agent delegation patterns
- [Agent Arena](./arena) — run multiple model variants competitively
- [Use Hooks](./use-hooks) — react to team events
- [Explanation → Sub-Agents Design](../explanation/sub-agents-design) — architectural context
