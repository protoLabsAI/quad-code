# JetBrains IDEs

Use proto inside any JetBrains IDE (IntelliJ IDEA, WebStorm, PyCharm, etc.) via the Agent Client Protocol (ACP).

## Requirements

- JetBrains IDE with ACP support
- proto installed (`npm i -g proto`)

## Installation

### From the ACP Registry (recommended)

1. Open your JetBrains IDE and navigate to the **AI Chat** tool window.
2. Click **Add ACP Agent** → **Install**.
3. Find **proto** in the registry and install it.

> If you already have JetBrains AI Assistant or other ACP agents, click **Install From ACP Registry** in the Agents List, then install proto ACP.

### Manual configuration (older IDE versions)

1. In the AI Chat tool window, click the **⋯** menu → **Configure ACP Agent**.
2. Add:

```json
{
  "agent_servers": {
    "proto": {
      "command": "/path/to/proto",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

Replace `/path/to/proto` with the output of `which proto`.

## Features

- **Native agent panel** — integrated AI assistant in the IDE
- **ACP support** — full Agent Client Protocol
- **Symbol management** — `#`-mention files to add them to conversation context
- **Conversation history** — access past conversations within the IDE

## Troubleshooting

**Agent not appearing**

- Run `proto --version` in terminal to verify installation
- Ensure your JetBrains IDE version supports ACP
- Restart the IDE

**proto not responding**

- Verify the CLI works by running `proto` in a terminal
- Check your internet connection
- [File an issue on GitHub](https://github.com/protoLabsAI/protoCLI/issues)
