# Approval Modes — How They Work

Approval modes control the trust boundary between the user and proto's tool execution. This page explains how they are implemented and when each is appropriate.

## The four modes

### Plan mode

proto is restricted to read-only tool calls. `write_file`, `edit`, and `run_shell_command` are blocked at the tool execution layer — not just at the confirmation layer. The model can still request these tools (its reasoning is unrestricted), but proto refuses to execute them and tells the model it is in plan mode.

**Use for:** Exploring a codebase safely before deciding whether and how to make changes. Also useful as a sub-agent mode — set `permissionMode: plan` on a reviewer agent to ensure it cannot accidentally modify files.

### Default mode

Every tool call that modifies state (file writes, shell commands) produces a confirmation prompt. The user sees exactly what proto is about to do and can approve, reject, or modify.

**Use for:** Most day-to-day development work. Good for unfamiliar codebases or when you want to stay in the loop.

### Auto-Edit mode

File edits (`write_file`, `edit`) are auto-approved; shell commands still require confirmation. This mode trusts proto to write code correctly while keeping you in control of command execution.

**Use for:** Refactoring and coding tasks where you trust the edits but want to review commands like test runs, installs, and git operations.

### YOLO mode

All tool calls are auto-approved with no confirmation. This includes shell commands with your full user permissions.

**Use for:** CI pipelines, trusted automation scripts, or personal projects where you want maximum speed and accept the risk. Always use with version control so you can revert.

## How the mode is enforced

The approval mode is checked in the tool executor before every tool call. The check happens after the model has decided to use a tool and after its arguments have been validated — it is the last gate before execution.

In sub-agents, `permissionMode` in the agent definition overrides the parent session's mode, except when the parent is in YOLO mode (bypass permissions take precedence over agent declarations).

## Keyboard shortcut cycle

```
Default → Auto-Edit → YOLO → Plan → Default
```

**Shift+Tab** (or **Tab** on Windows) cycles through this sequence during a session. The current mode is shown in the status bar.

## Persistence

The active mode is written to `settings.json` when changed via `/approval-mode`. You can set a project default:

```json
{
  "permissions": {
    "defaultMode": "auto-edit"
  }
}
```

## Interaction with hooks

Hooks can override the effective permission decision for individual tool calls. A `PreToolUse` hook can return `deny` even in YOLO mode. This lets security-sensitive organizations enforce policies (e.g., "never run `rm -rf`") regardless of what mode the user has enabled.

See [Explanation → Hooks](./hooks-design) and [Guides → Use Hooks](../guides/use-hooks) for configuration details.
