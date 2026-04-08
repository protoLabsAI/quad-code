# Authentication

proto supports multiple authentication methods. The recommended approach for most users is API key authentication via `modelProviders`.

## Methods

### API key (recommended)

Connect to OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint.

Configure `~/.proto/settings.json`:

```json
{
  "modelProviders": {
    "openai": [{ "id": "gpt-4o", "envKey": "OPENAI_API_KEY" }]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "gpt-4o" }
}
```

Set the key:

```bash
export OPENAI_API_KEY="sk-..."
```

See [Reference → Model Providers](./model-providers) for the full schema.

## Set API keys

Keys are resolved in this order (first match wins):

| Priority    | Source                                       |
| ----------- | -------------------------------------------- |
| 1 (highest) | CLI flag (`--openai-api-key`, etc.)          |
| 2           | Shell environment (`export KEY=...`)         |
| 3           | `.proto/.env` or `.env` (project, then home) |
| 4 (lowest)  | `settings.json` → `env` field                |

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

## Auth CLI commands

```bash
proto auth              # interactive setup
proto auth status       # show current configuration
```

## In-session commands

```
/auth                   # change auth interactively
/model                  # switch models
```

## Environment variable lookup

The `envKey` field in `modelProviders` specifies the name of the environment variable that holds the API key. proto reads `process.env[envKey]` at request time — keys are never persisted in settings.

## Security notes

- Never commit API keys to version control.
- Prefer shell `export` or `.proto/.env` over the `env` field in `settings.json`.
- Use `.proto/.env` (not `.env`) to avoid conflicts with other tools. Add it to `.gitignore`.
