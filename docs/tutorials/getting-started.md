# Getting Started with proto

By the end of this tutorial you will have proto installed, connected to a model, and running your first agentic session in a real project.

## Before you begin

You need:

- A terminal (macOS, Linux, or Windows WSL)
- Node.js 20 or later — download from [nodejs.org](https://nodejs.org/en/download)
- A project directory to work in
- An API key for at least one model provider (OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint)

## Step 1: Install proto

```bash
npm install -g proto
```

Verify the installation:

```bash
proto --version
```

> [!note]
> Restart your terminal after installation if the `proto` command is not found.

### Optional: install the beads task tracker

proto integrates with `beads_rust` (`br`), a SQLite-backed per-project task tracker. Install it with Cargo:

```bash
cargo install beads_rust
```

See [Reference → Beads Task Tracker](../reference/beads) for full CLI documentation.

## Step 2: Configure a model

proto connects to any OpenAI-compatible, Anthropic, or Gemini API. Add your provider to `~/.proto/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY"
      }
    ]
  }
}
```

Then export your key in your shell (do **not** put secrets directly in settings.json):

```bash
export OPENAI_API_KEY=sk-...
```

For other providers — Anthropic, Gemini, or a local endpoint — see [Guides → Configure Models & Auth](../guides/configure-models).

## Step 3: Start your first session

Open a terminal in any project directory and start proto:

```bash
cd /path/to/your/project
proto
```

On first launch you will be prompted to pick a model. Use `/model` at any time to switch.

## Step 4: Try your first prompts

Ask proto to explore the project:

```
what does this project do?
```

```
explain the folder structure
```

Ask it to make a change:

```
add a hello world function to the main file
```

proto will find the right file, show you the proposed edit, and ask for approval before writing anything.

## Step 5: Use Git with proto

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

```
create a new branch called feature/hello-world
```

## Essential commands

| Command            | What it does                    |
| ------------------ | ------------------------------- |
| `proto`            | Start an interactive session    |
| `proto -p "..."`   | One-shot non-interactive mode   |
| `/help`            | List all slash commands         |
| `/model`           | Switch the active model         |
| `/auth`            | Change authentication           |
| `/compress`        | Compress history to save tokens |
| `/clear`           | Clear the screen (`Ctrl+L`)     |
| `/quit` or `/exit` | Exit proto                      |

See [Reference → Commands](../reference/commands) for the full list.

## Tips for effective sessions

**Be specific** — instead of "fix the bug", say "fix the login screen blank-page bug that appears after three failed attempts".

**Break down large tasks** — proto works best with focused requests. For complex work, describe one step at a time or use the [`coordinator` sub-agent](../guides/use-sub-agents).

**Let proto explore first** — before making changes, ask it to read and summarize the relevant code.

**Use approval mode** — by default proto asks before every file write. See [Guides → Approval Mode](../guides/approval-mode) to adjust this.

## Next steps

- [Build Your First Sub-Agent](./first-agent) — delegate tasks to specialized agents
- [Create Your First Skill](./first-skill) — package reusable expertise into a skill
- [Guides](../guides/) — task-oriented how-tos for MCP, hooks, headless mode, IDE integration, and more
