# Model Providers

Full reference for the `modelProviders` configuration schema in `settings.json`.

## Overview

`modelProviders` declares which models are available for each authentication protocol. Keys must be valid auth types: `openai`, `anthropic`, or `gemini`.

```json
{
  "modelProviders": {
    "openai": [{ "id": "gpt-4o", "envKey": "OPENAI_API_KEY" }],
    "anthropic": [
      { "id": "claude-sonnet-4-20250514", "envKey": "ANTHROPIC_API_KEY" }
    ],
    "gemini": [{ "id": "gemini-2.5-pro", "envKey": "GEMINI_API_KEY" }]
  }
}
```

## Model entry fields

| Field              | Required | Description                                                             |
| ------------------ | -------- | ----------------------------------------------------------------------- |
| `id`               | Yes      | Model ID sent to the API (also used as the config identifier)           |
| `name`             | No       | Display name in `/model` picker (defaults to `id`)                      |
| `envKey`           | Yes      | Name of the environment variable holding the API key                    |
| `baseUrl`          | No       | API endpoint override (for proxies, local servers, or custom endpoints) |
| `description`      | No       | Description shown in `/model` picker                                    |
| `generationConfig` | No       | Fine-tuning options (see below)                                         |

> [!important]
> `envKey` specifies the **name** of an environment variable, not the key itself. Set the variable separately via shell export, `.proto/.env`, or the `env` field.

## `generationConfig` fields

| Field                | Type    | Description                                                                            |
| -------------------- | ------- | -------------------------------------------------------------------------------------- |
| `timeout`            | number  | Request timeout in ms                                                                  |
| `maxRetries`         | number  | Max retries on failure                                                                 |
| `enableCacheControl` | boolean | Enable prompt caching                                                                  |
| `contextWindowSize`  | number  | Declared context window size                                                           |
| `samplingParams`     | object  | `temperature`, `top_p`, `max_tokens`, `presence_penalty`, `frequency_penalty`, `top_k` |
| `customHeaders`      | object  | Extra HTTP headers per request                                                         |
| `extra_body`         | object  | Extra fields added to the request body (OpenAI only)                                   |
| `schemaCompliance`   | string  | Gemini-specific schema compliance mode                                                 |
| `modalities`         | object  | `{ image: true }` to enable vision                                                     |

### Important: the impermeable provider layer

When a model is selected from `modelProviders`, its `generationConfig` is applied **atomically** — global `settings.model.generationConfig` is not merged in. Fields not specified by the provider are `undefined`, not inherited.

This ensures provider configurations are self-contained and predictable.

## Auth types and SDKs

| Key         | API format        | SDK                  |
| ----------- | ----------------- | -------------------- |
| `openai`    | OpenAI-compatible | `openai` npm package |
| `anthropic` | Anthropic         | `@anthropic-ai/sdk`  |
| `gemini`    | Google GenAI      | `@google/genai`      |

> [!warning]
> If an auth type key contains a typo (e.g. `openai-custom`), the configuration is silently skipped and models will not appear in `/model`. Always use exactly `openai`, `anthropic`, or `gemini`.

## Duplicate model IDs

Duplicate `id` values within the same auth type are not supported. The first occurrence wins; subsequent duplicates are skipped with a warning.

## Example: multiple providers

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2, "max_tokens": 4096 }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o via OpenRouter",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1"
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
        "envKey": "GEMINI_API_KEY",
        "generationConfig": { "contextWindowSize": 1000000 }
      }
    ]
  }
}
```

## Example: local model (Ollama)

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

## Settings merge strategy

`modelProviders` from project settings **replaces** (not merges with) user settings. Define `modelProviders` in `~/.proto/settings.json` to avoid conflicts.

## Resolution precedence (full)

| Priority    | Source                            | Takes precedence for                               |
| ----------- | --------------------------------- | -------------------------------------------------- |
| 1 (highest) | CLI flags                         | `--model`, `--auth-type`, `--openai-api-key`, etc. |
| 2           | `modelProviders` entry            | All `generationConfig` fields (impermeable)        |
| 3           | `settings.model.generationConfig` | Runtime models only                                |
| 4           | Provider SDK defaults             | Runtime models only                                |

See [Guides → Configure Models & Auth](../guides/configure-models) for a practical quick-start.
