/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview agentCore — checkpoint integration utilities for the agent engine.
 *
 * This module exposes a session-scoped CheckpointStore singleton and the
 * helper functions that the agent runtime calls to:
 *
 *   1. Create a checkpoint at the start of every user turn (before tool
 *      execution begins).
 *   2. Snapshot file content before a mutating tool (Write / Edit /
 *      NotebookEdit) runs, so the checkpoint holds the pre-edit version.
 *
 * The store is lazily initialised on first use and lives for the lifetime of
 * the Node.js process (one proto session).  It is intentionally module-level
 * so that both the agent runtime and individual tool wrappers can reach it
 * without threading a reference through every call frame.
 *
 * ## Zero-latency guarantee
 *
 * Checkpoints are created eagerly (`beginTurn`) but file snapshots are only
 * read lazily (`snapshotFileBeforeEdit`).  Turns that never touch a file pay
 * no I/O cost.
 */

import path from 'node:path';
import { CheckpointStore } from './checkpointStore.js';
import { ToolNames } from '../tools/tool-names.js';
import type { Config } from '../config/config.js';

// ─── Session-scoped singleton ──────────────────────────────────────────────

/**
 * The single, shared CheckpointStore for the current process/session.
 *
 * Consumers that need direct access to the store can import this.
 */
export const checkpointStore = new CheckpointStore();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers a new checkpoint for a user turn.
 *
 * Call this **before** any tool is scheduled for the turn.  It is idempotent:
 * calling it twice with the same `promptId` is safe.
 *
 * @param promptId   - Stable turn identifier (e.g. `"session#agent#0"`).
 * @param userPrompt - The raw text the user sent that triggered this turn.
 */
export function beginTurn(promptId: string, userPrompt: string): void {
  checkpointStore.add(promptId, userPrompt);
}

/**
 * Snapshot a file's current content into the checkpoint for `promptId`,
 * but only if the file is one that a mutating tool is about to modify.
 *
 * This is a no-op when:
 * - The tool name is not in the set of file-mutating tools.
 * - The file has already been snapshotted for this turn.
 * - The turn is unknown (e.g. `beginTurn` was not called).
 *
 * Call this **before** the tool's `execute()` method runs.
 *
 * @param promptId - Turn identifier (same value passed to `beginTurn`).
 * @param toolName - The tool's canonical name (from `ToolNames`).
 * @param args     - The tool call arguments (used to extract the file path).
 * @returns `true` if a snapshot was taken, `false` otherwise.
 */
export function snapshotFileBeforeEdit(
  promptId: string,
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  if (!FILE_MUTATING_TOOLS.has(toolName)) return false;

  const filePath = extractFilePath(toolName, args);
  if (!filePath || typeof filePath !== 'string') return false;

  return checkpointStore.snapshotFile(promptId, filePath);
}

/**
 * Create a git snapshot in the shadow repo before a file-mutating tool runs.
 * Provides durable, named checkpoints that survive process crashes and enable
 * per-edit rollback via GitService.restoreProjectFromSnapshot().
 *
 * Fire-and-forget safe: errors are swallowed so that a snapshot failure never
 * blocks the tool from executing.
 *
 * @param config   - Runtime config (provides access to the GitService).
 * @param toolName - The canonical tool name (e.g. `ToolNames.EDIT`).
 * @param args     - Tool call arguments (used to extract the target file path).
 * @returns The shadow-repo commit hash if a snapshot was created, otherwise null.
 */
export async function gitSnapshotBeforeEdit(
  config: Config,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  if (!FILE_MUTATING_TOOLS.has(toolName)) return null;
  const filePath = extractFilePath(toolName, args);
  if (!filePath) return null;

  try {
    const gitService = await config.getGitService();
    const label = `proto-checkpoint:${toolName}:${path.basename(filePath)}`;
    const hash = await gitService.createFileSnapshot(label);
    return hash ?? null;
  } catch {
    // Snapshot failure must never block tool execution
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The set of tool names that modify file content.
 *
 * Only calls to these tools trigger a pre-edit file snapshot.
 */
export const FILE_MUTATING_TOOLS = new Set<string>([
  ToolNames.WRITE_FILE,
  ToolNames.EDIT,
  // NotebookEdit is handled by its MCP name (not in core ToolNames).
  // Add the canonical name so external callers can extend this set.
  'notebook_edit',
]);

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the file path from a tool call's arguments.
 *
 * Each tool uses slightly different parameter names; this function
 * handles the known variants.
 */
function extractFilePath(
  toolName: string,
  args: Record<string, unknown>,
): string | undefined {
  switch (toolName) {
    case ToolNames.WRITE_FILE:
      // WriteFile uses `file_path`
      return typeof args['file_path'] === 'string'
        ? args['file_path']
        : undefined;

    case ToolNames.EDIT:
      // Edit uses `file_path`
      return typeof args['file_path'] === 'string'
        ? args['file_path']
        : undefined;

    case 'notebook_edit':
      // NotebookEdit uses `notebook_path`
      return typeof args['notebook_path'] === 'string'
        ? args['notebook_path']
        : undefined;

    default:
      return undefined;
  }
}
