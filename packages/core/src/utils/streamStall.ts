/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stream stall detection — per-chunk idle watchdog for async generators.
 *
 * The SDK's overall request timeout (120 s) covers the full lifetime of a
 * request, but undici body/header timeouts are explicitly disabled in
 * runtimeFetchOptions.ts to allow long streaming responses.  This means a
 * stream that *starts* and then *freezes* (connection open, no more chunks
 * arriving) will not be detected until the full 120 s wall clock fires.
 *
 * `withChunkTimeout` wraps any AsyncGenerator and races each `.next()` call
 * against a per-chunk idle timer.  If no chunk arrives within `timeoutMs`,
 * it throws `StreamStallError`, closes the upstream generator, and lets the
 * caller (Turn.run) surface it as a retryable error.
 */

/** Thrown when no chunk arrives within the per-chunk idle timeout. */
export class StreamStallError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Stream stalled: no data received for ${timeoutMs / 1000}s. ` +
        `The model connection may have dropped — please try again.`,
    );
    this.name = 'StreamStallError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Wraps an AsyncGenerator with a per-chunk idle timeout.
 *
 * Each iteration races `source.next()` against a fresh `setTimeout`.
 * If the timer fires first, the source is closed and `StreamStallError`
 * is thrown.  The timer is cleared as soon as any chunk arrives, so
 * legitimately slow-but-steady streams are never interrupted.
 *
 * @param source     The upstream async generator to wrap.
 * @param timeoutMs  Max ms to wait between chunks.  Defaults to 30 000.
 */
export async function* withChunkTimeout<T>(
  source: AsyncGenerator<T>,
  timeoutMs: number,
): AsyncGenerator<T> {
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Build a promise that rejects after timeoutMs of silence.
    const stallPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new StreamStallError(timeoutMs)),
        timeoutMs,
      );
    });

    let result: IteratorResult<T>;
    try {
      result = await Promise.race([source.next(), stallPromise]);
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      // Request cleanup of the upstream generator, but do NOT await: if the
      // source is stuck awaiting a never-resolving Promise (e.g. a dropped
      // network connection), awaiting .return() would block indefinitely.
      // Fire-and-forget is fine here — the error propagates immediately, and
      // the generator will be GC'd or cleaned up via AbortSignal by the caller.
      try {
        void source.return?.(undefined as unknown as T);
      } catch {
        // intentionally ignored
      }
      throw err;
    }

    if (result.done) return;
    yield result.value;
  }
}
