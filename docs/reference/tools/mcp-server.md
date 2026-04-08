# MCP Servers

MCP (Model Context Protocol) servers expose custom tools that appear alongside proto's built-in tools. Configure them in `settings.json` or with `proto mcp add`.

## How MCP tools work

1. proto connects to configured MCP servers at session start.
2. Each server's tools are registered in proto's tool list.
3. The model calls MCP tools the same way it calls built-in tools.
4. proto forwards the call to the server and returns the result.

## Configuration

```json
{
  "mcpServers": {
    "my-server": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "env": { "API_KEY": "$MY_API_KEY" },
      "timeout": 15000
    }
  }
}
```

See [Guides → Connect via MCP](../../guides/use-mcp) for the full configuration reference and transport options (stdio, HTTP, SSE).

## Server instructions

MCP servers can embed usage guidance in their `initialize` response. proto appends these to the system prompt automatically:

```
# MCP Server Instructions

## MCP Server: my-server

<instructions from server>
```

## Tool filtering

Restrict which tools from a server are exposed to the model:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "my-server",
      "includeTools": ["read_data", "list_items"],
      "excludeTools": ["delete_all"]
    }
  }
}
```

## Trust

Set `trust: true` on a server to skip confirmation prompts for all its tools (use sparingly):

```json
{ "trust": true }
```

## Sandbox note

When sandboxing is enabled, MCP servers must be available **inside** the sandbox environment. For stdio servers launched via `npx`, the `npx` executable must be present in the sandbox image or Seatbelt environment.
