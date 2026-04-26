# proto

A multi-model AI agent for the terminal. Part of the [protoLabs Studio](https://protolabs.studio) ecosystem.

[![License](https://img.shields.io/github/license/QwenLM/qwen-code.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

proto is a fork of [Qwen Code](https://github.com/QwenLM/qwen-code) (itself forked from [Gemini CLI](https://github.com/google-gemini/gemini-cli)), rebuilt as a model-agnostic coding agent. It connects to any OpenAI-compatible, Anthropic, or Gemini API endpoint.

## What's Different

At-a-glance overview vs. upstream Qwen Code. For the full architectural breakdown see [`docs/architecture/divergence-from-upstream.md`](./docs/architecture/divergence-from-upstream.md).

| Category              | Qwen Code                 | proto                                                                                                                                                    |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default model         | Qwen3-Coder               | Any (LiteLLM / OpenAI-compat / Anthropic / Gemini)                                                                                                       |
| Agent harness         | —                         | Sprint contracts + scope lock, behavior-verify gate, multi-sample selector, doom-loop reminders, session memory + evolve, checkpoint/rewind, speculation |
| Bundled skills        | 0 (use external)          | 22 (sprint-contract, verification-before-completion, systematic-debugging, …)                                                                            |
| Subagent execution    | Sequential                | Concurrent batched — Agent calls run in parallel; tool ordering preserved                                                                                |
| Tool-call streaming   | Per-converter parser      | Per-stream parser context (no cross-stream corruption); malformed JSON → UI-hidden recovery note                                                         |
| Reasoning models      | Basic `reasoning_content` | Inline `<think>`-tag extraction (Minimax/QwQ); reasoning-only `content: ""` fix; preserved on session resume                                             |
| Truncation handling   | Best-effort               | MAX_TOKENS cascade detection + tool-response trimming; rejected truncated edits                                                                          |
| Task management       | In-memory JSON            | [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (SQLite + JSONL)                                                                           |
| Memory                | Single append-only file   | File-per-memory with YAML frontmatter, 4-type taxonomy, auto-extraction                                                                                  |
| MCP servers           | None                      | Configurable via `~/.proto/settings.json`; SSE/HTTP/stdio in ACP mode                                                                                    |
| Plugin discovery      | Qwen only                 | Auto-discovers Claude Code plugins from `~/.claude/plugins/`                                                                                             |
| Ignore files          | `.qwenignore`             | `.protoignore` + inherits `.claudeignore` patterns                                                                                                       |
| ACP / Zed integration | Stock                     | Cron-in-Session, concurrent Agent calls, SSE/HTTP MCP, internal-part filtering                                                                           |
| Extra built-in tools  | Standard set              | + browser automation, repo-map (PageRank), task tools, mailbox, LSP, voice/STT                                                                           |
| Observability         | Console                   | Langfuse OTLP traces with harness-intervention spans (SFT-ready)                                                                                         |
| Release pipeline      | Manual                    | Conventional-commit auto-release (`feat:` → minor, `fix:` → patch)                                                                                       |
| VS Code companion     | Included                  | Removed (focus on TUI + ACP/Zed)                                                                                                                         |

## Installation

Requires Node.js 20+ and Rust toolchain (for beads_rust).

```bash
# Install from npm (recommended)
npm install -g @protolabsai/proto
proto --version

# Or install from source
git clone https://github.com/protoLabsAI/protoCLI.git
cd protoCLI
npm install && npm run build && npm link

# Optional: task manager for persistent task tracking
cargo install beads_rust
```

## Quick Start

### 1. Configure your endpoint

proto connects to any OpenAI-compatible API. Create `~/.proto/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "name": "My Model",
        "baseUrl": "http://localhost:8000/v1",
        "envKey": "MY_API_KEY"
      }
    ]
  },
  "security": {
    "auth": { "selectedType": "openai" }
  },
  "model": { "name": "my-model" }
}
```

### 2. Set your API key

Create `~/.proto/.env`:

```
MY_API_KEY=sk-your-key-here
```

Or export it in your shell: `export MY_API_KEY=sk-your-key-here`

### 3. Run proto

```bash
proto                            # interactive mode
proto -p "explain this codebase" # one-shot mode
```

No auth screen — proto connects directly to your endpoint.

### Example: Multiple models via a gateway

If you run a gateway like [LiteLLM](https://github.com/BerriAI/litellm) in front of multiple providers, register them all under `modelProviders.openai` and switch between them with `/model`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "local/qwen-122b",
        "name": "Qwen3.5-122B (local vLLM)",
        "baseUrl": "http://my-gateway:4000/v1",
        "envKey": "GATEWAY_KEY",
        "generationConfig": { "contextWindowSize": 65536 }
      },
      {
        "id": "claude-sonnet-4-6",
        "name": "Claude Sonnet 4.6",
        "baseUrl": "http://my-gateway:4000/v1",
        "envKey": "GATEWAY_KEY",
        "capabilities": { "vision": true },
        "generationConfig": { "contextWindowSize": 200000 }
      },
      {
        "id": "gpt-5.4",
        "name": "GPT-5.4",
        "baseUrl": "http://my-gateway:4000/v1",
        "envKey": "GATEWAY_KEY",
        "capabilities": { "vision": true },
        "generationConfig": { "contextWindowSize": 200000 }
      }
    ]
  },
  "security": {
    "auth": { "selectedType": "openai" }
  },
  "model": { "name": "local/qwen-122b" }
}
```

### Model config reference

| Field                                | Required | Description                                                      |
| ------------------------------------ | -------- | ---------------------------------------------------------------- |
| `id`                                 | yes      | Model ID sent to the API (must match what your endpoint expects) |
| `name`                               | no       | Display name in proto UI (defaults to `id`)                      |
| `baseUrl`                            | no       | API base URL (defaults to OpenAI's)                              |
| `envKey`                             | no       | Environment variable name for the API key                        |
| `description`                        | no       | Shown in model picker                                            |
| `capabilities.vision`                | no       | Enable image/vision inputs                                       |
| `generationConfig.contextWindowSize` | no       | Context window in tokens                                         |

## Configuration

proto uses `~/.proto/settings.json` for global config and `.proto/settings.json` for per-project overrides.

### MCP Servers

Add MCP servers directly in settings:

```json
{
  "mcpServers": {
    "my_server": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": { "API_KEY": "..." },
      "trust": true
    }
  }
}
```

Tools are exposed as `mcp__<server_name>__<tool_name>` and available to the agent immediately.

### Plugin Discovery

proto auto-discovers Claude Code plugins installed at `~/.claude/plugins/`. Any plugin's `commands/` directory is automatically loaded as slash commands — no additional config needed.

### Environment variable overrides

| Variable                            | Default | Description                                                                                                                                                                        |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROTO_STREAM_STALL_TIMEOUT_MS`     | `90000` | Max ms to wait between streaming chunks before declaring the connection stalled (then retrying)                                                                                    |
| `PROTO_SYSTEM_DEFAULTS_PATH`        | —       | Override path to the system defaults settings file                                                                                                                                 |
| `PROTO_SYSTEM_SETTINGS_PATH`        | —       | Override path to the system settings override file                                                                                                                                 |
| `PROTO_LEGACY_ERASE_LINES`          | —       | Set to `1` to disable the cursor-collapse optimizer that prevents Ink scrollback bouncing during streaming renders. Only set this if it interferes with your terminal.             |
| `PROTO_FORCE_SYNCHRONIZED_OUTPUT`   | —       | Set to `1` to force-enable BSU/ESU atomic-frame escape codes regardless of terminal auto-detect (useful if your terminal supports DEC mode 2026 but isn't on the allowlist below). |
| `PROTO_DISABLE_SYNCHRONIZED_OUTPUT` | —       | Set to `1` to opt out of synchronized output even on supported terminals.                                                                                                          |

### TUI flicker mitigation

proto installs two stdout interventions to reduce flicker during streaming renders:

1. **Cursor-collapse optimizer** — collapses Ink's per-line `{ERASE_LINE, CURSOR_UP_ONE}` sequences into a single bounded erase. Universal; bypass via `PROTO_LEGACY_ERASE_LINES=1`.
2. **Synchronized output** — wraps each render frame in BSU/ESU escape codes (DEC mode 2026) on terminals that support it. Auto-detected for: **Alacritty (≥0.14), Ghostty, Kitty, WezTerm, iTerm2**. For other DEC-2026-capable terminals, set `PROTO_FORCE_SYNCHRONIZED_OUTPUT=1`.

Both no-op outside a TTY, in screen-reader mode, or under tmux/SSH.

## Observability

proto supports [Langfuse](https://langfuse.com) tracing out of the box. Set three environment variables and every session is fully traced — LLM calls (all providers), tool executions, subagent lifecycles, and turn hierarchy.

### Setup

Add to the `env` block in `~/.proto/settings.json`:

```json
{
  "env": {
    "LANGFUSE_PUBLIC_KEY": "pk-lf-...",
    "LANGFUSE_SECRET_KEY": "sk-lf-...",
    "LANGFUSE_BASE_URL": "https://cloud.langfuse.com"
  }
}
```

`LANGFUSE_BASE_URL` is optional and defaults to `https://cloud.langfuse.com`. For a self-hosted instance, set it to your deployment URL.

> **Why `settings.json` and not `.env`?** proto walks up from your CWD loading `.env` files, so a project-level `.env` with Langfuse keys would bleed into proto's tracing and mix your traces into the wrong dataset. The `env` block in `settings.json` is proto-namespaced and completely isolated from your projects.

### What gets traced

| Span                  | Attributes                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `turn`                | `session.id`, `turn.id` — root span per user prompt                                                  |
| `gen_ai chat {model}` | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.model` — one per LLM call |
| `tool/{name}`         | `tool.name`, `tool.type`, `tool.duration_ms` — one per tool execution                                |
| `agent/{name}`        | `agent.name`, `agent.status`, `agent.duration_ms` — one per subagent                                 |

All three provider backends are covered: OpenAI-compatible, Anthropic, and Gemini.

### Prompt content logging

Full prompt messages and response text are included in traces by default. To disable:

```json
// ~/.proto/settings.json
{
  "telemetry": { "logPrompts": false }
}
```

> **Privacy note:** `logPrompts` is enabled by default. When enabled, full prompt and response content is sent to your Langfuse instance. Set to `false` if you want traces without message content.

### Langfuse activates independently

Langfuse tracing activates from env vars alone — it does not require `telemetry.enabled: true` in settings. The general telemetry pipeline (OTLP/GCP) and Langfuse are independent.

## Task Management

proto integrates [beads_rust](https://github.com/Dicklesworthstone/beads_rust) for persistent, SQLite-backed task tracking. When `br` is on PATH, the 6 task tools (`task_create`, `task_get`, `task_list`, `task_update`, `task_stop`, `task_output`) use it as the backend. Tasks persist across sessions in `.beads/` within the project directory.

If `br` is not installed, tasks fall back to the original in-memory JSON store.

```bash
# The agent uses these automatically, but you can also use br directly:
br list              # See all tasks
br list --json       # Machine-readable output
br create --title "Fix auth bug" --type task --priority 1
br close <id> --reason "Fixed in commit abc123"
```

## Memory

proto has a persistent memory system inspired by Claude Code. Memories are individual markdown files with YAML frontmatter, organized by type and stored per-project or globally.

### Memory types

| Type        | Purpose                               | Example                                        |
| ----------- | ------------------------------------- | ---------------------------------------------- |
| `user`      | Preferences, role, knowledge          | "prefers tabs over spaces"                     |
| `feedback`  | Approach corrections or confirmations | "don't mock the database in integration tests" |
| `project`   | Deadlines, decisions, ongoing work    | "merge freeze starts April 5"                  |
| `reference` | Pointers to external systems          | "bugs tracked in Linear project INGEST"        |

### How it works

Each memory is a `.md` file in `.proto/memory/` (project) or `~/.proto/memory/` (global):

```markdown
---
name: prefer-dark-theme
description: User prefers dark themes in all editors
type: user
---

User explicitly stated they prefer dark themes.
```

A `MEMORY.md` index is auto-generated and loaded into the system prompt at the start of each session. The agent can create memories via the `save_memory` tool, or you can use slash commands:

```
/memory add --project I prefer dark themes
/memory list
/memory forget prefer-dark-theme
/memory show
/memory refresh
```

After each conversation turn, a background extraction agent reviews recent messages and auto-creates memories for notable facts. This runs fire-and-forget with restricted tools (read/write/glob in the memory directory only).

## Agent Harness

proto includes a harness system that enforces quality gates, limits scope, and recovers from failures automatically.

### Sprint Contract (Scope Lock)

Prevents agents from modifying files outside an agreed scope. Before coding begins, negotiate a contract that defines exactly which files will be created or modified. The scope lock is armed — any write outside scope is rejected with a recovery message.

**Workflow:**

```bash
proto
/sprint-contract
> Task: Refactor auth module
> Files: src/auth.ts, src/utils.ts
> Confirm
```

**Behavior:**

- Write to `src/auth.ts` → ALLOWED
- Write to `tests/foo.test.ts` → BLOCKED with scope violation message

Contracts persist at `.proto/sprint-contract.json` and auto-restore on session resume.

### Behavior Verification Gate

Post-run smoke tests that verify changes actually work. After a subagent completes, the gate runs your defined scenarios (shell commands) in parallel. Failures inject a remediation message back to the agent for self-correction.

**Setup** — create `.proto/verify-scenarios.json`:

```json
[
  { "name": "tests pass", "command": "npm test -- --run", "timeoutMs": 60000 },
  { "name": "build works", "command": "npm run build", "timeoutMs": 30000 },
  { "name": "no TypeScript errors", "command": "npm run typecheck" }
]
```

**Behavior:**

1. Agent completes task, reports GOAL
2. Gate fires, runs all scenarios in parallel
3. If any fail → remediation message injected, agent self-corrects
4. Gate fires again until all pass

### Multi-Sample Retry

When a subagent fails (ERROR, MAX_TURNS, or TIMEOUT), proto retries up to 2 more times with escalating temperatures (0.7 → 1.0 → 1.3). Each retry gets a `[RETRY CONTEXT]` block summarizing previous failures. Best result by score is returned.

This reduces false negatives from single-run failures and gives the model multiple chances with different sampling strategies.

### Repo Map

PageRank-based file importance ranking. Analyzes the project's TypeScript/JS import graph to surface the most central files. Useful for understanding codebase structure or finding related files.

**Usage:**

```bash
proto -p "Use the repo_map tool to find the most important files in this codebase"
proto -p "Use repo_map with seedFiles=['src/auth.ts'] to find related files"
```

Results are cached at `.proto/repo-map-cache.json` and auto-invalidate on file changes.

## Skills

proto ships with 22 bundled skills for agentic workflows:

- **adversarial-verification** — Adversarial review and stress-testing of agent output
- **brainstorming** — Structured ideation
- **browser-automation** — Web browser automation
- **coding-agent-standards** — Enforced coding conventions for agent-written code
- **dispatching-parallel-agents** — Fan-out/fan-in subagent patterns
- **executing-plans** — Step-by-step plan execution
- **finishing-a-development-branch** — Pre-merge cleanup
- **harness-reference** — Sprint contracts, verification gates, and retry logic reference
- **loop** — Iterative refinement loops
- **qc-helper** — Quality control checks
- **receiving-code-review** — Process review feedback
- **requesting-code-review** — Generate review requests
- **review** — Code review workflow
- **sprint-contract** — Scope lock and contract negotiation
- **subagent-driven-development** — Delegate to specialized subagents
- **systematic-debugging** — Structured debug methodology
- **test-driven-development** — TDD workflow
- **using-git-worktrees** — Isolated branch work
- **using-superpowers** — Advanced agent capabilities
- **verification-before-completion** — Pre-commit verification
- **writing-plans** — Plan authoring
- **writing-skills** — Skill authoring

Use `/skills` to list available skills in a session.

### Browser Automation

proto includes a native browser automation tool powered by [agent-browser](https://github.com/nickinack/agent-browser). This enables AI agents to interact with websites — navigate, click, fill forms, take screenshots, and extract content.

#### Installation

```bash
npm install -g agent-browser
agent-browser install  # Downloads Chrome
```

#### Usage

```javascript
// Open a website
browser({ action: 'open', url: 'https://example.com' });

// Get interactive elements
browser({ action: 'snapshot', flags: JSON.stringify({ interactive: true }) });

// Click an element
browser({ action: 'click', selector: '@e2' });

// Fill a form
browser({ action: 'fill', selector: '@e1', text: 'user@example.com' });

// Take screenshot
browser({ action: 'screenshot', outputPath: '/path/to/screenshot.png' });
```

#### Key Actions

| Action                         | Description                                |
| ------------------------------ | ------------------------------------------ |
| `open` / `close`               | Navigate to URL or close browser           |
| `click` / `dblclick` / `hover` | Element interaction                        |
| `fill` / `type`                | Form input                                 |
| `snapshot`                     | Get accessibility tree with element refs   |
| `screenshot`                   | Capture page screenshot                    |
| `get` / `is` / `find`          | Query element properties                   |
| `wait`                         | Wait for elements, network, or URL changes |
| `batch`                        | Execute multiple commands in sequence      |

The browser skill (`/skills` → browser-automation) provides comprehensive documentation for all 38 available actions.

## Agent Teams

Run multiple coordinated agents that share tasks and communicate directly with each other.

```
/team start my-team lead:coordinator scout:Explore coder:general-purpose
```

This spawns three live agents immediately. Each member runs as an in-process agent and gets two extra tools injected automatically:

- **`mailbox_send`** — send a message to a teammate by their agentId
- **`mailbox_receive`** — drain all unread messages from your inbox

Members share the same task list (`task_create`, `task_list`, `task_update`) so any agent can create tasks and others can claim them.

### Team commands

| Command                                | Description                           |
| -------------------------------------- | ------------------------------------- |
| `/team start <name> [member:type ...]` | Spawn live agents and start the team  |
| `/team status <name>`                  | Show live member status               |
| `/team stop <name>`                    | Kill all agents and release resources |
| `/team list`                           | List all teams in the project         |
| `/team delete <name>`                  | Delete a team config                  |

**Default team** (no members specified): `lead` (coordinator) + `scout` (Explore).

Agent IDs follow the pattern `<name>-<index>` (e.g. `lead-0`, `scout-1`). Use these when sending mailbox messages between agents.

### Member types

| Type              | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `coordinator`     | Orchestrate subtasks across other members |
| `Explore`         | Fast codebase search and analysis         |
| `general-purpose` | Multi-step implementation tasks           |
| `verify`          | Review and correctness checking           |
| `plan`            | Design plans before implementation        |

Any user-defined sub-agent from `.proto/agents/` can also be used as a member type.

## Commands

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `/help`                 | Show available commands                   |
| `/auth`                 | Configure authentication                  |
| `/model`                | Switch models                             |
| `/skills`               | List available skills                     |
| `/memory show`          | Display loaded memory content             |
| `/memory list`          | List all memories with type, scope, age   |
| `/memory add <fact>`    | Save a memory (`--global` or `--project`) |
| `/memory forget <name>` | Delete a memory                           |
| `/memory refresh`       | Reload memories from disk                 |
| `/clear`                | Clear conversation                        |
| `/compress`             | Compress history to save tokens           |
| `/stats`                | Session info                              |
| `/exit`                 | Exit proto                                |

## Keyboard Shortcuts

| Shortcut    | Action                                                          |
| ----------- | --------------------------------------------------------------- |
| `Ctrl+C`    | Cancel ongoing request. Press twice to exit.                    |
| `Ctrl+D`    | Exit if input is empty.                                         |
| `Ctrl+L`    | Clear the screen                                                |
| `Ctrl+Y`    | Retry the last failed request                                   |
| `Shift+Tab` | Cycle approval modes: `plan` → `default` → `auto-edit` → `yolo` |
| `Up/Down`   | Navigate command history                                        |

See [Keyboard Shortcuts reference](docs/reference/keyboard-shortcuts.md) for the full list.

## Voice Integration

proto supports push-to-talk voice input. Press the mic button in the footer or use `/voice` to toggle.

### Requirements

Voice capture requires a system audio backend:

| OS    | Backend | Install                               |
| ----- | ------- | ------------------------------------- |
| macOS | sox     | `brew install sox`                    |
| Linux | sox     | `apt install sox` / `dnf install sox` |
| Linux | arecord | `apt install alsa-utils` (fallback)   |

Verify detection: `/voice status`

### STT backend

Voice input transcribes audio via a Whisper-compatible `/v1/audio/transcriptions` endpoint. Self-host one (e.g. [faster-whisper-server](https://github.com/fedirz/faster-whisper-server)):

```bash
docker run --gpus all -p 8000:8000 fedirz/faster-whisper-server:latest-cuda
```

```json
// ~/.proto/settings.json
{
  "voice": {
    "enabled": true,
    "sttEndpoint": "http://localhost:8000/v1/audio/transcriptions"
  }
}
```

The default endpoint is `http://localhost:8000/v1/audio/transcriptions` if none is configured.

## Architecture

```
packages/
├── cli/           # Terminal UI (Ink + React)
├── core/          # Agent engine, tools, skills, MCP client
├── sdk-typescript/# TypeScript SDK
├── web-templates/ # Shared web templates
├── webui/         # Shared UI components
└── test-utils/    # Testing utilities
```

## Acknowledgments

Built on [Qwen Code](https://github.com/QwenLM/qwen-code) (Apache 2.0), which is built on [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Apache 2.0). Task management powered by [beads_rust](https://github.com/Dicklesworthstone/beads_rust).

## License

Apache 2.0 — see [LICENSE](./LICENSE).
