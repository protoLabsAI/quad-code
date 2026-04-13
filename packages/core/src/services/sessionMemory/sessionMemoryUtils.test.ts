/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  shouldExtractSessionMemory,
  markExtractionStarted,
  markExtractionCompleted,
  waitForExtraction,
  getLastSummarizedCursorIndex,
  setLastSummarizedCursorIndex,
  recordExtractionTokenCount,
  resetSessionMemoryState,
  setSessionMemorySettings,
  DEFAULT_SESSION_MEMORY_SETTINGS,
} from './sessionMemoryUtils.js';

describe('sessionMemoryUtils', () => {
  beforeEach(() => {
    resetSessionMemoryState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // shouldExtractSessionMemory
  // ---------------------------------------------------------------------------

  describe('shouldExtractSessionMemory', () => {
    it('returns false when below init threshold', () => {
      expect(shouldExtractSessionMemory(5_000)).toBe(false);
    });

    it('returns true at exactly the init threshold', () => {
      expect(
        shouldExtractSessionMemory(
          DEFAULT_SESSION_MEMORY_SETTINGS.minimumTokensToInit,
        ),
      ).toBe(true);
    });

    it('returns false on second call when token growth is below update threshold', () => {
      // First call — passes init
      shouldExtractSessionMemory(10_000);
      recordExtractionTokenCount(10_000);

      // Second call — growth = 1 000, below 5 000 minimum
      expect(shouldExtractSessionMemory(11_000)).toBe(false);
    });

    it('returns true when token growth exceeds update threshold', () => {
      shouldExtractSessionMemory(10_000);
      recordExtractionTokenCount(10_000);

      expect(shouldExtractSessionMemory(15_001)).toBe(true);
    });

    it('respects custom settings', () => {
      setSessionMemorySettings({
        minimumTokensToInit: 500,
        minimumTokensBetweenUpdates: 200,
      });

      expect(shouldExtractSessionMemory(499)).toBe(false);
      expect(shouldExtractSessionMemory(500)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Extraction lock
  // ---------------------------------------------------------------------------

  describe('waitForExtraction', () => {
    it('resolves immediately when no extraction is in progress', async () => {
      const start = Date.now();
      await waitForExtraction();
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('resolves once markExtractionCompleted is called', async () => {
      markExtractionStarted();

      let resolved = false;
      const waiter = waitForExtraction(5_000).then(() => {
        resolved = true;
      });

      // Not yet resolved
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      markExtractionCompleted();
      await waiter;
      expect(resolved).toBe(true);
    });

    it('times out and resolves after timeoutMs', async () => {
      markExtractionStarted();
      const start = Date.now();
      await waitForExtraction(300);
      expect(Date.now() - start).toBeGreaterThanOrEqual(280);
    });
  });

  // ---------------------------------------------------------------------------
  // Cursor tracking
  // ---------------------------------------------------------------------------

  describe('cursor tracking', () => {
    it('starts at -1', () => {
      expect(getLastSummarizedCursorIndex()).toBe(-1);
    });

    it('can be set and read', () => {
      setLastSummarizedCursorIndex(42);
      expect(getLastSummarizedCursorIndex()).toBe(42);
    });

    it('resets on resetSessionMemoryState', () => {
      setLastSummarizedCursorIndex(99);
      resetSessionMemoryState();
      expect(getLastSummarizedCursorIndex()).toBe(-1);
    });
  });
});
