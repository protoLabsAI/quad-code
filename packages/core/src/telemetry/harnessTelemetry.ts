/**
 * Harness telemetry — OTel spans for every harness intervention.
 *
 * These spans flow to Langfuse via OTLP and serve two purposes:
 *   1. Observability: see where the harness fires and how often
 *   2. Fine-tuning data: build SFT datasets from intervention → outcome pairs
 *
 * ## Fine-tuning dataset design
 *
 * Each harness span captures:
 *   - `harness.intervention.type`   — what triggered (doom_loop, scope_violation, etc.)
 *   - `harness.intervention.message` — the recovery message injected into context
 *   - `harness.context.*`            — state at intervention time (tool count, etc.)
 *
 * In Langfuse, filter spans by `harness.intervention.type` to build datasets:
 *   input  = conversation history slice before intervention (fetch from parent turn span)
 *   output = harness.intervention.message
 *
 * Use `harness.outcome` (set post-hoc via annotation) to label successful
 * recoveries → supervised fine-tuning signal.
 *
 * ## Langfuse dataset workflow
 *
 *   1. Run proto with telemetry enabled (OTLP → Tempo → Langfuse via SDK)
 *   2. In Langfuse > Traces, filter by span name = "harness.intervention"
 *   3. Export matching traces → dataset items
 *   4. Annotate `harness.outcome` = "recovered" | "not_recovered"
 *   5. Fine-tune on (input_context, intervention_message) pairs where outcome = recovered
 */

import { trace, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import { getActiveTurnContext } from './turnSpanContext.js';

const tracer = trace.getTracer('proto.harness', '1.0.0');

/**
 * Record a doom-loop detection event as a span.
 * Captures the fingerprint, window state, and recovery message for training data.
 */
export function recordDoomLoop(opts: {
  fingerprint: string;
  windowSize: number;
  repeatCount: number;
  recoveryMessage: string;
  toolCallCount: number;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.intervention',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.intervention.type': 'doom_loop',
        'harness.intervention.message': opts.recoveryMessage,
        'harness.doom_loop.fingerprint': opts.fingerprint,
        'harness.doom_loop.window_size': opts.windowSize,
        'harness.doom_loop.repeat_count': opts.repeatCount,
        'harness.context.tool_call_count': opts.toolCallCount,
        // Langfuse uses this for dataset item grouping
        'langfuse.observation.name': 'harness.doom_loop',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Record a scope violation event as a span.
 */
export function recordScopeViolation(opts: {
  violatingPath: string;
  permittedCount: number;
  recoveryMessage: string;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.intervention',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.intervention.type': 'scope_violation',
        'harness.intervention.message': opts.recoveryMessage,
        'harness.scope.violating_path': opts.violatingPath,
        'harness.scope.permitted_count': opts.permittedCount,
        'langfuse.observation.name': 'harness.scope_violation',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}

/**
 * Record a post-edit verification failure as a span.
 */
export function recordVerificationFailure(opts: {
  command: string;
  exitCode: number | string;
  outputSnippet: string;
  recoveryMessage: string;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.intervention',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.intervention.type': 'verification_failed',
        'harness.intervention.message': opts.recoveryMessage,
        'harness.verification.command': opts.command,
        'harness.verification.exit_code': String(opts.exitCode),
        'harness.verification.output_snippet': opts.outputSnippet.slice(0, 500),
        'langfuse.observation.name': 'harness.verification_failed',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.end();
}

/**
 * Record a git checkpoint creation event.
 */
export function recordCheckpoint(opts: {
  toolName: string;
  filePath: string;
  commitHash: string | null;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.checkpoint',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.checkpoint.tool_name': opts.toolName,
        'harness.checkpoint.file_path': opts.filePath,
        'harness.checkpoint.commit_hash': opts.commitHash ?? 'none',
        'langfuse.observation.name': 'harness.checkpoint',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Record an observation mask application (context compression via rolling window).
 */
export function recordObservationMask(opts: {
  maskedPairCount: number;
  verbatimWindowSize: number;
  messagesBefore: number;
  messagesAfter: number;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.observation_mask',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.mask.masked_pairs': opts.maskedPairCount,
        'harness.mask.verbatim_window': opts.verbatimWindowSize,
        'harness.mask.messages_before': opts.messagesBefore,
        'harness.mask.messages_after': opts.messagesAfter,
        'langfuse.observation.name': 'harness.observation_mask',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Record a harness reminder injection event.
 */
export function recordHarnessReminder(opts: {
  triggerType: string;
  message: string;
  toolCallCount: number;
}): void {
  const ctx = getActiveTurnContext() ?? context.active();
  const span = tracer.startSpan(
    'harness.intervention',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'harness.intervention.type': `reminder.${opts.triggerType}`,
        'harness.intervention.message': opts.message,
        'harness.context.tool_call_count': opts.toolCallCount,
        'langfuse.observation.name': 'harness.reminder',
      },
    },
    ctx,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
