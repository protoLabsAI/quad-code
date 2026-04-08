# Settings

proto is configured through JSON settings files combined with environment variables and command-line flags.

## Configuration layers (precedence, lowest → highest)

| Level | Source                                         | Scope                              |
| ----- | ---------------------------------------------- | ---------------------------------- |
| 1     | Hardcoded defaults                             | Built-in                           |
| 2     | System defaults file                           | All users on the machine           |
| 3     | User settings file (`~/.proto/settings.json`)  | Current user, all projects         |
| 4     | Project settings file (`.proto/settings.json`) | This project only                  |
| 5     | System settings file                           | All users (administrator override) |
| 6     | Environment variables / `.env` files           | Session                            |
| 7     | Command-line arguments                         | This invocation                    |

## Settings file locations

| File             | Location                                                             |
| ---------------- | -------------------------------------------------------------------- |
| User settings    | `~/.proto/settings.json`                                             |
| Project settings | `.proto/settings.json` (project root)                                |
| System defaults  | macOS: `/Library/Application Support/ProtoCode/system-defaults.json` |
| System overrides | macOS: `/Library/Application Support/ProtoCode/settings.json`        |

Override system file paths with `PROTO_SYSTEM_DEFAULTS_PATH` and `PROTO_SYSTEM_SETTINGS_PATH`.

> [!note]
> String values in `settings.json` support `$VAR` and `${VAR}` environment variable interpolation.

## Project directory (`.proto/`)

In addition to `settings.json`, the `.proto/` directory can contain:

- `.proto/agents/` — custom sub-agent definitions
- `.proto/skills/` — project skills
- `.proto/memory/` — project memory files
- `.proto/settings.json` — project settings
- `.proto/sandbox-macos-custom.sb` — custom Seatbelt profile
- `.proto/sandbox.Dockerfile` — custom container image
- `.proto/verify-scenarios.json` — post-agent verification scenarios

## Available settings

### `general`

| Setting                         | Type    | Default | Description                                     |
| ------------------------------- | ------- | ------- | ----------------------------------------------- |
| `general.preferredEditor`       | string  | —       | Editor for opening files                        |
| `general.vimMode`               | boolean | `false` | Vim keybindings in input                        |
| `general.enableAutoUpdate`      | boolean | `true`  | Check for updates on startup                    |
| `general.gitCoAuthor`           | boolean | `true`  | Add `Co-authored-by` trailer to git commits     |
| `general.checkpointing.enabled` | boolean | `false` | Session checkpointing for recovery              |
| `general.defaultFileEncoding`   | string  | `utf-8` | Encoding for new files (`utf-8` or `utf-8-bom`) |
| `general.lsp`                   | boolean | —       | Enable LSP support globally                     |
| `general.language`              | string  | auto    | UI language code (e.g. `en-US`, `zh-CN`)        |

### `output`

| Setting         | Type   | Default | Values         |
| --------------- | ------ | ------- | -------------- |
| `output.format` | string | `text`  | `text`, `json` |

### `ui`

| Setting                                 | Type    | Default | Description                           |
| --------------------------------------- | ------- | ------- | ------------------------------------- |
| `ui.theme`                              | string  | —       | Theme name or path to theme JSON file |
| `ui.customThemes`                       | object  | `{}`    | Custom theme definitions              |
| `ui.accessibility.enableLoadingPhrases` | boolean | `true`  | Show loading phrases                  |

### `model`

| Setting                                     | Type    | Default | Description                                |
| ------------------------------------------- | ------- | ------- | ------------------------------------------ |
| `model.name`                                | string  | —       | Default model ID to use on startup         |
| `model.generationConfig.enableCacheControl` | boolean | `true`  | Enable token caching                       |
| `model.generationConfig.timeout`            | number  | —       | Request timeout (ms)                       |
| `model.generationConfig.maxRetries`         | number  | —       | Max retries on failure                     |
| `model.generationConfig.samplingParams`     | object  | —       | `temperature`, `top_p`, `max_tokens`, etc. |

### `modelProviders`

Declare available models per auth type. See [Model Providers](./model-providers) for the full schema.

### `security`

| Setting                        | Type    | Default | Description                                                   |
| ------------------------------ | ------- | ------- | ------------------------------------------------------------- |
| `security.auth.selectedType`   | string  | —       | Active auth type on startup (`openai`, `anthropic`, `gemini`) |
| `security.folderTrust.enabled` | boolean | `false` | Enable the Trusted Folders security feature                   |

### `permissions`

| Setting                            | Type    | Default   | Description                                                    |
| ---------------------------------- | ------- | --------- | -------------------------------------------------------------- |
| `permissions.defaultMode`          | string  | `default` | Default approval mode (`plan`, `default`, `auto-edit`, `yolo`) |
| `permissions.confirmShellCommands` | boolean | `true`    | Require approval for shell commands                            |
| `permissions.confirmFileEdits`     | boolean | `true`    | Require approval for file edits                                |

### `tools`

| Setting         | Type           | Default | Description                                                             |
| --------------- | -------------- | ------- | ----------------------------------------------------------------------- |
| `tools.sandbox` | boolean/string | `false` | Enable sandboxing (`true`, `false`, `docker`, `podman`, `sandbox-exec`) |

### `mcpServers`

Map of MCP server configurations. See [Guides → Connect via MCP](../guides/use-mcp) for the full schema.

### `mcp`

| Setting        | Type     | Description                   |
| -------------- | -------- | ----------------------------- |
| `mcp.allowed`  | string[] | Allowlist of MCP server names |
| `mcp.excluded` | string[] | Denylist of MCP server names  |

### `arena`

| Setting                   | Type   | Default          | Description                        |
| ------------------------- | ------ | ---------------- | ---------------------------------- |
| `arena.worktreeBaseDir`   | string | `~/.proto/arena` | Base directory for Arena worktrees |
| `arena.maxRoundsPerAgent` | number | `50`             | Max reasoning rounds per agent     |
| `arena.timeoutSeconds`    | number | `600`            | Timeout per agent                  |

### `experimental`

| Setting             | Type    | Default | Description            |
| ------------------- | ------- | ------- | ---------------------- |
| `experimental.cron` | boolean | `false` | Enable scheduled tasks |

### `env`

Map of environment variable names to values. Lowest-priority API key fallback. **Do not commit secrets.**

### `hooks`

Hook event configuration. See [Guides → Use Hooks](../guides/use-hooks) for the full schema.

### `disableAllHooks`

| Setting           | Type    | Default | Description                                     |
| ----------------- | ------- | ------- | ----------------------------------------------- |
| `disableAllHooks` | boolean | `false` | Disable all hooks without deleting their config |

## Configuration migration

Legacy `disable*` settings are automatically migrated to `enable*` names. Old files are backed up before migration.
