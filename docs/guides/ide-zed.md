# Zed

Use proto directly inside Zed via the Agent Client Protocol (ACP).

## Requirements

- Zed Editor (latest version)
- proto installed (`npm i -g proto`)

## Installation

### From the ACP Registry (recommended)

1. Open Zed and click the **settings button** in the top-right corner.
2. Select **"Add agent"** → **"Install from Registry"**.
3. Find **proto** and click **Install**.

### Manual configuration

1. In Zed, click the settings button → **"Add agent"** → **"Create a custom agent"**.
2. Add the following configuration:

```json
"proto": {
  "type": "custom",
  "command": "proto",
  "args": ["--acp"],
  "env": {}
}
```

## Features

- **Native agent panel** — integrated AI assistant within Zed's interface
- **ACP support** — full Agent Client Protocol for advanced IDE interactions
- **File management** — @-mention files to add them to conversation context
- **Conversation history** — access past conversations within Zed

## Troubleshooting

**Agent not appearing**

- Run `proto --version` in terminal to verify installation
- Check that the JSON configuration is valid
- Restart Zed

**proto not responding**

- Verify the CLI works by running `proto` in a terminal
- Check your internet connection
- [File an issue on GitHub](https://github.com/protoLabsAI/protoCLI/issues)
