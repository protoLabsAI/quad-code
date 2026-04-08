# Sandboxing

Run proto inside a sandbox to isolate shell commands and file writes from your host system.

## Enable sandboxing

| Method               | How                                      |
| -------------------- | ---------------------------------------- |
| CLI flag             | `proto -s -p "..."` or `proto --sandbox` |
| Environment variable | `export PROTO_SANDBOX=true`              |
| Settings             | `{ "tools": { "sandbox": true } }`       |

`PROTO_SANDBOX` overrides the CLI flag and settings if set.

To force a specific provider:

```bash
export PROTO_SANDBOX=docker        # Docker
export PROTO_SANDBOX=podman        # Podman
export PROTO_SANDBOX=sandbox-exec  # macOS Seatbelt
```

## Sandbox methods

### macOS Seatbelt (macOS only)

Lightweight, built-in, no Docker required. Restricts writes outside the project directory; allows most other operations and outbound network.

**Best for:** Most macOS users.

### Container (Docker / Podman)

Full process isolation. Works on any OS. proto mounts your workspace and `~/.proto/` into the container.

**Best for:** Linux/Windows, or when you need a full Linux userland.

## macOS Seatbelt profiles

Set with the `SEATBELT_PROFILE` environment variable:

| Profile                     | Writes     | Network        |
| --------------------------- | ---------- | -------------- |
| `permissive-open` (default) | Restricted | Allowed        |
| `permissive-closed`         | Restricted | Blocked        |
| `permissive-proxied`        | Restricted | Via proxy only |
| `restrictive-open`          | Strict     | Allowed        |
| `restrictive-closed`        | Strict     | Blocked        |
| `restrictive-proxied`       | Strict     | Via proxy only |

Start with `permissive-open`, then tighten as needed.

**Custom profile** — create `.proto/sandbox-macos-<profile_name>.sb` and set `SEATBELT_PROFILE=<profile_name>`.

## Container configuration

**Custom image:**

```bash
export PROTO_SANDBOX_IMAGE=my-org/my-image:latest
```

Or `--sandbox-image <image>` on the CLI.

**Extra Docker/Podman flags:**

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

**Extend the default image** — create `.proto/sandbox.Dockerfile`:

```dockerfile
FROM ghcr.io/proto-labs/proto:latest

RUN apt-get update && apt-get install -y openjdk-17-jre && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
```

Then rebuild:

```bash
PROTO_SANDBOX=docker BUILD_SANDBOX=1 proto -s
```

## Network proxying

To restrict outbound network to an allowlist, run a local proxy alongside the sandbox:

```bash
export PROTO_SANDBOX_PROXY_COMMAND="my-proxy-server"
```

The proxy must listen on `:::8877`. Use with `*-proxied` Seatbelt profiles. See [Contributing → Examples → Proxy Script](../contributing/examples/proxy-script) for a reference implementation.

## Linux UID/GID mapping

On Linux, proto defaults to mapping host UID/GID into the container. Override:

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable mapping
```

## Troubleshooting

| Symptom                       | Fix                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| "Operation not permitted"     | Try a more permissive Seatbelt profile; check container mounts |
| Missing commands in container | Add them via `.proto/sandbox.Dockerfile`                       |
| Network issues                | Check profile allows network; verify proxy config              |

Debug mode:

```bash
DEBUG=1 proto -s -p "check environment"
```

## Security notes

- Sandboxing reduces but does not eliminate all risk.
- Use the most restrictive profile that still allows your workflow.
- Container overhead is minimal after the first pull.
- GUI applications may not work inside a sandbox.
