# Agent Harness

The agent harness is a set of safety and reliability services that wrap every sub-agent execution in proto. Most features fire automatically — you configure only the ones that need project-specific setup.

## Features at a glance

| Feature                      | Trigger                 | Configuration                  |
| ---------------------------- | ----------------------- | ------------------------------ |
| Doom loop detection          | Automatic               | None                           |
| Scope lock (sprint contract) | Opt-in                  | Run `/sprint-contract` skill   |
| Git checkpoints              | Automatic               | None                           |
| Observation masking          | Automatic               | None                           |
| Harness reminders            | Automatic               | None                           |
| Repo map                     | On-demand tool          | None                           |
| Behavior verification gate   | Automatic after success | `.proto/verify-scenarios.json` |
| Multi-sample retry           | Opt-in per call         | `multi_sample: true`           |

---

## Doom loop detection

Detects when an agent repeats the same tool-call pattern. A fingerprint is computed from `(tool_name, args_hash)`. If the same fingerprint appears 3+ times in a sliding 20-call window, the harness injects a recovery message.

No configuration required.

---

## Scope lock (sprint contract)

Before starting a bounded implementation task, the `sprint-contract` skill negotiates an explicit contract — the set of files that may be written. Any write outside that set is blocked with a structured error naming the violating path and the permitted set.

The contract is persisted to `.proto/sprint-contract.json` and automatically restored on session restart.

### Activate

```
/sprint-contract
```

### File format

```json
{
  "allowedPaths": ["src/auth/", "tests/auth/"],
  "activatedAt": "2026-04-07T14:00:00.000Z"
}
```

---

## Git checkpoints

Before every file-mutating tool call (`write_file`, `edit`), the harness commits the current project state to a shadow repository at `~/.proto/history/<project_hash>`.

Inspect or restore:

```bash
git -C ~/.proto/history/<project_hash> log --oneline
git -C ~/.proto/history/<project_hash> show <hash>:path/to/file > path/to/file
```

No configuration required.

---

## Observation masking

When the context window grows large during a long agent run, the harness summarizes old tool-call/result pairs as `[OBSERVATION_MASK: N pairs omitted]` while keeping the most recent exchanges verbatim. Prevents context overflow without losing work history.

No configuration required.

---

## Repo map

`repo_map` is a tool available to agents that builds a PageRank-ranked map of the most relevant source files in the repository, using the import graph and optionally seed files to personalize results.

The `Explore` and `plan` agents use it automatically at the start of tasks on large codebases. Any agent can call it explicitly.

Results are cached at `.proto/repo-map-cache.json`.

---

## Behavior verification gate

Run automatic post-task verification scenarios after a sub-agent completes successfully. If any scenario fails, the failure is fed back to the agent for self-correction.

Create `.proto/verify-scenarios.json`:

```json
[
  {
    "name": "Unit tests pass",
    "command": "npm test -- --run",
    "timeoutMs": 60000
  },
  {
    "name": "Build succeeds",
    "command": "npm run build",
    "timeoutMs": 30000
  }
]
```

Scenarios run in parallel. Each has:

| Field             | Required | Description                    |
| ----------------- | -------- | ------------------------------ |
| `name`            | Yes      | Display name                   |
| `command`         | Yes      | Shell command to run           |
| `timeoutMs`       | No       | Timeout in ms (default: 60000) |
| `expectedPattern` | No       | Regex the stdout must match    |

Exit code 0 = pass (when no `expectedPattern`).

---

## Multi-sample retry

For high-stakes tasks where a single failed attempt is costly, set `multi_sample: true` on an Agent tool call. The harness retries up to 2 more times with escalating temperatures (0.7 → 1.0 → 1.3) if the first attempt fails.

Each retry receives a `[RETRY CONTEXT]` block summarizing what went wrong.

### Scoring

| Outcome                          | Score |
| -------------------------------- | ----- |
| GOAL reached + verification pass | 3     |
| GOAL reached                     | 3     |
| Partial progress                 | 1     |
| Error / doom loop                | 0     |

The highest-scoring attempt is returned. Ties go to the lower-temperature (earlier) attempt.

**Use for:** complex implementation tasks.
**Do not use for:** searches, read-only queries.
