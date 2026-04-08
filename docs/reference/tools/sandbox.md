# Sandboxing

Sandboxing restricts what shell commands and file tools can do by isolating them from the host system.

## How sandboxing interacts with tools

When sandboxing is enabled:

- `run_shell_command` runs inside the sandbox environment.
- `write_file` and `edit` are restricted to the project directory (Seatbelt) or the mounted workspace (container).
- MCP stdio servers must be launchable from inside the sandbox.

## Enable sandboxing

```bash
proto -s -p "..."          # CLI flag
export PROTO_SANDBOX=true  # environment variable
```

Or in settings:

```json
{ "tools": { "sandbox": true } }
```

## Methods

| Method                    | Platform   | Notes                                                  |
| ------------------------- | ---------- | ------------------------------------------------------ |
| `sandbox-exec` (Seatbelt) | macOS only | Lightweight, built-in, no Docker required              |
| `docker` / `podman`       | Any        | Full isolation; proto mounts workspace and `~/.proto/` |

Force a provider: `export PROTO_SANDBOX=docker` (or `podman`, `sandbox-exec`).

## Tool availability in sandboxes

Tools that spawn subprocesses (like MCP stdio servers) must be available inside the sandbox:

- **Seatbelt**: your host binaries are used, but some paths may be restricted
- **Container**: add missing tools to `.proto/sandbox.Dockerfile`

## Related

- [Guides → Sandboxing](../../guides/use-sandbox) — full configuration, Seatbelt profiles, container setup
- [Contributing → Examples → Proxy Script](../../contributing/examples/proxy-script) — network proxy for restricted sandboxes
