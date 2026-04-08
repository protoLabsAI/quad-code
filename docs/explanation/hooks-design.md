# Hooks — How They Work

Hooks are event-driven extensions to the proto lifecycle. This page explains the execution model, decision flow, and design tradeoffs.

## What hooks are for

Hooks let you attach external logic to proto events without modifying proto itself. Common uses:

- **Security gates** — block dangerous shell commands before they run
- **Audit logging** — record every tool call to a log or webhook
- **CI enforcement** — block commits to protected branches
- **Team coordination** — notify teammates when a task completes
- **LLM-based judgment** — ask a model whether a proposed operation is safe

## The event system

proto fires named events at key points in its lifecycle. Each event carries a JSON payload with fields relevant to that event. Hooks subscribe to events by name, optionally filtered with a `matcher` pattern.

Events are organized into categories:

- **Lifecycle**: session start/end, compaction, user prompt, stop
- **Tool**: before/after every tool call
- **Agent**: sub-agent start/stop
- **Team**: teammate idle, task created/completed
- **Notification**: permission prompts, idle prompts, auth success

## Hook types

**Command hooks** — the most flexible type. proto runs a shell script, passes the event JSON on stdin, and reads a JSON decision from stdout. Exit code 2 blocks the action and sends stderr to the model as feedback.

**HTTP hooks** — proto POSTs the event JSON to a webhook URL. Useful for external audit systems or notification services.

**Prompt hooks** — proto asks a language model to evaluate the event and return a JSON decision. Useful for nuanced security policies that are hard to express as shell logic.

## Execution model

- Multiple hooks for the same event run **in parallel** by default.
- Use `sequential: true` on a hook definition to enforce ordering within that hook list.
- When multiple hooks return conflicting decisions, **the most restrictive wins**: `deny` > `ask` > `allow`.
- The default timeout is 60 seconds; max output is 1 MB per hook.

## The `if` field (fine-grained filtering)

The `if` field allows a hook to filter on the tool's primary argument without spawning a subprocess for non-matching calls:

```json
{ "type": "command", "if": "Bash(git *)", "command": "check-git.sh" }
```

Syntax: `ToolName(glob)`. The glob matches `command` for Bash, `file_path` for Edit/Write, `pattern` for Grep.

This avoids spawning a shell process for every tool call — only calls matching the pattern trigger the hook.

## The `async` modifier

Hooks marked `async: true` run in the background. Their output and decisions are ignored. Use for fire-and-forget side effects like Slack notifications or audit logging.

## Decision flow for blocking events

For events that support blocking (`PreToolUse`, `UserPromptSubmit`, `Stop`):

1. All matching hooks run (in parallel unless `sequential`).
2. stdout is parsed as JSON for each hook.
3. Decisions are merged — most restrictive wins.
4. If the result is `deny` or exit code 2, the action is blocked and stderr/reason is fed to the model.

## Security model

- Hooks run with your user permissions.
- Project hooks only run in trusted folders — untrusted folders cannot execute hooks.
- Variables in HTTP hook headers are only interpolated if they are listed in `allowedEnvVars`.

## Why three hook types

- **Command** covers anything that can be expressed as a shell script — maximum flexibility.
- **HTTP** covers external systems that already have webhook endpoints — no shell scripting needed.
- **Prompt** covers judgment calls that require reasoning rather than rules — avoids maintaining complex policy scripts.

The three types can be combined on the same event. For example, a `PreToolUse` hook might have a fast command hook for known-bad patterns and a prompt hook for edge cases.
