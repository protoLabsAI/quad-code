/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CheckpointStore — ordered list of per-turn checkpoints.
 *
 * A checkpoint is created at the start of every user turn, before any tool
 * execution begins. It records:
 *   - The user prompt text
 *   - A timestamp (ms since epoch)
 *   - A map of file paths → original file content (captured before any
 *     Write/Edit/NotebookEdit tool runs for that turn)
 *
 * File snapshots are added lazily (via `snapshotFile`) when the agent is
 * about to run a mutating tool — they are NOT read eagerly on checkpoint
 * creation, so no latency is added to turns that touch no files.
 */

import * as fs from 'node:fs';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single checkpoint capturing the state at the start of a user turn.
 */
export interface Checkpoint {
  /** Stable identifier derived from promptId (e.g. "session#agent#0"). */
  readonly promptId: string;
  /** The raw text of the user prompt that triggered this turn. */
  readonly userPrompt: string;
  /** When the checkpoint was created (ms since epoch). */
  readonly timestamp: number;
  /**
   * Map of absolute file path → file content captured **before** any
   * mutating tool ran in this turn.
   *
   * Only files that were about to be modified are present here;
   * files that were never touched are absent (to avoid spurious I/O).
   */
  readonly fileSnapshots: ReadonlyMap<string, string>;
}

// ─── CheckpointStore ──────────────────────────────────────────────────────────

/**
 * Maintains an ordered list of checkpoints, one per user turn.
 *
 * Usage pattern:
 * 1. Call `add(promptId, userPrompt)` at the start of every user turn.
 * 2. Before running a Write/Edit/NotebookEdit tool, call
 *    `snapshotFile(promptId, filePath)` to capture the file's current
 *    content (if the file exists).  This is a no-op if the file has
 *    already been snapshotted for that turn.
 * 3. Query checkpoints via `list()` or `getAt(index)`.
 */
export class CheckpointStore {
  /** Ordered list of checkpoints (earliest first). */
  private readonly checkpoints: InternalCheckpoint[] = [];

  /** Fast lookup: promptId → index in `checkpoints`. */
  private readonly index = new Map<string, number>();

  // ─── Core API ──────────────────────────────────────────────

  /**
   * Creates a new checkpoint for the given user turn.
   *
   * Must be called before any tool execution for the turn.
   * If a checkpoint for `promptId` already exists it is a no-op
   * (idempotent guard against double-registration).
   *
   * @param promptId   - Stable identifier for this turn (e.g. from AgentCore).
   * @param userPrompt - The raw text the user sent.
   */
  add(promptId: string, userPrompt: string): void {
    if (this.index.has(promptId)) {
      return; // idempotent
    }
    const checkpoint: InternalCheckpoint = {
      promptId,
      userPrompt,
      timestamp: Date.now(),
      fileSnapshots: new Map<string, string>(),
    };
    const idx = this.checkpoints.push(checkpoint) - 1;
    this.index.set(promptId, idx);
  }

  /**
   * Snapshot the current content of a file for the given turn, if it has
   * not already been snapshotted.
   *
   * This should be called **before** a mutating tool (Write / Edit /
   * NotebookEdit) runs, so the store holds the pre-edit version.
   *
   * If the file does not exist (new file creation), the snapshot is stored
   * as `null` (represented as an empty string sentinel `""` in the map
   * with a `null` marker — callers should use `fileExistedBeforeTurn` to
   * distinguish).
   *
   * Implementation note: to keep the API simple we store `""` for a
   * file that did not exist before the turn, which is distinguishable
   * from a genuinely empty file only through `fileExistedBeforeTurn()`.
   *
   * @param promptId - The turn identifier returned by `add()`.
   * @param filePath - Absolute path to the file.
   * @returns `true` if a snapshot was taken, `false` if it was already
   *          present or the turn is unknown.
   */
  snapshotFile(promptId: string, filePath: string): boolean {
    const checkpoint = this.getInternal(promptId);
    if (!checkpoint) return false;
    if (checkpoint.fileSnapshots.has(filePath)) return false; // already snapshotted

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      // File did not exist before this turn (new file creation).
      content = CHECK_NOT_EXISTED;
    }

    checkpoint.fileSnapshots.set(filePath, content);
    return true;
  }

  /**
   * Returns whether a file existed before the given turn started.
   *
   * Returns `undefined` when the turn or file is not tracked.
   */
  fileExistedBeforeTurn(
    promptId: string,
    filePath: string,
  ): boolean | undefined {
    const checkpoint = this.getInternal(promptId);
    if (!checkpoint) return undefined;
    const snap = checkpoint.fileSnapshots.get(filePath);
    if (snap === undefined) return undefined;
    return snap !== CHECK_NOT_EXISTED;
  }

  // ─── Query API ─────────────────────────────────────────────

  /**
   * Returns all checkpoints in creation order (earliest first).
   *
   * The returned array is a shallow copy; mutations to it are safe
   * but the `Checkpoint` objects themselves are read-only.
   */
  list(): Checkpoint[] {
    return this.checkpoints.map(toPublic);
  }

  /**
   * Returns only main-thread checkpoints — those whose promptId was created
   * by the main session (format: `"sessionId########counter"`).
   *
   * Subagent checkpoints use a single `#` separator
   * (`"sessionId#agentName-random#counter"`) and are excluded.
   *
   * Also filters out entries with empty userPrompt (defensive guard against
   * internal turns that captured no meaningful user text).
   */
  listMainThread(): Checkpoint[] {
    return this.checkpoints
      .filter(
        (c) => c.promptId.includes('########') && c.userPrompt.trim() !== '',
      )
      .map(toPublic);
  }

  /**
   * Returns the checkpoint at the given (zero-based) index.
   *
   * Negative indices count from the end (Python-style), so `-1` is the
   * most recent checkpoint.
   *
   * @throws {RangeError} when the index is out of bounds.
   */
  getAt(index: number): Checkpoint {
    const len = this.checkpoints.length;
    if (len === 0) {
      throw new RangeError('CheckpointStore is empty');
    }
    const normalized = index < 0 ? len + index : index;
    if (normalized < 0 || normalized >= len) {
      throw new RangeError(
        `Index ${index} is out of bounds (store has ${len} checkpoint(s))`,
      );
    }
    return toPublic(this.checkpoints[normalized]);
  }

  /**
   * Looks up a checkpoint by its promptId.
   *
   * @returns The matching checkpoint, or `undefined` if not found.
   */
  getByPromptId(promptId: string): Checkpoint | undefined {
    const checkpoint = this.getInternal(promptId);
    return checkpoint ? toPublic(checkpoint) : undefined;
  }

  /** Number of checkpoints currently stored. */
  get size(): number {
    return this.checkpoints.length;
  }

  // ─── Rewind API ────────────────────────────────────────────

  /**
   * Restores all files snapshotted in the given checkpoint to their pre-turn state.
   *
   * For each file recorded in the checkpoint's `fileSnapshots`:
   * - If the file did not exist before the turn (i.e. it was newly created),
   *   it is **deleted** from disk.  If the file is already absent (because a
   *   previous rewind already removed it), the deletion is silently skipped.
   * - Otherwise the original file content is written back to disk, overwriting
   *   whatever is there now.
   *
   * This method is **idempotent**: calling it multiple times with the same
   * `promptId` always produces the same on-disk result.
   *
   * @param promptId - The turn identifier whose checkpoint should be rewound.
   * @returns An array of absolute file paths that were restored or deleted.
   * @throws {Error} if no checkpoint for `promptId` exists.
   */
  rewindToCheckpoint(promptId: string): string[] {
    const checkpoint = this.getInternal(promptId);
    if (!checkpoint) {
      throw new Error(
        `rewindToCheckpoint: no checkpoint found for promptId "${promptId}"`,
      );
    }

    const restoredPaths: string[] = [];

    for (const [filePath, content] of checkpoint.fileSnapshots) {
      if (content === CHECK_NOT_EXISTED) {
        // The file was created during this turn — remove it on rewind.
        try {
          fs.unlinkSync(filePath);
        } catch {
          // File may already be absent (previous rewind or manual deletion).
          // Treat as success to preserve idempotency.
        }
      } else {
        // Restore the original pre-turn content.
        fs.writeFileSync(filePath, content, 'utf8');
      }
      restoredPaths.push(filePath);
    }

    return restoredPaths;
  }

  // ─── Private helpers ────────────────────────────────────────

  private getInternal(promptId: string): InternalCheckpoint | undefined {
    const idx = this.index.get(promptId);
    return idx !== undefined ? this.checkpoints[idx] : undefined;
  }
}

// ─── Internal types & helpers ─────────────────────────────────────────────────

/**
 * Sentinel value stored when a file did not exist before the turn.
 * Using a unique Symbol-like string avoids the need for a nullable map.
 */
const CHECK_NOT_EXISTED = '\x00__not_existed__\x00';

/** Mutable version used internally before we expose read-only views. */
interface InternalCheckpoint {
  promptId: string;
  userPrompt: string;
  timestamp: number;
  fileSnapshots: Map<string, string>;
}

/** Projects an InternalCheckpoint to the read-only public Checkpoint shape. */
function toPublic(c: InternalCheckpoint): Checkpoint {
  return {
    promptId: c.promptId,
    userPrompt: c.userPrompt,
    timestamp: c.timestamp,
    fileSnapshots: c.fileSnapshots as ReadonlyMap<string, string>,
  };
}
