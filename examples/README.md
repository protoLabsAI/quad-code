# proto SDK — Runnable Examples

Hands-on examples for `@proto/sdk`. Each folder is self-contained and runnable with `tsx`.

## Setup

```bash
cd examples
npm install
```

## Examples

| #   | Folder                     | What it demonstrates                                                             |
| --- | -------------------------- | -------------------------------------------------------------------------------- |
| 01  | `01-basic-query/`          | Single-turn `query()`, streaming message types                                   |
| 02  | `02-code-reviewer/`        | Custom subagent with read-only tools and a specialised system prompt             |
| 03  | `03-multi-agent-pipeline/` | Two-agent pipeline (architect → implementer) using multi-turn `AsyncIterable`    |
| 04  | `04-hook-security-gate/`   | `PreToolUse` hook that blocks dangerous shell commands and restricts write paths |

## Running

```bash
# Run a specific example
npx tsx 01-basic-query/index.ts

# Or use the package scripts
npm run 01
npm run 02
npm run 03
npm run 04 # set SAFE_DIR=/tmp/sandbox first
```

## Key SDK concepts

- **`query({ prompt, options })`** — entry point; returns an async iterable of `SDKMessage`
- **`SubagentConfig`** — declares a named agent with its own system prompt, tools, and model
- **`permissionMode`** — `default` | `plan` | `auto-edit` | `yolo`
- **`hookCallbacks.PreToolUse`** — intercept every tool call; return `{ shouldSkip: true }` to block
- **Multi-turn** — pass an `AsyncIterable<SDKUserMessage>` as `prompt` to drive a conversation

See the [SDK docs](../docs/contributing/sdk-typescript.md) for the full API reference.
