# Configure Models & Auth

proto connects to any OpenAI-compatible, Anthropic, or Gemini API endpoint. This guide covers how to add providers, set API keys, and switch models at runtime.

## Quickest setup — one file

Put everything in `~/.proto/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "baseUrl": "https://api.openai.com/v1",
        "envKey": "OPENAI_API_KEY"
      }
    ]
  },
  "env": {
    "OPENAI_API_KEY": "sk-..."
  },
  "security": {
    "auth": { "selectedType": "openai" }
  },
  "model": { "name": "gpt-4o" }
}
```

Then run `proto` — no interactive auth setup needed.

> [!warning]
> Do not commit API keys to version control. Prefer shell `export` or `.proto/.env` over the `env` field for sensitive secrets.

## Supported protocols

| Protocol key | API format        | Example providers                                  |
| ------------ | ----------------- | -------------------------------------------------- |
| `openai`     | OpenAI-compatible | OpenAI, Azure, OpenRouter, Ollama, vLLM, LM Studio |
| `anthropic`  | Anthropic         | Claude                                             |
| `gemini`     | Google GenAI      | Gemini                                             |

## Configure multiple providers

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

## Set API keys

Keys are resolved in this order (first match wins):

1. Shell environment (`export OPENAI_API_KEY=...`)
2. `.proto/.env` or `.env` file (project or home directory)
3. `settings.json` → `env` field (lowest priority)

**Shell profile (recommended):**

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="AIza..."
```

**`.proto/.env` file:**

```
OPENAI_API_KEY=sk-...
```

Add `.proto/.env` to `.gitignore`.

## Connect a local model

Use the `openai` protocol with a local `baseUrl`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "llama3",
        "name": "Llama 3 (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1"
      }
    ]
  },
  "env": { "OLLAMA_API_KEY": "ollama" }
}
```

Works with Ollama, vLLM, LM Studio, and any other OpenAI-compatible local server.

## Switch models at runtime

Inside a proto session:

```
/model
```

The picker shows all configured models grouped by protocol. Your selection persists across sessions.

From the command line:

```bash
proto --model gpt-4o
```

## `generationConfig` — fine-tune a model

Each model entry accepts an optional `generationConfig`:

```json
{
  "id": "gpt-4o",
  "envKey": "OPENAI_API_KEY",
  "generationConfig": {
    "timeout": 60000,
    "maxRetries": 3,
    "samplingParams": {
      "temperature": 0.2,
      "max_tokens": 4096
    }
  }
}
```

The provider's `generationConfig` is applied atomically — it is not merged with global settings. See [Reference → Model Providers](../reference/model-providers) for the full field reference.

## Authentication commands

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `/auth`             | Interactive auth setup inside a session |
| `proto auth`        | Interactive auth from the terminal      |
| `proto auth status` | Show current auth configuration         |

## Troubleshooting

- **Model not appearing in `/model` picker** — check that the `authType` key in `modelProviders` is exactly `openai`, `anthropic`, or `gemini`. Typos are silently skipped.
- **API key not found** — run `echo $YOUR_ENV_KEY` to confirm the variable is set in the same shell that runs proto.
- **Duplicate model IDs** — if two entries share the same `id` under one authType, the first wins. Use distinct IDs.

See [Reference → Model Providers](../reference/model-providers) for the full schema.
