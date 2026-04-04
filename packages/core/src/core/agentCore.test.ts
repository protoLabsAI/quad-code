/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing any module that depends on it.
// The factory must not reference outer variables (vitest hoists vi.mock()).
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

// Import after mock registration so the mocked fs is used.
import * as fs from 'node:fs';
import {
  beginTurn,
  snapshotFileBeforeEdit,
  checkpointStore,
  FILE_MUTATING_TOOLS,
} from './agentCore.js';

// Typed alias to the mock function.
const readFileSyncMock = vi.mocked(fs.readFileSync);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a unique promptId per test to avoid cross-test pollution. */
let testCounter = 10_000; // Start high to avoid collision with checkpointStore tests
const nextPromptId = () => `ac-test-session#agent#${testCounter++}`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agentCore — FILE_MUTATING_TOOLS', () => {
  it('includes write_file', () => {
    expect(FILE_MUTATING_TOOLS.has('write_file')).toBe(true);
  });

  it('includes edit', () => {
    expect(FILE_MUTATING_TOOLS.has('edit')).toBe(true);
  });

  it('includes notebook_edit', () => {
    expect(FILE_MUTATING_TOOLS.has('notebook_edit')).toBe(true);
  });

  it('does NOT include read_file', () => {
    expect(FILE_MUTATING_TOOLS.has('read_file')).toBe(false);
  });

  it('does NOT include run_shell_command', () => {
    expect(FILE_MUTATING_TOOLS.has('run_shell_command')).toBe(false);
  });
});

describe('agentCore — beginTurn()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('registers a checkpoint in the shared store', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'Hello world');
    const cp = checkpointStore.getByPromptId(promptId);
    expect(cp).toBeDefined();
    expect(cp!.userPrompt).toBe('Hello world');
  });

  it('is idempotent — calling twice does not double-register', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'First call');
    beginTurn(promptId, 'Second call');
    // The store should preserve the first registration; second is a no-op.
    expect(checkpointStore.getByPromptId(promptId)!.userPrompt).toBe(
      'First call',
    );
  });
});

describe('agentCore — snapshotFileBeforeEdit()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns false and takes no snapshot for a non-mutating tool', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'read some files');
    const result = snapshotFileBeforeEdit(promptId, 'read_file', {
      file_path: '/project/file.ts',
    });
    expect(result).toBe(false);
    expect(checkpointStore.getByPromptId(promptId)!.fileSnapshots.size).toBe(
      0,
    );
  });

  it('returns false when file_path arg is missing', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'write with no path');
    const result = snapshotFileBeforeEdit(promptId, 'write_file', {});
    expect(result).toBe(false);
  });

  it('snapshots the file for write_file', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'write a file');
    readFileSyncMock.mockReturnValueOnce('original content');
    const result = snapshotFileBeforeEdit(promptId, 'write_file', {
      file_path: '/project/output.ts',
    });
    expect(result).toBe(true);
    const snap = checkpointStore
      .getByPromptId(promptId)!
      .fileSnapshots.get('/project/output.ts');
    expect(snap).toBe('original content');
  });

  it('snapshots the file for edit', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'edit a file');
    readFileSyncMock.mockReturnValueOnce('line 1\nline 2\n');
    const result = snapshotFileBeforeEdit(promptId, 'edit', {
      file_path: '/project/src/foo.ts',
    });
    expect(result).toBe(true);
    const snap = checkpointStore
      .getByPromptId(promptId)!
      .fileSnapshots.get('/project/src/foo.ts');
    expect(snap).toBe('line 1\nline 2\n');
  });

  it('snapshots the notebook for notebook_edit', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'edit a notebook');
    readFileSyncMock.mockReturnValueOnce('{"cells":[]}');
    const result = snapshotFileBeforeEdit(promptId, 'notebook_edit', {
      notebook_path: '/project/analysis.ipynb',
    });
    expect(result).toBe(true);
    const snap = checkpointStore
      .getByPromptId(promptId)!
      .fileSnapshots.get('/project/analysis.ipynb');
    expect(snap).toBe('{"cells":[]}');
  });

  it('returns false (and does NOT read again) when file already snapshotted', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'double edit');
    readFileSyncMock.mockReturnValueOnce('v1');
    snapshotFileBeforeEdit(promptId, 'write_file', {
      file_path: '/project/double.ts',
    });
    // Change mock to return v2; the second call should be a no-op
    readFileSyncMock.mockReturnValueOnce('v2');
    const second = snapshotFileBeforeEdit(promptId, 'write_file', {
      file_path: '/project/double.ts',
    });
    expect(second).toBe(false);
    expect(
      checkpointStore
        .getByPromptId(promptId)!
        .fileSnapshots.get('/project/double.ts'),
    ).toBe('v1');
  });

  it('records sentinel for a file that does not yet exist', () => {
    const promptId = nextPromptId();
    beginTurn(promptId, 'create new file');
    readFileSyncMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = snapshotFileBeforeEdit(promptId, 'write_file', {
      file_path: '/project/new-file.ts',
    });
    expect(result).toBe(true);
    expect(
      checkpointStore.fileExistedBeforeTurn(promptId, '/project/new-file.ts'),
    ).toBe(false);
  });
});
