# TypeScript SDK

`@proto/sdk` provides programmatic access to proto for building integrations, tools, and automation.

## Install

```bash
npm install @proto/sdk
```

**Requirements:** Node.js ≥ 20.0.0 and proto installed and in PATH.

> [!note]
> If you use nvm, the SDK may not auto-detect the proto executable. Set `pathToProtoExecutable` explicitly.

## Quick start

```typescript
import { query } from '@proto/sdk';

const session = query({
  prompt: 'What files are in the current directory?',
  options: { cwd: '/path/to/project' },
});

for await (const message of session) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Done:', message.result);
    break;
  }
}
```

## Multi-turn conversations

```typescript
async function* conversation() {
  yield { type: 'human', content: 'Analyse the project structure' };
  yield { type: 'human', content: 'Write a summary to README.md' };
}

const session = query({ prompt: conversation() });
for await (const msg of session) { ... }
```

## Permission modes

```typescript
const session = query({
  prompt: 'Fix all failing tests',
  options: { permissionMode: 'auto-edit' },
});
```

Modes: `default`, `plan`, `auto-edit`, `yolo`.

**Custom per-tool approval:**

```typescript
const session = query({
  prompt: '...',
  options: {
    canUseTool: async (toolName, toolInput) => {
      if (toolName === 'run_shell_command') {
        return { behavior: 'ask' }; // always prompt for shell
      }
      return { behavior: 'allow' };
    },
  },
});
```

## Sub-agents

```typescript
import { query, type SubagentConfig } from '@proto/sdk';

const reviewer: SubagentConfig = {
  name: 'code-reviewer',
  description: 'Reviews code for bugs and security issues',
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

## Hook callbacks

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
      return { shouldSkip: true, message: 'Blocked' };
    }
  }
  return {};
};

const session = query({
  prompt: '...',
  options: { hookCallbacks: { PreToolUse: [securityGate] } },
});
```

## Abort a session

```typescript
const controller = new AbortController();
const session = query({
  prompt: '...',
  options: { abortController: controller },
});

setTimeout(() => controller.abort(), 30_000);
for await (const msg of session) { ... }
```

## LSP integration

```typescript
const session = query({
  prompt: 'Fix all type errors in src/',
  options: { lsp: true, permissionMode: 'auto-edit' },
});
```

## MCP servers

```typescript
const session = query({
  prompt: 'Query the database for recent errors',
  options: {
    mcpServers: {
      db: {
        command: 'python',
        args: ['-m', 'db_mcp_server'],
        env: { DB_URL: process.env.DB_URL },
      },
    },
  },
});
```

## Key `QueryOptions`

| Option                   | Type             | Default         | Description                        |
| ------------------------ | ---------------- | --------------- | ---------------------------------- |
| `cwd`                    | string           | `process.cwd()` | Working directory                  |
| `model`                  | string           | —               | Model ID                           |
| `permissionMode`         | string           | `default`       | Approval mode                      |
| `canUseTool`             | function         | —               | Per-tool approval callback         |
| `allowedTools`           | string[]         | —               | Auto-approved tools                |
| `excludeTools`           | string[]         | —               | Blocked tools (highest priority)   |
| `coreTools`              | string[]         | —               | If set, only these tools available |
| `agents`                 | SubagentConfig[] | —               | Sub-agent configs                  |
| `mcpServers`             | object           | —               | MCP server configs                 |
| `hookCallbacks`          | object           | —               | Hook event callbacks               |
| `lsp`                    | boolean          | `false`         | Enable LSP                         |
| `resume`                 | string           | —               | Session ID to resume               |
| `maxSessionTurns`        | number           | `-1`            | Max turns before auto-terminate    |
| `includePartialMessages` | boolean          | `false`         | Stream partial tokens              |
| `abortController`        | AbortController  | auto            | Cancel signal                      |

See [Reference → SDK API](../reference/sdk-api) for the full reference.

## Examples

See [Contributing → Examples](./examples/) for complete, runnable patterns:

- [Sub-Agent Examples](./examples/sdk-agents)
- [Hook Examples](./examples/sdk-hooks)
- [Tool Examples](./examples/sdk-tools)
- [Proxy Script](./examples/proxy-script)
