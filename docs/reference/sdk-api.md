# SDK API Reference

Complete API reference for `@proto/sdk`. For a guided introduction, see [Contributing → TypeScript SDK](../contributing/sdk-typescript).

## Installation

```bash
npm install @proto/sdk
```

Requires Node.js ≥ 20.0.0 and proto installed in PATH.

## `query()`

Creates a new agentic session with the proto CLI.

```typescript
import { query } from '@proto/sdk';

const conversation = query({
  prompt: 'What files are in the current directory?',
  options: { cwd: '/path/to/project' },
});

for await (const message of conversation) {
  console.log(message);
}
```

### Parameters

| Parameter | Type                                      | Description                                     |
| --------- | ----------------------------------------- | ----------------------------------------------- |
| `prompt`  | `string \| AsyncIterable<SDKUserMessage>` | Single-turn string or multi-turn async iterable |
| `options` | `QueryOptions`                            | Session configuration (all optional)            |

Returns a `Query` instance (implements `AsyncIterable<SDKMessage>`).

## `QueryOptions`

### Core

| Option                   | Type            | Default         | Description                                          |
| ------------------------ | --------------- | --------------- | ---------------------------------------------------- |
| `cwd`                    | string          | `process.cwd()` | Working directory                                    |
| `model`                  | string          | —               | Model ID                                             |
| `env`                    | object          | —               | Environment variables merged into CLI process        |
| `systemPrompt`           | string          | —               | Override or extend the built-in system prompt        |
| `maxSessionTurns`        | number          | `-1`            | Max turns before auto-termination                    |
| `debug`                  | boolean         | `false`         | Verbose CLI logging                                  |
| `logLevel`               | string          | `error`         | SDK log verbosity (`debug`, `info`, `warn`, `error`) |
| `abortController`        | AbortController | auto            | Call `.abort()` to terminate                         |
| `includePartialMessages` | boolean         | `false`         | Emit streaming events as they arrive                 |

### Permissions

| Option           | Type       | Default   | Description                            |
| ---------------- | ---------- | --------- | -------------------------------------- |
| `permissionMode` | string     | `default` | `default`, `plan`, `auto-edit`, `yolo` |
| `canUseTool`     | CanUseTool | —         | Custom per-tool permission callback    |
| `allowedTools`   | string[]   | —         | Auto-approved tools                    |
| `excludeTools`   | string[]   | —         | Blocked tools (highest priority)       |
| `coreTools`      | string[]   | —         | If set, only these tools are available |
| `authType`       | AuthType   | `openai`  | `openai`, `anthropic`, `gemini`        |

### Session

| Option          | Type    | Default | Description                                |
| --------------- | ------- | ------- | ------------------------------------------ |
| `resume`        | string  | —       | Session ID to resume                       |
| `sessionId`     | string  | auto    | Explicit session ID                        |
| `chatRecording` | boolean | `true`  | Set `false` to disable session persistence |

### MCP & agents

| Option       | Type             | Description                                              |
| ------------ | ---------------- | -------------------------------------------------------- |
| `mcpServers` | object           | MCP server configurations (same schema as settings.json) |
| `agents`     | SubagentConfig[] | Sub-agent configurations                                 |

### LSP

| Option | Type    | Default | Description                  |
| ------ | ------- | ------- | ---------------------------- |
| `lsp`  | boolean | `false` | Enable LSP code intelligence |

### Hooks

| Option          | Type   | Description                                            |
| --------------- | ------ | ------------------------------------------------------ |
| `hookCallbacks` | object | Map of event name → `HookCallback` or `HookCallback[]` |

## Message types

All messages from `query()` implement `SDKMessage` with `type` and `session_id`.

| `type`                              | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `system` + `subtype: session_start` | Session started                             |
| `assistant`                         | Model response with `message.content` array |
| `tool_use`                          | Tool call request                           |
| `tool_result`                       | Tool execution result                       |
| `result` + `subtype: success/error` | Session completed                           |

## Helper functions

```typescript
import {
  isTextMessage,
  isToolUseMessage,
  isResultMessage,
  isLspDiagnosticEvent,
  abortQuery,
} from '@proto/sdk';
```

## Multi-turn conversations

Pass an async iterable as `prompt` to drive a multi-turn session programmatically:

```typescript
async function* conversation() {
  yield { type: 'human', content: 'Analyse the project structure' };
  yield { type: 'human', content: 'Now write a summary to README.md' };
}

const session = query({ prompt: conversation() });
for await (const msg of session) { ... }
```

## Abort a session

```typescript
const controller = new AbortController();
const session = query({ prompt: '...', options: { abortController: controller } });

setTimeout(() => controller.abort(), 30_000);

for await (const msg of session) { ... }
```

## Hook callbacks

```typescript
import { query, type HookCallback } from '@proto/sdk';

const gate: HookCallback = async (input) => {
  const data = input as {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };
  if (data.tool_name === 'Bash') {
    const cmd = String(data.tool_input?.command ?? '');
    if (cmd.includes('rm -rf')) {
      return { shouldSkip: true, message: 'Blocked destructive command' };
    }
  }
  return {};
};

const session = query({
  prompt: 'Clean up old files',
  options: { hookCallbacks: { PreToolUse: [gate] } },
});
```

Supported events: `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `SubagentStop`.

## Sub-agent configuration

```typescript
import { query, type SubagentConfig } from '@proto/sdk';

const reviewer: SubagentConfig = {
  name: 'code-reviewer',
  description: 'Reviews code for bugs, security, and performance',
  systemPrompt: 'You are a code reviewer...',
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const session = query({
  prompt: 'Review the changes in the current branch',
  options: { agents: [reviewer] },
});
```

See [Contributing → Examples → SDK Sub-Agents](../contributing/examples/sdk-agents) for more patterns.
