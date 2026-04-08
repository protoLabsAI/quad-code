# SDK Hook Examples

Examples of SDK-side hook callbacks using `hookCallbacks` in `QueryOptions`.

## Audit logger

Log every tool call:

```typescript
import { query, type HookCallback } from '@proto/sdk';

const auditLogger: HookCallback = async (input, toolUseId) => {
  const data = input as { tool_name?: string };
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'PreToolUse',
      tool: data.tool_name,
      toolUseId,
    }),
  );
  return {};
};

const session = query({
  prompt: 'Refactor the auth module',
  options: { hookCallbacks: { PreToolUse: auditLogger } },
});
```

## Security gate

Block dangerous commands:

```typescript
const securityGate: HookCallback = async (input) => {
  const data = input as {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };

  if (data.tool_name === 'Bash') {
    const cmd = String(data.tool_input?.command ?? '');
    if (cmd.includes('rm -rf') || cmd.includes('sudo')) {
      return {
        shouldSkip: true,
        message: 'Destructive or privileged commands are not allowed',
      };
    }
  }

  return {};
};

const session = query({
  prompt: 'Clean up temporary files',
  options: { hookCallbacks: { PreToolUse: [auditLogger, securityGate] } },
});
```

## PostToolUse result validator

Interrupt if a tool output contains unexpected content:

```typescript
const resultValidator: HookCallback = async (input) => {
  const data = input as { tool_response?: string };
  if (data.tool_response?.includes('FATAL')) {
    return {
      shouldInterrupt: true,
      message: 'Fatal error detected in tool output — stopping agent',
    };
  }
  return {};
};

const session = query({
  prompt: 'Run the test suite',
  options: {
    hookCallbacks: { PostToolUse: resultValidator },
  },
});
```

## Multiple callbacks per event

Pass an array — callbacks execute in order. First `shouldSkip` or `shouldInterrupt` short-circuits the rest:

```typescript
const session = query({
  prompt: '...',
  options: {
    hookCallbacks: {
      PreToolUse: [auditLogger, securityGate],
      PostToolUse: resultValidator,
    },
  },
});
```

## Callback return values

| Field             | Type    | Effect                                     |
| ----------------- | ------- | ------------------------------------------ |
| `shouldSkip`      | boolean | Skip this tool call (PreToolUse only)      |
| `shouldInterrupt` | boolean | Stop the agent immediately                 |
| `suppressOutput`  | boolean | Suppress tool output from the conversation |
| `message`         | string  | Feedback sent to the agent                 |

Return `{}` to let the tool proceed normally.

## Supported events

`PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `SubagentStop`.

See [Guides → Use Hooks](../../guides/use-hooks) for shell/HTTP hook configuration.
