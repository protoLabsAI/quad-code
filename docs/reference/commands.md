# Commands

Commands in proto fall into three categories based on their prefix.

## Slash commands (`/`)

### Session management

| Command     | Description                                               |
| ----------- | --------------------------------------------------------- |
| `/init`     | Analyse current directory and create initial context file |
| `/summary`  | Generate project summary from conversation history        |
| `/compress` | Replace chat history with summary to save tokens          |
| `/resume`   | Resume a previous conversation session                    |
| `/restore`  | Restore files to state before tool execution              |
| `/export`   | Export session to file (`html`, `md`, `json`, `jsonl`)    |

### Interface

| Command         | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| `/clear`        | Clear terminal screen (`Ctrl+L`)                                    |
| `/context`      | Show context window usage breakdown                                 |
| `/theme`        | Change visual theme                                                 |
| `/vim`          | Toggle Vim editing mode                                             |
| `/directory`    | Manage multi-directory workspace                                    |
| `/editor`       | Select preferred editor                                             |
| `/voice`        | Toggle push-to-talk voice input on or off (persisted to settings)   |
| `/voice status` | Show voice input status: enabled state, STT endpoint, audio backend |

### Language

| Command                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `/language`               | Show current language settings                      |
| `/language ui [lang]`     | Set UI language (e.g. `zh-CN`, `en-US`, `de-DE`)    |
| `/language output <lang>` | Set LLM output language (e.g. `Chinese`, `English`) |

### Tools & models

| Command                 | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `/mcp`                  | List configured MCP servers and tools                         |
| `/tools`                | List available tools                                          |
| `/skills [name]`        | List or invoke skills                                         |
| `/approval-mode <mode>` | Change approval mode (`plan`, `default`, `auto-edit`, `yolo`) |
| `/model`                | Switch model                                                  |
| `/model --fast <model>` | Set fast model for background tasks                           |
| `/extensions`           | List active extensions                                        |
| `/memory`               | Manage memory                                                 |
| `/agents create`        | Guided sub-agent creation wizard                              |
| `/agents manage`        | View, edit, delete sub-agents                                 |
| `/team`                 | Manage agent teams                                            |
| `/arena`                | Start an Agent Arena session                                  |
| `/lsp status`           | Show LSP server status                                        |

### Information & settings

| Command              | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `/help` or `/?`      | Display help                                                     |
| `/about`             | Display version information                                      |
| `/stats`             | Show session statistics (tokens, costs, cached tokens)           |
| `/settings`          | Open settings editor                                             |
| `/setup`             | Reminder to run `proto setup` (wizard requires a fresh terminal) |
| `/auth`              | Change authentication method                                     |
| `/permissions`       | Manage folder trust                                              |
| `/bug <description>` | Submit a bug report                                              |
| `/copy`              | Copy last output to clipboard                                    |
| `/quit` or `/exit`   | Exit proto                                                       |

### Auth CLI subcommands (terminal, outside session)

| Command             | Description              |
| ------------------- | ------------------------ |
| `proto auth`        | Interactive auth setup   |
| `proto auth status` | Show current auth status |

### Setup CLI subcommand (terminal, outside session)

| Command       | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| `proto setup` | Interactive wizard — configure a model provider, API key, default model |

See [Guides → Run the Setup Wizard](../guides/setup-wizard) for a full walkthrough.

## `@` commands — inject files

| Form           | Description                                    |
| -------------- | ---------------------------------------------- |
| `@<file>`      | Inject content of a file into the conversation |
| `@<directory>` | Recursively read all text files in a directory |

Escape spaces in paths with backslash: `@My\ Documents/file.txt`.

## `!` commands — shell execution

| Form             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `!<command>`     | Execute in a subshell                                    |
| `!` (standalone) | Toggle shell mode — all input goes directly to the shell |

Shell commands set `PROTO_CODE=1` in the environment.

## Custom commands

Save frequently-used prompts as slash commands.

- **Global commands**: `~/.proto/commands/<name>.md`
- **Project commands**: `.proto/commands/<name>.md`

Project commands take priority over global when names conflict.

Subdirectories create namespaced commands: `.proto/commands/git/commit.md` → `/git:commit`.

### File format

```markdown
---
description: Optional description shown in /help
---

Your prompt content here. Use {{args}} for parameter injection.
```

### Special syntax

| Syntax             | Effect                                            |
| ------------------ | ------------------------------------------------- |
| `{{args}}`         | Inject user-provided arguments                    |
| `@{file path}`     | Inject file content                               |
| `!{shell command}` | Execute and inject output (requires confirmation) |
