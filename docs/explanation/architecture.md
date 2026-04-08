# Architecture

proto is organized as an npm workspace with the main work split between two packages: `cli` and `core`.

## Package structure

```
packages/
├── cli/              # Terminal UI and user interaction
├── core/             # Backend: API client, tools, subagents, memory
├── sdk-typescript/   # TypeScript SDK (@proto/sdk)
├── test-utils/       # Shared testing utilities
├── vscode-ide-companion/  # VS Code extension
├── webui/            # Web UI components
└── zed-extension/    # Zed editor extension
```

## Core components

### `packages/cli`

Handles all user-facing concerns:

- **Input processing** — text prompts, slash commands (`/help`, `/model`), `@file` includes, `!shell` commands
- **History management** — conversation history, session resumption
- **Rendering** — syntax highlighting, themes, terminal formatting
- **Configuration** — loads settings files, environment variables, CLI flags

### `packages/core`

The backend engine:

- **API client** — communicates with any OpenAI-compatible, Anthropic, or Gemini endpoint
- **Prompt construction** — builds messages with conversation history, tool schemas, and memory context
- **Tool registry** — registers built-in and MCP tools; executes them on model request
- **Sub-agent system** — spawns sub-agents with filtered tool sets and independent `AgentCore` instances
- **Memory system** — loads and saves per-session and persistent memory files
- **Session management** — tracks state, chat recording, session IDs

### Tools (`packages/core/src/tools/`)

Individual modules for file system, shell, web fetch/search, LSP, MCP, task management, and more. Each tool has a schema (sent to the model) and an executor (invoked on model request).

### Agent harness (`packages/core/src/services/`)

Safety and reliability services that wrap every sub-agent execution. See [Explanation → Agent Harness](./agent-harness) for details.

## Interaction flow

1. **User input** → `packages/cli` parses it
2. **cli → core** — the request is sent to `AgentCore`
3. **Core → API** — constructs prompt + tool schemas, sends to model
4. **Model response** — may be a text answer or a tool call request
5. **Tool execution** — core validates the call, confirms with user if needed, executes, returns result to model
6. **Iteration** — the model may make more tool calls before producing a final answer
7. **core → cli** — final response sent back
8. **Rendering** — cli formats and displays the response

## Sub-agent isolation

When a sub-agent is spawned via the `task` tool:

- A new `AgentCore` instance is created with an independent context and conversation
- The tool set is filtered to the agent's `tools` allowlist (or inherits all tools if no allowlist)
- The sub-agent runs to completion and returns its final message
- The result is injected back into the parent's tool-result stream

Sub-agents do not share state with their parent except through the tool result. The `coordinator` agent can spawn multiple sub-agents in parallel using `run_in_background: true`.

## Configuration layers

Settings cascade from system defaults → user (`~/.proto/settings.json`) → project (`.proto/settings.json`) → environment variables → CLI flags. See [Reference → Settings](../reference/settings) for the full precedence table.

## SDK

`packages/sdk-typescript` wraps the CLI binary with a streaming async iterable interface. See [Contributing → TypeScript SDK](../contributing/sdk-typescript) and [Reference → SDK API](../reference/sdk-api).
