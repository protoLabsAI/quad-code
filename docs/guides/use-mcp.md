# Connect via MCP

proto connects to external tools and data sources through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). MCP servers give proto access to databases, APIs, file systems, and any custom tooling you expose.

## Add your first server

```bash
proto mcp add --transport http my-server http://localhost:3000/mcp
```

Then open a session and ask proto to use tools from that server. MCP tools appear automatically in the model's tool list.

## Configuration scopes

- **Project** (default): `.proto/settings.json`
- **User**: `~/.proto/settings.json` (add `--scope user` to `proto mcp add`)

## Transport types

| Transport | Use when                              | Key field          |
| --------- | ------------------------------------- | ------------------ |
| `http`    | Remote services, cloud MCP servers    | `httpUrl`          |
| `sse`     | Legacy servers (Server-Sent Events)   | `url`              |
| `stdio`   | Local process (scripts, CLIs, Docker) | `command` + `args` |

Prefer **HTTP** over SSE when a server supports both.

## Configure via `settings.json`

### Stdio (local process)

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "cwd": "./mcp-servers/python",
      "env": { "DATABASE_URL": "$DB_CONNECTION_STRING" },
      "timeout": 15000
    }
  }
}
```

### HTTP (remote)

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer your-token" },
      "timeout": 5000
    }
  }
}
```

### SSE (legacy)

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

## Server configuration options

| Property       | Type     | Description                                                      |
| -------------- | -------- | ---------------------------------------------------------------- |
| `command`      | string   | Executable path (stdio)                                          |
| `url`          | string   | SSE endpoint URL                                                 |
| `httpUrl`      | string   | HTTP streaming endpoint URL                                      |
| `args`         | string[] | Arguments for stdio command                                      |
| `env`          | object   | Environment variables (`$VAR` syntax supported)                  |
| `cwd`          | string   | Working directory for stdio                                      |
| `timeout`      | number   | Request timeout in ms (default: 600,000)                         |
| `trust`        | boolean  | Skip all confirmation prompts for this server                    |
| `includeTools` | string[] | Allowlist of tool names from this server                         |
| `excludeTools` | string[] | Denylist of tool names (`excludeTools` wins over `includeTools`) |
| `headers`      | object   | HTTP headers for `url`/`httpUrl` transports                      |

## Safety controls

**Trust a server** — skip confirmations (use sparingly):

```json
{ "trust": true }
```

**Filter tools per server:**

```json
{
  "mcpServers": {
    "myServer": {
      "command": "my-server",
      "includeTools": ["safe_tool", "read_data"],
      "excludeTools": ["delete_all"]
    }
  }
}
```

**Global allow/deny lists:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## `proto mcp` CLI

```bash
proto mcp                                          # open management dialog
proto mcp add <name> <command-or-url> [args...]    # add a server
proto mcp add --transport http <name> <url>        # add HTTP server
proto mcp add --scope user <name> ...              # add to user scope
proto mcp remove <name>                            # remove a server
proto mcp list                                     # list configured servers
```

Common `add` flags:

| Flag                | Description                        |
| ------------------- | ---------------------------------- |
| `-s`, `--scope`     | `project` (default) or `user`      |
| `-t`, `--transport` | `stdio`, `sse`, `http`             |
| `-e`, `--env`       | Environment variable (`KEY=value`) |
| `-H`, `--header`    | HTTP header                        |
| `--timeout`         | Timeout in ms                      |
| `--trust`           | Trust the server                   |
| `--include-tools`   | Comma-separated allowlist          |
| `--exclude-tools`   | Comma-separated denylist           |

## Server instructions

MCP servers can embed usage guidance in their `initialize` response via an `instructions` field. proto automatically appends these to the system prompt:

```
# MCP Server Instructions

## MCP Server: my-server

<instructions from the server>
```

If you are building an MCP server, implement the `instructions` field to guide the model without requiring users to write `AGENTS.md` entries.

## Troubleshooting

| Symptom                        | Fix                                                     |
| ------------------------------ | ------------------------------------------------------- |
| Server shows "Disconnected"    | Verify the URL/command is correct; increase `timeout`   |
| Stdio server fails to start    | Use absolute path for `command`; check `cwd` and `env`  |
| Env vars don't resolve in JSON | Ensure the variable exists in the shell that runs proto |
