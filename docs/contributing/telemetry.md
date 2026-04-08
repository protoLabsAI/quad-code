# Telemetry & Observability

proto is built on [OpenTelemetry](https://opentelemetry.io/) — the vendor-neutral observability standard. All traces, spans, and metrics use OTLP format and can be exported to any compatible backend.

## Langfuse (built-in, recommended)

proto ships with a Langfuse exporter. Set these environment variables to activate it — no other configuration needed:

```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_BASE_URL="https://your-langfuse-instance.example.com"  # optional, defaults to cloud
```

What is traced:

- Every session turn
- All LLM calls (all providers) with token counts
- Tool calls with input/output
- Sub-agent spawns and completions

## OpenTelemetry configuration

Configure via `settings.json` or environment variables:

| Setting              | Env var                    | CLI flag                           | Values          | Default |
| -------------------- | -------------------------- | ---------------------------------- | --------------- | ------- |
| `telemetry.enabled`  | `PROTO_TELEMETRY_ENABLED`  | `--telemetry` / `--no-telemetry`   | `true`/`false`  | `false` |
| `telemetry.target`   | `PROTO_TELEMETRY_TARGET`   | `--telemetry-target <local\|otel>` | `local`, `otel` | `local` |
| `telemetry.endpoint` | `PROTO_TELEMETRY_ENDPOINT` | `--telemetry-endpoint <url>`       | OTLP URL        | —       |

### File-based local output

```json
{
  "telemetry": {
    "enabled": true,
    "target": "local",
    "logFile": "~/.proto/telemetry/traces.jsonl"
  }
}
```

### Export to any OTLP backend (Jaeger, Datadog, etc.)

```json
{
  "telemetry": {
    "enabled": true,
    "target": "otel",
    "endpoint": "http://localhost:4318/v1/traces"
  }
}
```

## What is instrumented

- **Session turns** — user prompt, model response, duration
- **LLM calls** — provider, model, input/output tokens, latency
- **Tool calls** — name, arguments, result, duration
- **Sub-agent lifecycle** — spawn, completion, token usage
- **Harness interventions** — doom loop detection, multi-sample retries

## Privacy

Traces include prompt content and tool outputs by default. For production environments, configure sampling or filtering at your OTLP collector level to avoid capturing sensitive data.
