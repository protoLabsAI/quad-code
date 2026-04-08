# Troubleshooting

## Authentication errors

**`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`**

Corporate network with TLS inspection. Set the path to your CA certificate:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.crt
```

**Stuck on auth type after failed authentication**

proto may persist `security.auth.selectedType` in `settings.json` after a failed auth attempt. Clear it:

```bash
# Remove the selectedType line from:
~/.proto/settings.json
.proto/settings.json   # if project-scoped
```

## Common errors

**`Command not found: proto`**

- Check that your npm global bin directory is in `$PATH`: `npm config get prefix`
- Reinstall: `npm install -g proto`

**`MODULE_NOT_FOUND` or import errors**

1. `npm install`
2. `npm run build`
3. Verify: `npm start`

**`EADDRINUSE` when starting an MCP server**

Another process is using the port. Stop it or configure the MCP server to use a different port.

**`Operation not permitted` in sandbox**

The sandbox is restricting an operation outside the project directory. See [Guides → Sandboxing](../guides/use-sandbox) to adjust the Seatbelt profile or container mounts.

**proto not entering interactive mode in CI**

If a `CI_` prefixed environment variable is set (e.g. `CI_TOKEN`), proto detects a non-interactive CI environment. Unset it for the command:

```bash
env -u CI_TOKEN proto
```

**`DEBUG=true` not working from project `.env`**

`DEBUG` and `DEBUG_MODE` are excluded from project `.env` files by default. Use `.proto/.env` instead, or adjust `advanced.excludedEnvVars` in settings.

## FAQs

**How do I update proto?**

```bash
npm install -g proto@latest
```

**Where are settings stored?**

- Global: `~/.proto/settings.json`
- Project: `.proto/settings.json`

See [Reference → Settings](./settings) for full documentation.

**Why don't I see cached token counts in `/stats`?**

Token caching is available for API key auth. It does not appear for OAuth sessions.

**How do I run proto in headless mode?**

```bash
proto -p "Your prompt here"
```

See [Guides → Run Headless](../guides/run-headless) for all flags and output formats.

## Debugging

Enable verbose output:

```bash
proto --debug -p "..."
```

Enable LSP debug logs:

```bash
DEBUG=lsp* proto --lsp
```

Inspect sandbox environment:

```bash
proto -s -p "run shell command: env | grep SANDBOX"
```
