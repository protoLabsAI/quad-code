# Beads Task Tracker (`br`)

`br` (`beads_rust`) is an agent-first, per-project task tracker backed by SQLite + JSONL. proto integrates with it natively via the `task_*` tools.

## Install

```bash
cargo install beads_rust
```

## How it works

- Issue data is stored in `.beads/beads.db` in your project root
- Data is also flushed to JSONL for portability
- `br` auto-discovers the database by walking up from the current directory — all commands work from any subdirectory
- proto's `br` skill initializes a workspace on first use via `br init`

## Global flags

| Flag                  | Description                           |
| --------------------- | ------------------------------------- |
| `--json`              | Machine-readable JSON output          |
| `--db <PATH>`         | Override database path                |
| `--actor <NAME>`      | Actor name for audit trail            |
| `--no-color`          | Disable ANSI color                    |
| `-q`, `--quiet`       | Suppress all output except errors     |
| `-v`, `--verbose`     | Increase verbosity (repeat for `-vv`) |
| `--allow-stale`       | Skip freshness check warning          |
| `--lock-timeout <MS>` | SQLite busy timeout in ms             |
| `--no-auto-flush`     | Skip JSONL export after writes        |
| `--no-auto-import`    | Skip JSONL import check on startup    |

## Workspace management

```bash
br init          # initialize .beads/ workspace
br where         # print .beads/ path
br info          # show diagnostics (db path, issue count, prefix)
br doctor        # run diagnostics and repair
br upgrade       # upgrade br in-place
```

### Config

```bash
br config list               # all config options
br config get <key>          # get a value
br config set <key> <value>  # set a value
br config delete <key>       # remove a value
br config edit               # open in $EDITOR
br config path               # show config file locations
```

Key config options:

```yaml
issue_prefix: proto # prefix for auto-generated IDs
default_priority: 2 # 0=critical … 4=backlog
default_type: task
```

## Create issues

```bash
br create "Fix the login bug" -t bug -p 1 -d "Users see blank screen after 3 failed attempts"
```

| Flag            | Short | Type         | Description                                                   |
| --------------- | ----- | ------------ | ------------------------------------------------------------- |
| `--title`       | —     | string       | Issue title (1–500 chars)                                     |
| `--type`        | `-t`  | string       | `task`, `bug`, `feature`, `epic`, `chore`, `docs`, `question` |
| `--priority`    | `-p`  | 0–4 or P0–P4 | 0=critical, 4=backlog                                         |
| `--description` | `-d`  | string       | Body / detailed description                                   |
| `--assignee`    | `-a`  | string       | Assign to a person                                            |

## List and search

```bash
br list                          # list all open issues
br list -s open                  # filter by status
br list -t bug                   # filter by type
br list -p 0                     # filter by priority
br list --assignee alice          # filter by assignee
br list --json | jq '.[] | .id'  # machine-readable output
br search "login"                # full-text search
```

## View an issue

```bash
br show <ID>
br show <ID> --json
```

## Update issues

```bash
br update <ID> --status in-progress
br update <ID> --priority 0
br update <ID> --assignee bob
br update <ID> --title "New title"
```

Status values: `open`, `in-progress`, `review`, `done`, `cancelled`, `blocked`.

## Close / resolve

```bash
br close <ID>
br resolve <ID>
```

## Claim (agent task assignment)

```bash
br claim <ID> --actor agent-01   # atomically claim an issue
br unclaim <ID>                  # release a claim
```

Claiming is atomic — only one agent can claim an issue at a time. Used by proto for multi-agent task coordination.

## Epics

```bash
br epic create "Auth refactor" --description "..."
br epic list
br epic add <ISSUE_ID> --epic <EPIC_ID>    # add issue to an epic
br epic show <EPIC_ID>
```

## Export / import

```bash
br export                        # flush DB to JSONL
br import                        # re-import from JSONL
br export --format csv > issues.csv
```

## proto integration

proto uses `br` via the `task_create`, `task_update`, `task_list`, `task_get`, `task_ready`, `task_output`, and `task_stop` tools. These map directly to `br` operations.

The `br` skill (`/skills br`) bootstraps a workspace and provides proto with instructions for claiming and updating tasks in multi-agent workflows.
