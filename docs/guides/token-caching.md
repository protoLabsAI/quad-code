# Token Caching

proto automatically caches frequently repeated content — system instructions, context files, and conversation history — to reduce the number of tokens processed on each API call.

## How it works

When you use API key authentication (OpenAI, Anthropic, Gemini, or any compatible provider), proto sends cache-control hints alongside your requests. The provider stores the cached content and serves it from cache on subsequent turns, charging only for the new tokens.

No configuration is required — caching activates automatically when the provider supports it.

## Monitor savings

Run `/stats` inside a session to see your cached token savings:

```
/stats
```

When caching is active, the stats display shows how many input tokens were served from cache and the percentage saved. For example:

```
10,500 (90.4%) of input tokens were served from the cache, reducing costs.
```

This information only appears when cached tokens are being used (API key auth). It does not appear for OAuth sessions.

## Provider support

Token caching is available for:

- OpenAI-compatible providers (via `openai` auth type)
- Anthropic Claude (via `anthropic` auth type)
- Google Gemini (via `gemini` auth type)

Caching behaviour and cost savings vary by provider. Refer to your provider's documentation for specifics.

## Tips for maximising cache hits

- Keep your context files (`PROTO.md`, `AGENTS.md`) stable across turns — changes invalidate the cache.
- Use long sessions rather than many short ones — the cache warms up over the conversation.
- Avoid changing the system prompt between turns.
