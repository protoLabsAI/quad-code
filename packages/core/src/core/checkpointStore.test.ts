/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test.
// The factory must be a pure function with no references to outer variables
// (vitest hoists vi.mock() calls to the top of the file).
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

// Now import the mocked fs and the module under test.
import * as fs from 'node:fs';
import { CheckpointStore } from './checkpointStore.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROMPT_ID_0 = 'session#agent#0';
const PROMPT_ID_1 = 'session#agent#1';
const PROMPT_ID_2 = 'session#agent#2';
const PROMPT_TEXT_0 = 'Write a hello world function';
const PROMPT_TEXT_1 = 'Now add unit tests for it';
const FILE_A = '/project/src/hello.ts';
const FILE_B = '/project/src/goodbye.ts';

// Typed alias to the mock so TypeScript knows about .mockReturnValue etc.
const readFileSyncMock = vi.mocked(fs.readFileSync);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CheckpointStore', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new CheckpointStore();
    vi.resetAllMocks();
  });

  // ── add() ──────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('creates a checkpoint with the correct promptId and userPrompt', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      const checkpoints = store.list();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].promptId).toBe(PROMPT_ID_0);
      expect(checkpoints[0].userPrompt).toBe(PROMPT_TEXT_0);
    });

    it('records a timestamp close to now', () => {
      const before = Date.now();
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      const after = Date.now();
      const ts = store.list()[0].timestamp;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('starts with an empty fileSnapshots map', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      expect(store.list()[0].fileSnapshots.size).toBe(0);
    });

    it('is idempotent — calling add() twice with the same promptId is a no-op', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      store.add(PROMPT_ID_0, 'different text should be ignored');
      expect(store.size).toBe(1);
      expect(store.list()[0].userPrompt).toBe(PROMPT_TEXT_0);
    });

    it('maintains insertion order across multiple turns', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      store.add(PROMPT_ID_1, PROMPT_TEXT_1);
      const [c0, c1] = store.list();
      expect(c0.promptId).toBe(PROMPT_ID_0);
      expect(c1.promptId).toBe(PROMPT_ID_1);
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns an empty array when the store is empty', () => {
      expect(store.list()).toEqual([]);
    });

    it('returns all checkpoints in insertion order', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      store.add(PROMPT_ID_1, PROMPT_TEXT_1);
      store.add(PROMPT_ID_2, 'third prompt');
      const ids = store.list().map((c) => c.promptId);
      expect(ids).toEqual([PROMPT_ID_0, PROMPT_ID_1, PROMPT_ID_2]);
    });

    it('returns a shallow copy — mutating the array does not affect the store', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      const list = store.list();
      list.pop();
      expect(store.size).toBe(1);
    });
  });

  // ── getAt() ────────────────────────────────────────────────────────────────

  describe('getAt()', () => {
    beforeEach(() => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      store.add(PROMPT_ID_1, PROMPT_TEXT_1);
      store.add(PROMPT_ID_2, 'third');
    });

    it('returns the checkpoint at a non-negative index', () => {
      expect(store.getAt(0).promptId).toBe(PROMPT_ID_0);
      expect(store.getAt(1).promptId).toBe(PROMPT_ID_1);
      expect(store.getAt(2).promptId).toBe(PROMPT_ID_2);
    });

    it('supports negative (Python-style) indices', () => {
      expect(store.getAt(-1).promptId).toBe(PROMPT_ID_2);
      expect(store.getAt(-2).promptId).toBe(PROMPT_ID_1);
      expect(store.getAt(-3).promptId).toBe(PROMPT_ID_0);
    });

    it('throws RangeError for out-of-bounds positive index', () => {
      expect(() => store.getAt(3)).toThrow(RangeError);
    });

    it('throws RangeError for out-of-bounds negative index', () => {
      expect(() => store.getAt(-4)).toThrow(RangeError);
    });

    it('throws RangeError when the store is empty', () => {
      const emptyStore = new CheckpointStore();
      expect(() => emptyStore.getAt(0)).toThrow(RangeError);
    });
  });

  // ── getByPromptId() ────────────────────────────────────────────────────────

  describe('getByPromptId()', () => {
    it('finds a checkpoint by its promptId', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      const c = store.getByPromptId(PROMPT_ID_0);
      expect(c).toBeDefined();
      expect(c!.userPrompt).toBe(PROMPT_TEXT_0);
    });

    it('returns undefined for an unknown promptId', () => {
      expect(store.getByPromptId('nonexistent')).toBeUndefined();
    });
  });

  // ── snapshotFile() ────────────────────────────────────────────────────────

  describe('snapshotFile()', () => {
    beforeEach(() => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
    });

    it('reads and stores file content for a known turn', () => {
      readFileSyncMock.mockReturnValueOnce('const x = 1;\n');
      const snapped = store.snapshotFile(PROMPT_ID_0, FILE_A);
      expect(snapped).toBe(true);
      const snap = store.getByPromptId(PROMPT_ID_0)!.fileSnapshots.get(FILE_A);
      expect(snap).toBe('const x = 1;\n');
    });

    it('returns false for an unknown promptId', () => {
      expect(store.snapshotFile('unknown-id', FILE_A)).toBe(false);
    });

    it('is idempotent — snapshots a file only once per turn', () => {
      readFileSyncMock.mockReturnValueOnce('version1');
      store.snapshotFile(PROMPT_ID_0, FILE_A);
      // Simulate a file change between calls
      readFileSyncMock.mockReturnValueOnce('version2');
      const secondSnap = store.snapshotFile(PROMPT_ID_0, FILE_A);
      expect(secondSnap).toBe(false);
      // The snapshot should still hold the first version
      const snap = store.getByPromptId(PROMPT_ID_0)!.fileSnapshots.get(FILE_A);
      expect(snap).toBe('version1');
    });

    it('stores a sentinel for files that do not exist (new file creation)', () => {
      readFileSyncMock.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const snapped = store.snapshotFile(PROMPT_ID_0, '/new/file.ts');
      expect(snapped).toBe(true);
      // fileExistedBeforeTurn should return false for the non-existent file
      expect(
        store.fileExistedBeforeTurn(PROMPT_ID_0, '/new/file.ts'),
      ).toBe(false);
    });

    it('can snapshot multiple files for the same turn', () => {
      readFileSyncMock.mockReturnValueOnce('file-a-content');
      readFileSyncMock.mockReturnValueOnce('file-b-content');
      store.snapshotFile(PROMPT_ID_0, FILE_A);
      store.snapshotFile(PROMPT_ID_0, FILE_B);
      const snapshots =
        store.getByPromptId(PROMPT_ID_0)!.fileSnapshots;
      expect(snapshots.get(FILE_A)).toBe('file-a-content');
      expect(snapshots.get(FILE_B)).toBe('file-b-content');
    });

    it('does not mix snapshots across turns', () => {
      store.add(PROMPT_ID_1, PROMPT_TEXT_1);
      readFileSyncMock.mockReturnValueOnce('turn0-content');
      store.snapshotFile(PROMPT_ID_0, FILE_A);
      // FILE_A was not touched in turn 1
      expect(
        store.getByPromptId(PROMPT_ID_1)!.fileSnapshots.has(FILE_A),
      ).toBe(false);
    });
  });

  // ── fileExistedBeforeTurn() ────────────────────────────────────────────────

  describe('fileExistedBeforeTurn()', () => {
    beforeEach(() => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
    });

    it('returns true when the file existed before the turn', () => {
      readFileSyncMock.mockReturnValueOnce('existing content');
      store.snapshotFile(PROMPT_ID_0, FILE_A);
      expect(store.fileExistedBeforeTurn(PROMPT_ID_0, FILE_A)).toBe(true);
    });

    it('returns false when the file did not exist before the turn', () => {
      readFileSyncMock.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      store.snapshotFile(PROMPT_ID_0, FILE_A);
      expect(store.fileExistedBeforeTurn(PROMPT_ID_0, FILE_A)).toBe(false);
    });

    it('returns undefined for a file not tracked in this turn', () => {
      expect(
        store.fileExistedBeforeTurn(PROMPT_ID_0, '/untracked/file.ts'),
      ).toBeUndefined();
    });

    it('returns undefined for an unknown promptId', () => {
      expect(
        store.fileExistedBeforeTurn('unknown', FILE_A),
      ).toBeUndefined();
    });
  });

  // ── size ──────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('returns 0 for an empty store', () => {
      expect(store.size).toBe(0);
    });

    it('increments as checkpoints are added', () => {
      store.add(PROMPT_ID_0, PROMPT_TEXT_0);
      expect(store.size).toBe(1);
      store.add(PROMPT_ID_1, PROMPT_TEXT_1);
      expect(store.size).toBe(2);
    });
  });
});
