---
name: harness-reference
description: Reference guide for all agent harness safety features — doom loop detection, scope lock, git checkpoints, observation masking, sprint contract, reminders, repo map, behavior verification, and multi-sample retry
---

# Agent Harness Reference

The proto harness is a set of safety and reliability features that wrap every agent execution. They fire automatically — you don't need to invoke them manually. This skill documents each feature so you can understand what's protecting you and how to configure it.

## Features

### Doom Loop Detection

**What it does:** Detects when the agent is repeating the same tool call pattern in a sliding 20-call window. If the same fingerprint (tool + args hash) appears 3+ times, the harness injects a recovery message and records a Langfuse span.

**You don't need to do anything.** The harness detects this automatically.

### Scope Lock (Sprint Contract)

**What it does:** Before coding, the `sprint-contract` skill negotiates an explicit contract — the set of files that may change. Once activated, any write outside that set is blocked with a structured error.

**To activate:** Use the `sprint-contract` skill at the start of an implementation task. It writes `.proto/sprint-contract.json` and arms the in-memory scope lock. The lock is restored on session restart.

**To check status:** If a write is blocked, the error message tells you the violating path and the permitted set.

### Git Checkpoints

**What it does:** Before every file-mutating tool call (`write_file`, `edit`, `replace`), the harness creates a shadow-repo commit. This lets you diff or roll back to any pre-edit state.

**To roll back:** Use `git log` to find the checkpoint commit and `git checkout <hash> -- <file>` to restore.

### Observation Masking

**What it does:** When the context window gets large, the harness applies a rolling verbatim window — tool-call/result pairs older than the window are summarized as `[OBSERVATION_MASK: N pairs omitted]`. This keeps recent context intact while reducing token usage.

**You don't need to do anything.** Fires automatically during LLM compaction.

### Harness Reminders

**What it does:** The harness injects periodic reminders into context based on three triggers:

- Every 50 tool calls: warns about high tool usage
- After 3 consecutive test failures: suggests pausing to diagnose
- After 8 turns without any file write: suggests the agent may be over-analyzing

**You don't need to do anything.** The harness injects these automatically.

### Repo Map (`repo_map` tool)

**What it does:** Analyzes the import graph of the codebase and runs PageRank to surface the most-connected (and most-relevant) files. Call it at the start of any exploration or implementation task for fast orientation.

**To use:**

```
repo_map {}                          # globally most-connected files
repo_map { seedFiles: ["/abs/path"] } # personalized from known-relevant files
```

Results are cached at `.proto/repo-map-cache.json` and invalidated on file changes.

### Behavior Verification Gate

**What it does:** After every subagent task that completes successfully, the harness runs user-configured "verification scenarios" — shell commands that check your feature actually works. Failures are injected back to the agent for self-correction.

**To configure:** Create `.proto/verify-scenarios.json`:

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

See `.proto/verify-scenarios.example.json` for a full reference.

### Multi-Sample Retry (`multi_sample: true`)

**What it does:** When a subagent fails (doom loop, error, or max turns exceeded), the harness automatically retries up to 2 more times with escalating temperatures (0.7 → 1.0 → 1.3) and injects the failure context into each retry prompt. The best result among all attempts is returned and scored.

**Scoring:**

- GOAL + behavior gate pass → 3 (perfect)
- GOAL + no gate / gate pass → 3
- GOAL + gate fail → 2 (completed but not verified)
- MAX_TURNS / TIMEOUT → 1 (partial)
- ERROR → 0 (failure)

**To enable:** Set `multi_sample: true` on the Agent tool call:

```
Agent {
  subagent_type: "general-purpose",
  prompt: "implement the auth service",
  multi_sample: true
}
```

Use for complex tasks with a history of failure, not for simple searches.

### Sprint Contract Service

**What it does:** Manages the full sprint contract lifecycle — parse, activate scope lock, persist to disk, load on resume. See the `sprint-contract` skill for usage.

**Files involved:**

- `.proto/sprint-contract.json` — persisted contract (restored on session start)
- `SprintContractService` — programmatic API

## Langfuse Fine-Tuning Data

All harness interventions emit OTel spans routed to Langfuse via OTLP → Tempo. To build fine-tuning datasets:

1. In Langfuse > Traces, filter by span name = `harness.intervention`
2. Use `harness.intervention.type` attribute to segment by type:
   - `doom_loop` — recovery from loops
   - `scope_violation` — scope lock enforcement
   - `verification_failed` — post-edit and behavior gate failures
   - `reminder.*` — context reminders
3. Export matching traces → dataset items
4. Annotate `harness.outcome` = `"recovered"` | `"not_recovered"`
5. Train on (input_context, intervention_message) pairs where outcome = recovered

## Configuration Summary

| Feature                 | Config location                                  | Default                              |
| ----------------------- | ------------------------------------------------ | ------------------------------------ |
| Doom loop threshold     | Code constant (`DOOM_REPEAT_THRESHOLD = 3`)      | Always on                            |
| Scope lock              | `.proto/sprint-contract.json`                    | Off until sprint-contract skill runs |
| Behavior gate scenarios | `.proto/verify-scenarios.json`                   | No scenarios (off)                   |
| Multi-sample retry      | `multi_sample: true` on Agent call               | Off (opt-in)                         |
| Observation mask window | Code constant (`INCREMENTAL_PROTECTED_TAIL`)     | Always on                            |
| Harness reminders       | Code constants (50 calls / 3 failures / 8 turns) | Always on                            |
