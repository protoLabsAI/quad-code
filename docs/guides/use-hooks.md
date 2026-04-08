# Use Hooks

Run custom scripts at key points in the proto lifecycle — before tool calls, after edits, at session boundaries, and during agent team coordination.

## Configure a hook

Hooks are defined in `.proto/settings.json` (project) or `~/.proto/settings.json` (global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/check-bash-safety.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

Disable all hooks temporarily without deleting config:

```json
{ "disableAllHooks": true }
```

## Hook types

| Type      | Purpose                                                       |
| --------- | ------------------------------------------------------------- |
| `command` | Run a shell script. Event JSON on stdin, decisions on stdout. |
| `http`    | POST event JSON to a webhook URL.                             |
| `prompt`  | Ask an LLM to make a judgment call.                           |

### Command hook

```json
{
  "type": "command",
  "command": "/path/to/script.sh",
  "timeout": 30000,
  "env": { "CUSTOM_VAR": "value" }
}
```

### HTTP hook

```json
{
  "type": "http",
  "url": "https://hooks.example.com/proto",
  "headers": { "Authorization": "Bearer $API_TOKEN" },
  "allowedEnvVars": ["API_TOKEN"]
}
```

### Prompt hook

```json
{
  "type": "prompt",
  "prompt": "Is this safe? Event: $ARGUMENTS. Respond with JSON: {\"decision\": \"allow\"} or {\"decision\": \"deny\", \"reason\": \"why\"}",
  "model": "haiku"
}
```

### Modifiers

**`async: true`** — run in the background; output and decisions are ignored.

**`if`** — fine-grained argument filter (fires only when the tool's primary argument matches):

```json
{ "type": "command", "if": "Bash(git *)", "command": "check-git-policy.sh" }
```

Syntax: `ToolName(glob)`. Glob matches `command` for Bash, `file_path` for Edit/Write, `pattern` for Grep.

## Events

### Lifecycle

| Event              | When                            | Can block?           |
| ------------------ | ------------------------------- | -------------------- |
| `SessionStart`     | Session begins or resumes       | No                   |
| `SessionEnd`       | Session terminates              | No                   |
| `PreCompact`       | Before context compaction       | No                   |
| `UserPromptSubmit` | User submits a prompt           | Yes (exit 2)         |
| `Stop`             | Before model concludes response | Yes (exit 2 or JSON) |

### Tool events

| Event                | When                    | Can block? |
| -------------------- | ----------------------- | ---------- |
| `PreToolUse`         | Before tool executes    | Yes        |
| `PostToolUse`        | After tool succeeds     | Limited    |
| `PostToolUseFailure` | After tool fails        | Limited    |
| `PermissionRequest`  | Permission dialog shown | Yes        |

### Agent & team events

| Event           | When                          |
| --------------- | ----------------------------- |
| `SubagentStart` | Subagent spawned              |
| `SubagentStop`  | Subagent finishes             |
| `TeammateIdle`  | Background agent becomes idle |
| `TaskCreated`   | Task added to shared list     |
| `TaskCompleted` | Task marked done              |

## Input/output contract

### Exit codes (command hooks)

| Code | Meaning            | Behavior                              |
| ---- | ------------------ | ------------------------------------- |
| `0`  | Success            | Parse stdout as JSON for decisions    |
| `1`  | Non-blocking error | Continue; stderr logged               |
| `2`  | Blocking error     | Block the action; stderr fed to model |

### JSON output

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "explanation"
}
```

### Common input fields (all events)

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "ISO 8601"
}
```

### Key event-specific fields

**PreToolUse** — input: `tool_name`, `tool_input`. Output: `hookSpecificOutput.permissionDecision` (`allow`|`deny`|`ask`).

**PostToolUse** — input: `tool_name`, `tool_input`, `tool_response`. Output: `decision` (`allow`|`block`).

**Stop** — input: `stop_hook_active`, `last_assistant_message`. Output: `decision` (`allow`|`block`). Check `stop_hook_active` before continuing to avoid infinite loops.

**SessionStart** — input: `source` (`startup`|`resume`|`clear`|`compact`). Output: `hookSpecificOutput.additionalContext` injected into session context.

**TeammateIdle** — input: `agent_id`, `agent_name`, `result_summary`, `success`. Exit 2 to send feedback back to the agent.

## Matcher patterns

Matchers are regex patterns on tool names (`^bash$`, `read.*`) or agent types (`^Explore$`). Empty string matches all.

## Execution model

- Hooks run **in parallel** by default.
- When multiple hooks conflict, the **most restrictive wins**: `deny` > `ask` > `allow`.
- Default timeout: 60 seconds. Max output: 1 MB.
- Project hooks require trusted folder status.

## SDK hook callbacks

Register hook callbacks directly in TypeScript instead of shell scripts:

```typescript
import { query, type HookCallback } from '@proto/sdk';

const securityGate: HookCallback = async (input) => {
  const data = input as {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };
  if (data.tool_name === 'Bash') {
    const cmd = String(data.tool_input?.command ?? '');
    if (cmd.includes('rm -rf')) {
      return { shouldSkip: true, message: 'Blocked: destructive command' };
    }
  }
  return {};
};

const conversation = query({
  prompt: 'Refactor the auth module',
  options: {
    hookCallbacks: { PreToolUse: [securityGate] },
  },
});
```

### Callback return values

| Field             | Effect                                 |
| ----------------- | -------------------------------------- |
| `shouldSkip`      | Skip this tool call (PreToolUse only)  |
| `shouldInterrupt` | Stop the agent immediately             |
| `suppressOutput`  | Suppress tool output from conversation |
| `message`         | Feedback sent to the agent             |

See [Contributing → Examples → SDK Hooks](../contributing/examples/sdk-hooks) for more patterns.

## Environment variables

Command hooks inherit `process.env` plus:

```
PROTO_PROJECT_DIR   — project root
GEMINI_PROJECT_DIR  — same (compatibility alias)
CLAUDE_PROJECT_DIR  — same (compatibility alias)
```
