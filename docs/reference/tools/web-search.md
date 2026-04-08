# Web Search (`web_search`)

Performs a web search and returns a concise answer with source citations.

## Parameters

| Parameter  | Required | Description                                                                           |
| ---------- | -------- | ------------------------------------------------------------------------------------- |
| `query`    | Yes      | Search query                                                                          |
| `provider` | No       | Provider to use (`dashscope`, `tavily`, `google`); uses configured default if omitted |

## Supported providers

| Provider    | Notes                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `dashscope` | Available with API key auth                                           |
| `tavily`    | High-quality with built-in answer generation; requires Tavily API key |
| `google`    | Google Custom Search JSON API; requires API key + Search Engine ID    |

## Configuration

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-..." },
      {
        "type": "google",
        "apiKey": "...",
        "searchEngineId": "..."
      }
    ]
  }
}
```

The first provider in the list is the default. Set API keys via environment variables or the `env` field — do not hardcode secrets.

## Confirmation

Requires confirmation before searching.
