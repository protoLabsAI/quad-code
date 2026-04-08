# Development Workflow

## Prerequisites

- **Node.js `~20.19.0`** — required for development due to an upstream dependency. Use [nvm](https://github.com/nvm-sh/nvm) to manage versions.
- **Git**
- **Rust toolchain** (optional — only needed for `beads_rust` task tracker)

## Setup

```bash
git clone https://github.com/protoLabsAI/protoCLI.git
cd protoCLI
npm install
```

## Build

```bash
npm run build        # build all packages
npm run ship         # build + link globally as `proto`
npm run dev          # run from source (no build needed)
```

## Run

```bash
proto                # interactive CLI (after npm run ship)
npm start            # run from source
proto -p "..."       # one-shot mode
```

## Test

```bash
npm run test         # unit tests (Vitest)
npm run test:e2e     # integration tests
```

### Integration tests

Integration tests live in `integration-tests/`. They require proto to be built and available in PATH:

```bash
npm run ship
npm run test:e2e
```

## Code quality

```bash
npm run preflight    # lint + format + build + test (run before every PR)
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # TypeScript type check
```

## Package structure

| Package                         | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `packages/cli`                  | Terminal UI, command parsing, user interaction |
| `packages/core`                 | Backend: API client, tools, agents, memory     |
| `packages/sdk-typescript`       | TypeScript SDK (`@proto/sdk`)                  |
| `packages/test-utils`           | Shared test utilities                          |
| `packages/vscode-ide-companion` | VS Code extension                              |
| `packages/webui`                | Web UI components                              |
| `packages/zed-extension`        | Zed editor extension                           |

## Release process

Releases are managed via GitHub Actions (`.github/workflows/release.yml`).

| Type    | Schedule                          |
| ------- | --------------------------------- |
| Nightly | Every day at midnight UTC         |
| Preview | Every Tuesday at 23:59 UTC        |
| Stable  | Manual — triggered by maintainers |

To trigger a manual release:

1. Go to **Actions → Release**.
2. Click **Run workflow**.
3. Enter the version (`v0.x.y`), ref (`main`), and dry-run flag.

### Install release types

```bash
npm install -g proto              # latest stable
npm install -g proto@preview      # preview
npm install -g proto@nightly      # nightly
npm install -g proto@0.5.0        # specific version
```

## Deployment notes

See `docs/developers/development/deployment.md` (in the old tree, migrated content) for Docker image and CI/CD setup details.

## Issue automation

PRs and issues use GitHub Actions for labelling and triage. Configuration is in `.github/`. See `docs/developers/development/issue-and-pr-automation.md` in the old tree for details.
