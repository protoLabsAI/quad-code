/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withChunkTimeout, StreamStallError } from './streamStall.js';

describe('StreamStallError', () => {
  it('includes timeout duration in message', () => {
    const err = new StreamStallError(30000);
    expect(err.message).toContain('30s');
    expect(err.name).toBe('StreamStallError');
    expect(err.timeoutMs).toBe(30000);
  });
});

describe('withChunkTimeout', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('passes through all values when chunks arrive promptly', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const collected: number[] = [];
    for await (const v of withChunkTimeout(source(), 1000)) {
      collected.push(v);
    }
    expect(collected).toEqual([1, 2, 3]);
  });

  it('throws StreamStallError when no chunk arrives within timeout', async () => {
    // Use real timers with a very short stall window.
    const STALL_MS = 40;

    async function* slowSource(): AsyncGenerator<number> {
      yield 1;
      // Stalls far longer than STALL_MS — withChunkTimeout must interrupt it.
      await new Promise<void>((resolve) => setTimeout(resolve, 60_000));
      yield 2;
    }

    const gen = withChunkTimeout(slowSource(), STALL_MS);

    // First chunk arrives before the stall
    const first = await gen.next();
    expect(first.value).toBe(1);

    const err = await gen.next().catch((e) => e);
    expect(err).toBeInstanceOf(StreamStallError);
    expect(err.message).toContain(`${STALL_MS / 1000}s`);
  }, 3000);

  it('resets the timer on each chunk so steady streams are not interrupted', async () => {
    // Use real timers — verify all 5 values arrive when delays < timeout
    const delays = [10, 10, 10, 10]; // 10 ms each, well under any stall timeout

    async function* timedSource(): AsyncGenerator<number> {
      yield 1;
      for (let i = 2; i <= 5; i++) {
        await new Promise<void>((res) => setTimeout(res, delays[i - 2]));
        yield i;
      }
    }

    const collected: number[] = [];
    for await (const v of withChunkTimeout(timedSource(), 5000)) {
      collected.push(v);
    }
    expect(collected).toEqual([1, 2, 3, 4, 5]);
  });

  it('requests source generator cleanup on stall', async () => {
    // withChunkTimeout fires source.return() but does NOT await it (the source
    // may be stuck on a never-resolving network Promise). Verify that .return()
    // is called by checking the flag is set after the microtask queue drains.
    const STALL_MS = 40;
    let returnCalled = false;

    const fakeSource: AsyncGenerator<number> = {
      async next() {
        // First call: immediately yield 1
        if (!returnCalled) {
          // Second call (after 1 is consumed): block until stall fires
          return new Promise<IteratorResult<number>>(() => {}); // never resolves
        }
        return { value: undefined as unknown as number, done: true };
      },
      async return() {
        returnCalled = true;
        return { value: undefined as unknown as number, done: true };
      },
      async throw(e) {
        throw e;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    // Pre-seed: override next() to yield 1 on first call, then block
    let calls = 0;
    fakeSource.next = async () => {
      calls++;
      if (calls === 1) return { value: 1, done: false };
      return new Promise<IteratorResult<number>>(() => {}); // never resolves
    };

    const gen = withChunkTimeout(fakeSource, STALL_MS);
    const first = await gen.next();
    expect(first.value).toBe(1);

    await expect(gen.next()).rejects.toThrow(StreamStallError);
    // Flush microtasks to allow the fire-and-forget .return() to execute
    await Promise.resolve();
    expect(returnCalled).toBe(true);
  }, 3000);
});
