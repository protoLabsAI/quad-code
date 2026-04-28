# Divergence from Upstream (`QwenLM/qwen-code`)

A maintainer-oriented map of how `protoLabsAI/protoCLI` differs from the
`qwen-code` upstream we forked from. The intent is to make it easy to:

- Reason about which subsystems are ours vs. inherited drift,
- Understand _why_ each divergence exists before changing or porting it,
- Decide which upstream PRs are worth porting and which we have intentionally
  walked away from.

**Snapshot at time of writing (April 2026):**

- Merge base: `20e51e3d3039687710cb95e63bfaaf24f8686721`
- Fork-unique commits since divergence: 301
- Upstream commits not in the fork: 639 (mix of intentionally-skipped and not-yet-evaluated)
- Versions: fork on **0.26.x**, upstream on **0.15.x** (fork bumps are independent and aggressive)
- Files added by fork (excluding docs/lockfiles): ~190
- Files deleted relative to merge base: 413 (mostly the VSCode webview, Qwen
  OAuth, `qwen-*` workflows, and SDK Java)

The headline: this is no longer a thin rebrand. The fork has built a serious
agent harness on top of qwen-code's TUI + ACP plumbing, and has rewritten the
streaming converter and ignore-file machinery to be safer for our LiteLLM +
Anthropic deployment. Most of upstream's recent feature work (Python SDK, Java
SDK, VSCode companion, qwen-oauth, multilingual UI churn) is irrelevant to us
or actively counter to where we are going.

---

## 1. Identity & Branding

This is the layer that is closest to a pure rename, but it is mechanically
load-bearing because the binary name, NPM scope, and config dirs all track it.

| Concept        | Upstream                                 | Fork                                                                                |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Binary name    | `qwen`                                   | `proto` (`packages/cli/package.json:17`)                                            |
| NPM scope      | `@qwen-code/qwen-code`                   | `@protolabs/proto` (CLI), `@protolabsai/proto` (workspace root), `@protolabsai/sdk` |
| Config dir     | `~/.qwen/`                               | `~/.proto/` (referenced from settings & `QWEN_DIR` constant)                        |
| Window title   | `Qwen - <folder>`                        | `protoCLI - <folder>` (`packages/cli/src/utils/windowTitle.ts:14`)                  |
| Ignore file    | `.qwenignore`                            | `.protoignore` (+ `.claudeignore` — see §4)                                         |
| Repo root org  | `QwenLM/qwen-code`                       | `protoLabsAI/protoCLI`                                                              |
| Locale strings | `Qwen Code` mentioned throughout `en.js` | Cleaned to `proto` (`packages/cli/src/i18n/locales/en.js`)                          |

**Things still labeled with `Qwen` deliberately:**

- The internal package name `@qwen-code/qwen-code-core` (`packages/core/package.json:2`)
  — renaming would force every fork-unique import line to be touched and is
  not worth the merge-conflict surface during ongoing upstream backports.
- The `QwenCode` value in the `ExtensionOriginSource` enum
  (`packages/core/src/config/config.ts:277`) — kept for compatibility with
  user-installed extensions that record their origin.
- `DEFAULT_QWEN_MODEL` constant and the `QWEN_DIR` storage constant — same
  reasoning. Internal identifier, not user-visible.
- `sandboxImageUri: ghcr.io/qwenlm/qwen-code:0.26.5` (`package.json:23`) —
  we do not yet ship our own sandbox image.

**Honest take:** if you read `packages/core` source, you will still see
`Qwen` in dozens of places. The user-visible surface is consistently `proto`.

---

## 2. Inference & LLM Plumbing

This is the most architecturally interesting divergence, because it is where
we deviate from upstream in _behavior_, not just in branding. Our deployment
stack is **proto → LiteLLM → (Anthropic | vLLM)**, which is a different
shape from upstream's primary path of **qwen-code → DashScope/Modelscope /
qwen-oauth direct**. Several of our changes exist specifically because the
LiteLLM gateway and vLLM-served Qwen tool-call templates do things that
DashScope does not.

### 2.1 `protoInternal: true` Part flag

`packages/core/src/utils/partUtils.ts:14-26`

A Proto-namespaced boolean on `Part` objects that marks them as
**model-visible / UI-hidden**. The model still sees the text on the next
turn (so it can self-correct), but every UI surface filters them out.

Used today for tool-call recovery notes injected when upstream streams
malformed JSON arguments — the model needs the note ("retry the call with
properly-formed arguments") but the user shouldn't see error noise.

Filtered at:

- `packages/core/src/utils/partUtils.ts:98` — `partToString`
- `packages/core/src/utils/thoughtUtils.ts:71`
- `packages/cli/src/ui/utils/resumeHistoryUtils.ts:36, 55` — session resume
- `packages/cli/src/acp-integration/session/Session.ts:355, 531` — ACP surface
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts:21`

This is genuinely novel — upstream has no equivalent escape hatch. If we
ever want more "things the model needs to see but the user shouldn't",
this flag is the seam.

### 2.2 Per-stream converter context (`ConverterStreamContext`)

`packages/core/src/core/openaiContentGenerator/converter.ts:104-164`

We backported upstream's #3525 (which scoped the streaming tool-call parser
per-stream to fix concurrent-stream bleed) and **extended it** to also scope
`<think>`-tag accumulator state. The struct is:

```ts
export interface ConverterStreamContext {
  toolCallParser: StreamingToolCallParser;
  thinkBuffer: string;
  inThinkTag: boolean;
}
```

Why we care: parallel subagents, fork children, and ACP concurrent Agent
calls (#3463) all hit `Config.contentGenerator` simultaneously. With shared
state, two concurrent streams could land tool-call chunks at the same
`index=0` bucket and emit interleaved corrupt JSON (the `NO_RESPONSE_TEXT`
issue from upstream #3516). Same problem applied to the `<think>` parser
once we added Minimax/QwQ inline-XML reasoning support.

The fix: `createStreamContext()` per stream, passed into every
`convertOpenAIChunkToGemini` call, then dropped when the stream finishes.
No reset bookkeeping at all.

### 2.3 Malformed tool-call drop with internal recovery note

`packages/core/src/core/openaiContentGenerator/converter.ts:1184-1196`
`packages/core/src/core/openaiContentGenerator/streamingToolCallParser.ts:280-314`

Defense-in-depth pattern for the LiteLLM + vLLM stack. If the streaming
parser fails every JSON-recovery strategy (raw parse, close-quote retry,
`jsonrepair`), it returns `{ args: {}, malformed: true }`. The converter
then **drops the call entirely** and pushes a `protoInternal: true` text
part telling the model to retry.

Without this, two failure modes hit users:

1. The actual tool invocation fires with empty args and the tool either
   errors loudly or does the wrong thing.
2. The conversation history records the broken function call. Pydantic
   validators in LiteLLM (or in the next provider hop) reject it on the
   next turn with a generic 400 — the agent has no way to recover.

### 2.4 `<think>`-tag inline reasoning extraction

`packages/core/src/core/openaiContentGenerator/converter.ts:166-274, 997, 1126+`

Models served via vLLM (Minimax, QwQ-style reasoners) emit reasoning as
inline `<think>...</think>` XML in the content channel rather than as
separate `reasoning_content`. We strip the tag and route the inner content
to the Gemini `thought` part. Handles cross-chunk split tags via
`_partialOpenMatch` heuristic.

This is fork-only. Upstream's reasoning-content path assumes a separate
SSE field, which is what DashScope/OpenAI both produce.

### 2.5 MAX_TOKENS cascade detection + tool-response trimming

`packages/core/src/core/geminiChat.ts:204-260+`

When the previous turn has a `functionResponse` whose error contains
`"truncated due to max_tokens limit"`, we treat the next turn as a recovery
attempt and proactively cap large successful tool responses to
`LARGE_TOOL_RESPONSE_TRIM_CHARS = 10_000` (~2.5 K tokens). This stops the
agent from getting stuck in a "tool truncated → retry → tool result eats
output budget → tool truncated" loop.

This is paired with a fork-specific lower default: `DEFAULT_OUTPUT_TOKEN_LIMIT
= 16_000` (`packages/core/src/core/tokenLimits.ts:12`), down from upstream's
32 K. Conservative default, but it leaves more headroom for context on
Anthropic models.

### 2.6 Provider stack notes

`packages/core/src/core/openaiContentGenerator/provider/` includes
`anthropic`, `dashscope`, `deepseek`, `default`, `modelscope`, `openrouter`.
The Anthropic content generator is a sibling under
`packages/core/src/core/anthropicContentGenerator/` rather than living as
an OpenAI-shape provider — this matters because Anthropic's tool-call
streaming, prompt caching, and thinking are first-class, not adapters.

---

## 3. ACP / Session Layer

`packages/cli/src/acp-integration/session/`

The ACP (Agent Client Protocol) layer is more elaborate in the fork than
upstream:

- `HistoryReplayer.ts` — modular event replay for resumed sessions.
- `SubAgentTracker.ts` — tracks tool calls originating from sub-agents
  (for parallel-agent/team flows) so the ACP surface can attribute them
  correctly.
- `emitters/` — split into `ToolCallEmitter`, `PlanEmitter`,
  `MessageEmitter` for clean event boundaries.

### Cron in Session

`Session.ts:115-462`

The Session class owns a per-session cron queue:

- `cronQueue: string[]` and `cronProcessing` boolean
- `cronAbortController` so a user prompt cancels in-progress cron work
- `cronCompletion: Promise<void>` so we can deterministically wait on
  abort flushes
- `#drainCronQueue` consumes queued prompts FIFO when no user prompt is
  active

This is why the cron tools exist (§4) — we drive scheduled prompts through
the same Session as user input rather than spinning up parallel agents.

### Internal-part filtering at the ACP surface

`Session.ts:355, 531` — Session honors `isInternalPart` so malformed
tool-call recovery notes (and any future internal parts) are stripped
before being emitted as ACP `SessionUpdate`s to Zed/CRUSH/etc.

### Things we deferred from upstream's ACP work

- **#3479** ACP system reminders — not yet ported.
- **#3550** stateless converter refactor — we have a partial version
  (#3525); the full stateless rework was deferred.

---

## 4. Tooling & File Discovery

### 4.1 `.protoignore` + `.claudeignore` inheritance

`packages/core/src/utils/protoIgnoreParser.ts`

`ProtoIgnoreParser` (renamed from `QwenIgnoreParser`) loads from both
`.claudeignore` (first) and `.protoignore` (second). Later patterns override
earlier ones (gitignore semantics). This means projects that already use
Claude Code's ignore conventions Just Work — they don't need a duplicate
file. If a user wants to override Claude's defaults, they put a
`.protoignore` next to it.

Consumed by:

- `packages/core/src/services/fileDiscoveryService.ts:137`
- All file-listing tools: `glob.ts`, `ls.ts`, `read-file.ts`, `ripGrep.ts`
- `getFolderStructure` for context summaries

### 4.2 Net-new tools (not in upstream)

- **Cron tools** — `cron-create.ts`, `cron-list.ts`, `cron-delete.ts`
  (`packages/core/src/tools/`). Backed by `services/cronScheduler.ts`
  with deterministic per-job jitter (10% of period, capped at 15 min for
  recurring; -90s for one-shots on `:00` / `:30`). Persists to disk and
  prunes expired jobs on load.
- **Browser automation** — `tools/browser-tool.ts`, paired with a bundled
  `browser-automation` skill. Uses an external `agent-browser` binary
  detected at runtime.
- **Mailbox** — `mailbox-tools.ts`, `agents/mailbox.ts`. Inter-agent
  message-passing primitive used by `TeamOrchestrator`.
- **Repo map** — `tools/repoMap.ts` + `services/repoMapService.ts`.
  Personalized PageRank over the import graph; cached at
  `.proto/repo-map-cache.json`. Lets agents orient themselves on a
  large codebase without reading every file.
- **Task tools** — `task-create.ts`, `task-get.ts`, `task-list.ts`,
  `task-output.ts`, `task-ready.ts`, `task-stop.ts`, `task-update.ts`
  (backed by `services/task-store.ts`). Distinct from the AskUserQuestion
  / TodoWrite split — these track long-running async work.
- **Background-shell disk capture + `bg_stop`** — `backgroundShells/`
  module + `tools/bg-stop.ts`. When a shell command runs with
  `is_background: true`, stdout/stderr is redirected at the shell level
  to `<projectTempDir>/<sessionId>/tasks/<taskId>.output`. The OS keeps
  writing even after the wrapper exits, so detached processes (long
  evals, build watchers, dev servers) never silently lose output.
  `BackgroundShellRegistry` tracks each task; a watcher polls the `.exit`
  sentinel and marks it complete. The next user turn carries a
  `<task_notification>` block (`task_id`, `output_file`, `status`,
  `exit_code`). `bg_stop` SIGTERMs the process group with SIGKILL
  fallback. Listed via `/bg`. Mirrors cc-2.18's task framework, scoped
  to local shells only. **Non-Windows.**
- **LSP** — `tools/lsp.ts` exposing language-server intelligence; a
  fork-only setting (`general.lsp`) gates it.

### 4.3 Tools we removed

- `todoWrite.ts` — deleted. Upstream still has it; we use an internal
  plan/todo path through `PlanSummaryDisplay` and `TodoDisplay` UI.
- `web-fetch` and `web-search` are still present but extended with
  graceful-degradation paths (timeout + ripgrep fallback for offline /
  air-gapped environments).

---

## 5. Configuration & Permissions

### 5.1 Settings schema

`packages/cli/src/config/settingsSchema.ts`

Fork-added settings (with reason):

- `general.lsp` — gate Language Server Protocol features
- `ui.enableFollowupSuggestions` — context-aware follow-up suggestions
- `ui.enableCacheSharing` — cache-aware forked queries (experimental)
- `ui.enableSpeculation` — speculative execution of accepted suggestions
- `voice.*` — push-to-talk STT settings (entire subtree is fork-only;
  see §7 for stack)

Co-authored-by + locale strings updated to refer to `proto` and
`~/.proto/locales/`.

### 5.2 Extension origin enum

`packages/core/src/config/config.ts:277`

```ts
export type ExtensionOriginSource = 'QwenCode' | 'Claude' | 'Gemini';
```

Added `'Claude'` and `'Gemini'` so we can track where an extension
metadata file came from. Paired with `extension/claude-converter.ts` and
`extension/gemini-converter.ts` that translate Claude / Gemini extension
manifests into our internal format.

### 5.3 Permission services

- `permissions/auto-approve-classifier.ts` — fork-only LLM-backed
  classifier returning `allow | deny | ask`. Capped per session.
- `services/permissionBlockerService.ts` — persists "this got denied
  twice in a row" so the agent stops re-attempting it across sessions.
  Threshold: `DENY_THRESHOLD = 2`.

These wrap, but do not replace, the upstream rule-based permission system.

---

## 6. The Agent Harness (Largest Architectural Delta)

This is the section where the fork has done the most work and where there
is no upstream equivalent. The pattern is: keep the model on rails by
catching common failure modes early and either auto-recovering or surfacing
a clean prompt that gets it back on task.

### 6.1 Skills system

`packages/core/src/skills/`

22 bundled skills shipping in the binary
(`packages/core/src/skills/bundled/`):
adversarial-verification, brainstorming, browser-automation,
coding-agent-standards, dispatching-parallel-agents, executing-plans,
finishing-a-development-branch, harness-reference, loop, qc-helper,
receiving-code-review, requesting-code-review, review, sprint-contract,
subagent-driven-development, systematic-debugging, test-driven-development,
using-git-worktrees, using-superpowers, verification-before-completion,
writing-plans, writing-skills.

`SkillManager` loads bundled + user skills (from `~/.proto/skills/`) and
the model can invoke them by name via the `skill` tool.

Upstream has **no skills system**. This is entirely ours.

### 6.2 Sprint contract + scope lock

`packages/core/src/services/sprintContractService.ts`
`packages/core/src/services/scopeLock.ts`

Pre-implementation contract: filesToCreate, filesToModify, acceptance
criteria, etc. Activating it arms a glob-based scope lock — any write
outside the permitted set is rejected. Lock survives session restart
via `.proto/sprint-contract.json`.

### 6.3 Behavior verification gate + multi-sample selector

`services/behaviorVerifyGate.ts`, `services/multiSampleSelector.ts`

Gate that runs N samples, picks the best one. Used today as the harness
hardening pass — produces measurably better results on terminal-bench-2.

### 6.4 Doom-loop detection + harness reminders

`services/harnessReminderService.ts` + spans in `telemetry/harnessTelemetry.ts`

Trigger types: `tool_count_exceeded`, `test_failure_threshold`,
`analysis_loop`, `no_progress`. Each fires a Langfuse OTel span tagged
`harness.intervention.type` so we can build SFT datasets from
`(input_context, intervention_message)` pairs where `harness.outcome` is
later annotated as recovered. This is explicit fine-tuning data
generation; not just observability.

### 6.5 Session memory and evolve

- `services/sessionMemory/` — background AgentHeadless that keeps
  `.proto/session-notes.md` up to date after each turn (above token
  thresholds). When compaction fires, we use the notes file as the summary
  rather than re-summarizing.
- `services/evolveService.ts` — every 3 turns, a background agent looks
  for reusable workflow patterns and drafts a `SKILL.md` candidate in
  `.proto/evolve/skills/` for user review.
- `memory/` — frontmatter-parsed memory store with proposal queue,
  feeds into the system prompt.

### 6.6 Checkpoints, rewind, and follow-ups

- `core/checkpointStore.ts` — per-turn checkpoint with lazy file snapshots.
  Snapshots capture only files about to be modified (no eager I/O).
- `core/client.ts:227 trimHistoryToCheckpoint()` — the rewind primitive.
- `ui/components/RewindPicker.tsx`, `RewindDialog.tsx` and the `/rewind`
  command let users roll back N turns and optionally restore files or
  summarize forward from there.
- `followup/` directory: forked-query speculation, overlay FS for
  speculative writes, cache-aware suggestion generation. Powers the
  `enableFollowupSuggestions` setting.

**Note:** upstream landed a competing rewind feature (#3441) on
2026-04. We have not evaluated yet whether to adopt their implementation
or keep ours — ours is more tightly coupled to checkpoint snapshots.

### 6.7 Background subagents, teams, arena

- `agents/runtime/` — `AgentCore` (stateless engine), `AgentHeadless`
  (one-shot), `AgentInteractive` (persistent loop), `compaction.ts`.
- `agents/TeamOrchestrator.ts` + `agents/team-config.ts` /
  `team-registry.ts` — multi-agent team execution.
- `agents/background-store.ts` — persists background agent state to
  `.proto/agents/background.json`.
- `agents/arena/` — A/B-style model comparison. Surfaced via
  `arenaCommand`.

Upstream has #3076 (background subagents) but our tree is more developed.

---

## 7. UI / TUI Additions

`packages/cli/src/ui/`

Fork-added components & hooks (curated list — full inventory in git):

- `StatusBar.tsx` — hostname + status display
- `RewindPicker.tsx`, `RewindDialog.tsx`
- `VoiceMicButton.tsx`
- `TaskUpdateDiffDisplay.tsx`
- `TruncatedHistoryBanner.tsx`
- `useVoice.ts`, `useFollowupSuggestions.tsx`,
  `useBackgroundAgentProgress.ts`, `useGitDiffStat.ts`,
  `useIdleMessageDrain.ts`, `useSessionMemoryStatus.ts`

### 7.1 Voice input

`packages/cli/src/services/audioCapture.ts` + `sttClient.ts`,
`packages/cli/src/ui/hooks/useVoice.ts`

Push-to-talk via Ctrl+Space using `sox` for recording. Routes to an
OpenAI-compatible STT endpoint (configurable via `voice.*` settings).
Special-cased for kitty keyboard protocol terminals.

### 7.2 Setup wizard

`packages/cli/src/commands/setup/handler.ts` + `modelDiscovery.ts`,
`packages/cli/src/ui/commands/setupCommand.ts`

Interactive `proto setup` wizard: discovers models from the configured
endpoint, walks STT setup, persists settings. Lower-friction onboarding
than the upstream auth/config dance.

### 7.3 New slash commands (over upstream)

`/notes`, `/rewind`, `/team`, `/voice`, `/setup`, `/insight`, `/recap`,
`/setup-github`, `/skills` (registered explicitly in
`BuiltinCommandLoader.ts:34-115`).

---

## 8. Build / Release / Deploy

`.github/workflows/`

### 8.1 Auto-release pipeline (fork-only)

- `auto-release.yml` — fires after CI on `main`. Reads conventional
  commits since the last tag, determines bump (major/minor/patch),
  bumps every workspace, opens a release PR with auto-merge enabled.
- `prepare-release.yml` — fires on PR merges to `dev`. Default patch
  bump; manual dispatch can request minor/major or dry-run.
- `release.yml` — publishes to NPM after the release PR merges.
- `scripts/determine-bump.js`, `scripts/rewrite-release-notes.mjs` —
  conventional-commit driven bump + notes rewrite.

This is why we are at 0.26.x while upstream is 0.15.x. The fork ships
roughly weekly; upstream ships monthly.

### 8.2 Workflows we removed

- `qwen-automated-issue-triage.yml`, `qwen-code-pr-review.yml`,
  `qwen-scheduled-issue-triage.yml`, `gemini-*.yml`,
  `check-issue-completeness.yml`, `community-report.yml`, `stale.yml`,
  `release-vscode-companion.yml` — none of these run against us.

### 8.3 Dev workflow

- `.husky/pre-push` — schema staleness + snapshot-warning hooks.
- `.coderabbit.yaml` — CodeRabbit review config.
- `tools/harbor_agent/proto_agent.py` — terminal-bench evaluation
  agent that installs `@protolabsai/proto` and routes through our
  CLIProxyAPI gateway.

---

## 9. Telemetry

`packages/core/src/telemetry/`

### 9.1 Langfuse OTLP wiring

`telemetry/sdk.ts` — first-class Langfuse exporter using
`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL`
env vars. Builds basic-auth headers and points OTLP/HTTP exporters at
`<base>/api/public/otel/v1/traces|logs|metrics`.

OTEL diagnostics are silenced by default; opt in with
`PROTO_OTEL_DEBUG=1`. Upstream's default leaks connection errors when
no collector is running, which is why we silenced it.

### 9.2 Harness telemetry

`telemetry/harnessTelemetry.ts` — every harness intervention emits an
OTel span tagged `harness.intervention.type` + `.message` + context.
Designed for SFT dataset construction (see §6.4).

### 9.3 Turn-span context

`telemetry/turnSpanContext.ts` — propagates a turn-scoped span context
so all sub-spans (tool calls, agent rounds, completions) chain under
the right parent in Langfuse.

---

## 10. Removed / Gutted Surfaces

The fork is not just additive. We removed entire subsystems:

- **`packages/vscode-ide-companion/`** — gone. ~7000 lines deleted.
  We're shipping into Zed via ACP, not VSCode.
- **`packages/core/src/qwen/`** — entire directory deleted: Qwen OAuth,
  shared token manager, Qwen content generator. Removed in
  `e25b0b853 chore: remove Qwen OAuth + harness hardening`.
- **`packages/sdk-java/`** — gone. Upstream maintains a Java SDK; we
  don't.
- **`packages/core/src/ide/ide-installer.ts`** — removed; we don't
  install ourselves into IDEs.
- **`packages/core/src/tools/todoWrite.ts`** — removed; replaced by
  internal plan/todo path.
- **`docs/users/` (upstream layout)** — replaced with Divio-style
  layout (`docs/{tutorials,guides,reference,explanation,contributing}`).

---

## 11. Intentionally NOT Ported From Upstream

These were evaluated during the most recent backport pass and consciously
deferred or rejected:

| Upstream PR                            | Topic                                                | Decision                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3550                                  | Stateless converter refactor (full version of #3525) | **Deferred.** We have the per-stream context piece (#3525) which is the key fix; the further refactor changes API shape and isn't worth the merge cost yet.                                   |
| #3479                                  | ACP system reminders                                 | **Deferred.** Our `harnessReminderService` covers the core need via a different mechanism. Reconsider if we hit ACP gaps for Zed users.                                                       |
| #3313                                  | Truncated tool-call multi-turn recovery              | **Deferred.** Our MAX_TOKENS cascade trimming (§2.5) addresses the symptom from a different angle.                                                                                            |
| #3315                                  | Strip-thoughts test                                  | **Deferred.** Test-only PR; covered by our own `<think>`-tag tests.                                                                                                                           |
| #3505                                  | `clearRetryCountsForTool`                            | **Deferred** (since landed in our backport batch — verify before re-deferring).                                                                                                               |
| #3441                                  | Conversation rewind feature                          | **Conflicts with our rewind.** Our implementation is older and more deeply integrated with checkpoint snapshots. Need to evaluate whether upstream's superseded ours or merely duplicated it. |
| #3494                                  | Python SDK                                           | **Rejected.** Out of scope for our Anthropic-first deployment.                                                                                                                                |
| #3010 / SDK Java                       | Java SDK                                             | **Rejected.** Same reason.                                                                                                                                                                    |
| qwen-oauth model dialog blocks         | Discontinued model handling                          | **N/A.** We removed Qwen OAuth entirely.                                                                                                                                                      |
| #3010 family — VSCode webview features | VSCode integration                                   | **N/A.** We deleted the VSCode companion.                                                                                                                                                     |

---

## 12. Areas Where We Are Behind

639 upstream commits sit unevaluated. The themes that look most important
to track:

- **Rewind feature parity (#3441 + follow-ups #3622, #3605).** Upstream
  shipped a competing rewind UX. Our implementation is older. Evaluate
  whether their `Space-to-preview` / picker behavior is worth backporting
  on top of our checkpoint-aware engine.
- **Tool hot-path I/O perf (#3581).** Claims a 91% reduction in
  runtime sync I/O on the tool path. Not glamorous but every turn pays
  for it.
- **Reasoning content during session resume (#3590).** Touches our
  resume logic; we likely diverge.
- **Telemetry FileExporter circular-ref crash (#3630).** Defensive fix.
  Probably want to grab.
- **DeepSeek/sglang/vllm provider matching (#3613).** We serve via vLLM
  for non-Anthropic models — this might already affect us.
- **Sticky todo panel (#3507).** UX feature we may or may not want.
- **`OPENAI_MODEL` precedence (#3567 + revert in #3633).** Live debate
  upstream; watch before porting.

The "skip the SDK / VSCode / qwen-oauth / Java" filter still removes
maybe 30% of the upstream queue cleanly. The remaining ~450 commits are
the ones worth grooming.

---

## Maintenance notes

- **When backporting upstream code that touches `Part`s or text streams**:
  remember to add `isInternalPart` filtering at any new UI surface, and
  pass `ConverterStreamContext` rather than reaching for the converter's
  internal state.
- **When adding a new ignore-aware tool**: use `ProtoIgnoreParser` via
  `FileDiscoveryService`, never read `.gitignore` / `.protoignore` directly.
- **When adding a slash command**: register in
  `packages/cli/src/services/BuiltinCommandLoader.ts` and (if it should be
  re-exportable) in `packages/cli/src/ui/commands/index.ts`.
- **When changing telemetry**: harness interventions emit OTel spans tagged
  `harness.intervention.type` for downstream Langfuse SFT pipelines —
  do not rename without coordinating with the eval flow.
- **When introducing a fork-unique service**: prefer
  `packages/core/src/services/` over deeply-nested locations so the
  `service-layer` import surface stays browsable.
