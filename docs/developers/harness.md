# Agent Harness

The agent harness is a set of safety and reliability services that wrap every subagent execution in proto. Most features fire automatically — you only need to configure the ones that require project-specific setup.

## Overview

| Feature                                                     | Trigger              | Configuration                  |
| ----------------------------------------------------------- | -------------------- | ------------------------------ |
| [Doom loop detection](#doom-loop-detection)                 | Automatic            | None                           |
| [Scope lock (sprint contract)](#scope-lock-sprint-contract) | Opt-in               | Run `sprint-contract` skill    |
| [Git checkpoints](#git-checkpoints)                         | Automatic            | None                           |
| [Observation masking](#observation-masking)                 | Automatic            | None                           |
| [Harness reminders](#harness-reminders)                     | Automatic            | None                           |
| [Repo map](#repo-map)                                       | On-demand tool       | None                           |
| [Behavior verification gate](#behavior-verification-gate)   | Automatic after GOAL | `.proto/verify-scenarios.json` |
| [Multi-sample retry](#multi-sample-retry)                   | Opt-in per call      | `multi_sample: true`           |

---

## Doom Loop Detection

Detects when an agent repeats the same tool-call pattern. A fingerprint is computed from `(tool_name, args_hash)`. If the same fingerprint appears 3 or more times in a sliding 20-call window, the harness injects a recovery message and records a `harness.intervention` OTel span.

No configuration required. The harness recovers silently; you will see the intervention message in the agent's output if it fires.

---

## Scope Lock (Sprint Contract)

Before starting an implementation task, the `sprint-contract` skill negotiates an explicit contract — the set of files that may be written. Once activated, any write outside that set is blocked with a structured error message naming the violating path and the permitted set.

The contract is persisted to `.proto/sprint-contract.json` and **automatically restored on session restart**, so you don't lose scope protection after a reconnect.

### Activating

Run the built-in skill at the start of any bounded task:

```
/sprint-contract
```

The skill asks which files and directories are in scope, then writes `.proto/sprint-contract.json` and arms the in-memory lock.

### File format

```json
{
  "allowedPaths": ["src/auth/", "tests/auth/"],
  "activatedAt": "2025-04-07T14:00:00.000Z"
}
```

---

## Git Checkpoints

Before every file-mutating tool call (`write_file`, `edit`, `replace`), the harness commits the current project state to a shadow repository at `~/.proto/history/<project_hash>`. This is separate from your project's own git history.

To inspect or restore a checkpoint:

```bash
# List checkpoint commits
git -C ~/.proto/history/<project_hash> log --oneline

# Restore a file from a checkpoint
git -C ~/.proto/history/<project_hash> show <hash>:path/to/file > path/to/file
```

No configuration required.

---

## Observation Masking

When the context window grows large during a long agent run, the harness summarizes old tool-call/result pairs as `[OBSERVATION_MASK: N pairs omitted]` while keeping the most recent exchanges verbatim. This prevents context overflow without losing the work the agent has done.

No configuration required. The masking fires automatically during LLM compaction.

---

## Harness Reminders

The harness injects short reminder messages into the agent's context based on three triggers:

| Trigger                     | Message injected                                                  |
| --------------------------- | ----------------------------------------------------------------- |
| Every 50 tool calls         | Warning about high tool usage, suggestion to check for loops      |
| 3 consecutive test failures | Suggestion to pause and diagnose before retrying                  |
| 8 turns with no file write  | Suggestion that the agent may be over-analyzing instead of acting |

No configuration required.

---

## Repo Map

The `repo_map` tool analyzes the project's import graph and runs PageRank (damping factor 0.85, 30 iterations) to surface the most-connected source files. It is most useful at the start of a task when the agent needs to orient itself in an unfamiliar codebase.

### Usage

```
repo_map {}
```

Returns the top 20 files by PageRank score, with their exports listed.

```
repo_map { "seedFiles": ["/abs/path/to/known-file.ts"] }
```

Personalized ranking: files that import or are imported by the seed files are boosted.

### Parameters

| Parameter   | Type       | Default | Description                                                  |
| ----------- | ---------- | ------- | ------------------------------------------------------------ |
| `seedFiles` | `string[]` | `[]`    | Absolute paths to files the agent already knows are relevant |
| `topN`      | `number`   | `20`    | Number of files to return (max 50)                           |

### Caching

Results are cached at `.proto/repo-map-cache.json`. The cache is invalidated when any of 50 randomly sampled source files has a newer mtime than the cache. Call `service.invalidate()` programmatically to force a rebuild.

### Built-in agent guidance

The `Explore` and `Plan` built-in agents are instructed to call `repo_map` at the start of tasks on large codebases.

---

## Behavior Verification Gate

After a subagent completes a task with `GOAL` termination, the harness runs user-defined verification scenarios — shell commands that confirm the feature actually works. If any scenario fails, the failure output is injected back to the agent with a structured remediation message so it can self-correct.

### Configuration

Create `.proto/verify-scenarios.json` in your project root:

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
  },
  {
    "name": "API health check",
    "command": "curl -sf http://localhost:3000/health",
    "expectedPattern": "ok",
    "timeoutMs": 5000
  }
]
```

### Scenario fields

| Field             | Required | Description                                                                            |
| ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `name`            | Yes      | Human-readable label shown in output                                                   |
| `command`         | Yes      | Shell command to run                                                                   |
| `expectedPattern` | No       | Regex that stdout must match for the scenario to pass. If omitted, exit code 0 = pass. |
| `timeoutMs`       | No       | Per-scenario timeout in milliseconds (default: 30 000)                                 |

### How it interacts with multi-sample retry

When `multi_sample: true` is set on the Agent call, the behavior gate runs after each GOAL attempt. An attempt that passes the gate scores 3/3 (perfect). An attempt that completes but fails the gate scores 2/3. This lets the selector prefer the verified result even if a later attempt also completed.

---

## Multi-Sample Retry

When a subagent fails (error, max turns, or timeout), the harness can automatically retry up to 2 more times with escalating temperatures and failure context injected into each retry prompt. The best result across all attempts is returned.

### Enabling

Set `multi_sample: true` on the Agent tool call:

```json
{
  "subagent_type": "general-purpose",
  "description": "Implement the auth service",
  "prompt": "...",
  "multi_sample": true
}
```

Use `multi_sample` for complex implementation tasks where failure is costly. Do not use it for searches or read-only tasks — the overhead is not worth it.

### Temperature ladder

| Attempt | Temperature | Rationale                                   |
| ------- | ----------- | ------------------------------------------- |
| 1       | 0.7         | Conservative — follows instructions closely |
| 2       | 1.0         | Balanced — some exploration                 |
| 3       | 1.3         | Creative — tries a different approach       |

### Failure context injection

Each retry prompt includes a `[RETRY CONTEXT]` block summarizing the previous attempt(s): their termination mode and the first 300 characters of their output. This tells the agent what went wrong and encourages a different approach.

### Scoring

Attempts are scored and the best is selected. Ties prefer the earlier (lower-temperature) attempt.

| Outcome                                | Score |
| -------------------------------------- | ----- |
| GOAL + behavior gate pass (or no gate) | 3     |
| GOAL + gate fail                       | 2     |
| MAX_TURNS or TIMEOUT                   | 1     |
| ERROR or DOOM_LOOP                     | 0     |

### Output

When more than one attempt ran, a summary is appended to the final result:

```
Multi-sample: 2 attempt(s), best score 3/3
  Attempt 1 [temp=0.7]: FAILED — ERROR
  Attempt 2 [temp=1.0]: SUCCESS — GOAL
```

### Tool filtering

Retry attempts are routed through `SubagentManager.createAgentHeadless`, which applies the subagent's tool allowlist and denylist identically to the original attempt. You will not see tools appear in retries that were not available in the first attempt.

---

## Telemetry and Fine-Tuning

All harness interventions emit OTel spans under the `proto.harness` tracer, routed to Langfuse via OTLP → Tempo.

| Span name                     | When emitted                                                 |
| ----------------------------- | ------------------------------------------------------------ |
| `harness.doom_loop`           | Doom loop detected                                           |
| `harness.scope_violation`     | Write blocked by scope lock                                  |
| `harness.verification_failed` | Behavior gate scenario failed                                |
| `harness.reminder.*`          | Harness reminder injected                                    |
| `harness.multi_sample`        | Multi-sample run (one span per full run, events per attempt) |

### Building fine-tuning datasets from Langfuse

1. In Langfuse > Traces, filter by span name `harness.intervention`
2. Segment by `harness.intervention.type`: `doom_loop`, `scope_violation`, `verification_failed`, `reminder.*`
3. Export matching traces as dataset items
4. Annotate `harness.outcome` = `"recovered"` | `"not_recovered"`
5. Train on `(input_context, intervention_message)` pairs where `outcome = "recovered"`

For multi-sample fine-tuning, filter by `harness.multi_sample` spans. Each span has `attempt.index`, `attempt.temperature`, `attempt.terminate_mode`, and `attempt.score` event attributes. The `(failed_attempt_context, successful_recovery_prompt)` pairs are the training signal.
