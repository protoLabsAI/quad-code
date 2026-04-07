/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import picomatch from 'picomatch';

/**
 * Scope lock — restricts which files an agent session is permitted to modify.
 *
 * Activated from a sprint contract before coding begins. Any write to a path
 * outside the permitted set is a scope violation. The harness injects a
 * recovery message and can trigger a git rollback.
 *
 * Usage:
 *   sessionScopeLock.activate(['/abs/path/to/file.ts', '/abs/path/to/other.ts']);
 *   const violation = sessionScopeLock.checkWrite('/abs/path/to/unexpected.ts');
 *   if (violation) { // handle violation }
 */

export interface ScopeViolation {
  path: string;
  permittedPaths: string[];
  permittedGlobs: string[];
}

export class ScopeLockService {
  private permittedPaths = new Set<string>();
  private permittedGlobs: string[] = [];
  private active = false;

  /**
   * Activate the scope lock with a set of permitted absolute file paths and
   * optional glob patterns (relative to project root).
   *
   * Call this after a sprint contract has been negotiated, before any file
   * edits begin.
   */
  activate(absolutePaths: string[], globs: string[] = []): void {
    this.permittedPaths = new Set(absolutePaths.map((p) => path.normalize(p)));
    this.permittedGlobs = globs;
    this.active = true;
  }

  /**
   * Deactivate the scope lock (e.g., after task completion or on user request).
   */
  deactivate(): void {
    this.active = false;
    this.permittedPaths.clear();
    this.permittedGlobs = [];
  }

  /**
   * Check whether writing to the given absolute path is permitted.
   *
   * Returns a `ScopeViolation` if the write is outside scope, or `null` if
   * the write is permitted (or the lock is inactive).
   */
  checkWrite(absolutePath: string): ScopeViolation | null {
    if (!this.active) return null;

    const normalized = path.normalize(absolutePath);

    // Permitted by exact path match
    if (this.permittedPaths.has(normalized)) return null;

    // Permitted by glob pattern (checked against absolute path)
    for (const glob of this.permittedGlobs) {
      if (picomatch(glob, { dot: true })(normalized)) return null;
    }

    return {
      path: normalized,
      permittedPaths: Array.from(this.permittedPaths),
      permittedGlobs: this.permittedGlobs,
    };
  }

  isActive(): boolean {
    return this.active;
  }

  getPermittedPaths(): ReadonlySet<string> {
    return this.permittedPaths;
  }
}

/**
 * Session-scoped singleton. Import this wherever scope enforcement is needed.
 *
 * Activated by `SprintContractService.activateScopeLock()` or manually via
 * `sessionScopeLock.activate([...paths])`.
 */
export const sessionScopeLock = new ScopeLockService();

/**
 * Format a scope violation into a harness recovery message for injection
 * into the conversation.
 */
export function formatScopeViolationMessage(violation: ScopeViolation): string {
  const permitted =
    violation.permittedPaths.length > 0
      ? violation.permittedPaths.map((p) => `  - ${p}`).join('\n')
      : '  (none specified)';

  return (
    `[SCOPE VIOLATION] Attempted to write to: ${violation.path}\n` +
    `This file is outside the permitted scope for this task.\n\n` +
    `Permitted files:\n${permitted}\n\n` +
    `Do NOT modify files outside the permitted scope. ` +
    `If this file genuinely needs to change, stop and ask the user to expand the scope.`
  );
}
