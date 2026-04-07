/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MultiSampleSelector — automatic retry with escalating diversity on task failure.
 *
 * When a subagent task fails (doom loop, MAX_TURNS, ERROR), the selector
 * transparently re-attempts the task up to `maxAttempts` times with:
 *   1. Escalating temperatures (more creative on each retry)
 *   2. Failure context injected into the retry prompt (so the agent knows what
 *      went wrong and can try a different approach)
 *   3. Git-state restoration to the last checkpoint before each retry
 *
 * ## Scoring
 *
 * Attempts are scored and the best result is returned:
 *   GOAL + behavior gate pass  → score 3  (perfect)
 *   GOAL + no gate configured  → score 2  (completed)
 *   MAX_TURNS / TIMEOUT        → score 1  (partial — may have useful work)
 *   ERROR / DOOM_LOOP          → score 0  (failure)
 *
 * If multiple attempts tie, the earlier one wins (lower temperature = preferred).
 *
 * ## Temperatures
 *
 * Default ladder: [0.7, 1.0, 1.3]
 * - Attempt 1: 0.7  — conservative, follows instructions closely
 * - Attempt 2: 1.0  — balanced, some exploration
 * - Attempt 3: 1.3  — creative, tries different approaches
 *
 * ## Fine-tuning data
 *
 * Each attempt is recorded as an OTel span so Langfuse can capture
 * (failed_attempt_context, successful_recovery_prompt) pairs for training.
 */

import { trace, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import { getActiveTurnContext } from '../telemetry/turnSpanContext.js';
import { AgentTerminateMode } from '../agents/runtime/agent-types.js';
import type { VerifyScenario } from './behaviorVerifyGate.js';
import { BehaviorVerifyGate } from './behaviorVerifyGate.js';

const tracer = trace.getTracer('proto.harness', '1.0.0');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SampleAttemptResult {
  /** Zero-based attempt index */
  attempt: number;
  /** Temperature used for this attempt */
  temperature: number;
  /** How the agent terminated */
  terminateMode: AgentTerminateMode;
  /** Final text output from the agent */
  finalText: string;
  /** Behavior gate results (null = gate not configured or not run) */
  gatePass: boolean | null;
  /** Computed score (higher = better) */
  score: number;
}

export interface MultiSampleResult {
  /** All attempts in order */
  attempts: SampleAttemptResult[];
  /** The winning attempt */
  best: SampleAttemptResult;
  /** Whether the best attempt fully succeeded */
  success: boolean;
}

export interface MultiSampleConfig {
  /** Maximum attempts including the initial one (default: 3) */
  maxAttempts?: number;
  /** Temperature ladder. Length must be >= maxAttempts (default: [0.7, 1.0, 1.3]) */
  temperatures?: number[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_TEMPERATURES = [0.7, 1.0, 1.3] as const;
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Terminate modes that warrant a retry */
const RETRYABLE_MODES = new Set<AgentTerminateMode>([
  AgentTerminateMode.ERROR,
  AgentTerminateMode.MAX_TURNS,
  AgentTerminateMode.TIMEOUT,
]);

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreAttempt(
  terminateMode: AgentTerminateMode,
  gatePass: boolean | null,
): number {
  if (terminateMode === AgentTerminateMode.GOAL) {
    // gate pass → 3, gate fail → 2, no gate configured → 3
    return gatePass === false ? 2 : 3;
  }
  if (
    terminateMode === AgentTerminateMode.MAX_TURNS ||
    terminateMode === AgentTerminateMode.TIMEOUT
  )
    return 1;
  return 0;
}

// ─── Failure context injection ────────────────────────────────────────────────

/**
 * Build the retry prompt for attempt N+1 given the previous failures.
 * Injecting the failure context helps the agent try a different approach.
 */
export function buildRetryPrompt(
  originalPrompt: string,
  previousAttempts: SampleAttemptResult[],
): string {
  if (previousAttempts.length === 0) return originalPrompt;

  const failureSummary = previousAttempts
    .map((a, i) => {
      const status =
        a.terminateMode === AgentTerminateMode.GOAL
          ? a.gatePass === false
            ? 'completed but failed behavior verification'
            : 'completed'
          : `failed (${a.terminateMode})`;
      const truncated =
        a.finalText.length > 300
          ? a.finalText.slice(0, 300) + '\n...(truncated)'
          : a.finalText || '(no output)';
      return `Attempt ${i + 1} (temp=${a.temperature}): ${status}\n${truncated}`;
    })
    .join('\n\n');

  return (
    `${originalPrompt}\n\n` +
    `---\n` +
    `[RETRY CONTEXT — previous attempt(s) did not fully succeed. ` +
    `Try a different approach, avoid the same mistakes.]\n\n` +
    `${failureSummary}\n` +
    `---`
  );
}

// ─── MultiSampleSelector ──────────────────────────────────────────────────────

/**
 * Retry a task with escalating temperatures and failure context injection.
 *
 * @param originalPrompt  The original task prompt.
 * @param scenarios       Behavior verification scenarios (may be empty).
 * @param cwd             Working directory for verification scenarios.
 * @param runAttempt      Callback that runs one attempt: receives the prompt and
 *                        temperature, returns `{ terminateMode, finalText }`.
 *                        The caller is responsible for git state restoration between
 *                        attempts (e.g., resetting to the last checkpoint).
 * @param cfg             Optional configuration overrides.
 */
export async function runWithMultiSample(
  originalPrompt: string,
  scenarios: VerifyScenario[],
  cwd: string,
  runAttempt: (
    prompt: string,
    temperature: number,
    attemptIndex: number,
  ) => Promise<{ terminateMode: AgentTerminateMode; finalText: string }>,
  cfg: MultiSampleConfig = {},
): Promise<MultiSampleResult> {
  const maxAttempts = cfg.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const temps = cfg.temperatures ?? [...DEFAULT_TEMPERATURES];

  const attempts: SampleAttemptResult[] = [];

  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.multi_sample',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.multi_sample.max_attempts': maxAttempts,
        'harness.multi_sample.temperatures': temps.join(','),
        'langfuse.observation.name': 'harness.multi_sample',
      },
    },
    ctx,
  );

  try {
    for (let i = 0; i < maxAttempts; i++) {
      const temperature = temps[i] ?? temps[temps.length - 1]!;
      const prompt =
        i === 0 ? originalPrompt : buildRetryPrompt(originalPrompt, attempts);

      const { terminateMode, finalText } = await runAttempt(
        prompt,
        temperature,
        i,
      );

      // Run behavior gate only on GOAL completions
      let gatePass: boolean | null = null;
      if (terminateMode === AgentTerminateMode.GOAL && scenarios.length > 0) {
        const results = await BehaviorVerifyGate.runScenarios(scenarios, cwd);
        gatePass = results.every((r) => r.passed);
      }

      const score = scoreAttempt(terminateMode, gatePass);

      attempts.push({
        attempt: i,
        temperature,
        terminateMode,
        finalText,
        gatePass,
        score,
      });

      // Record telemetry for this attempt
      span.addEvent('attempt_completed', {
        'attempt.index': i,
        'attempt.temperature': temperature,
        'attempt.terminate_mode': terminateMode,
        'attempt.score': score,
        'attempt.gate_pass': gatePass ?? 'not_run',
      });

      // If this attempt fully succeeded, stop early
      if (score >= 3 || (score >= 2 && scenarios.length === 0)) {
        break;
      }

      // Only retry on retryable modes
      if (
        !RETRYABLE_MODES.has(terminateMode) &&
        terminateMode !== AgentTerminateMode.GOAL
      ) {
        // Cancelled or shutdown — don't retry
        break;
      }
    }
  } finally {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  // Pick best by score (ties: prefer earlier attempt = lower temperature)
  const best = attempts.reduce((prev, curr) =>
    curr.score > prev.score ? curr : prev,
  );

  return {
    attempts,
    best,
    success: best.score >= 2,
  };
}

/**
 * Determines whether a task failure warrants a multi-sample retry.
 */
export function shouldRetry(terminateMode: AgentTerminateMode): boolean {
  return RETRYABLE_MODES.has(terminateMode);
}

/**
 * Format a multi-sample result as a human-readable summary.
 */
export function formatMultiSampleResult(result: MultiSampleResult): string {
  const lines: string[] = [
    `Multi-sample: ${result.attempts.length} attempt(s), best score ${result.best.score}/3`,
  ];

  for (const a of result.attempts) {
    const status =
      a.score >= 3
        ? 'SUCCESS'
        : a.score >= 2
          ? 'COMPLETED'
          : a.score >= 1
            ? 'PARTIAL'
            : 'FAILED';
    const gate =
      a.gatePass === null ? '' : a.gatePass ? ' (gate: pass)' : ' (gate: FAIL)';
    lines.push(
      `  Attempt ${a.attempt + 1} [temp=${a.temperature}]: ${status}${gate} — ${a.terminateMode}`,
    );
  }

  return lines.join('\n');
}
