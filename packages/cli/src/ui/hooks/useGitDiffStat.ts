/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { execCommand, isCommandAvailable } from '@qwen-code/qwen-code-core';

export interface GitDiffStat {
  /** Number of files with uncommitted changes (staged + unstaged). */
  filesChanged: number;
  /** Total lines added across all changed files. */
  linesAdded: number;
  /** Total lines removed across all changed files. */
  linesRemoved: number;
}

/**
 * Polls `git diff --shortstat HEAD` every `intervalMs` milliseconds and
 * returns the parsed diff statistics for the given working directory.
 *
 * Returns `null` when the directory is not a git repo or git is unavailable.
 */
export function useGitDiffStat(
  cwd: string,
  intervalMs = 5000,
): GitDiffStat | null {
  const [stat, setStat] = useState<GitDiffStat | null>(null);

  const fetchStat = useCallback(async () => {
    try {
      if (!isCommandAvailable('git').available) {
        setStat(null);
        return;
      }
      // --shortstat on HEAD captures both staged and unstaged changes.
      const { stdout } = await execCommand(
        'git',
        ['diff', 'HEAD', '--shortstat'],
        { cwd },
      );
      const text = stdout.toString().trim();
      if (!text) {
        // Clean working tree
        setStat({ filesChanged: 0, linesAdded: 0, linesRemoved: 0 });
        return;
      }
      // Example: " 3 files changed, 42 insertions(+), 7 deletions(-)"
      const files = parseInt(
        text.match(/(\d+) files? changed/)?.[1] ?? '0',
        10,
      );
      const added = parseInt(
        text.match(/(\d+) insertions?\(\+\)/)?.[1] ?? '0',
        10,
      );
      const removed = parseInt(
        text.match(/(\d+) deletions?\(-\)/)?.[1] ?? '0',
        10,
      );
      setStat({
        filesChanged: files,
        linesAdded: added,
        linesRemoved: removed,
      });
    } catch {
      setStat(null);
    }
  }, [cwd]);

  useEffect(() => {
    fetchStat();
    const timer = setInterval(fetchStat, intervalMs);
    return () => clearInterval(timer);
  }, [fetchStat, intervalMs]);

  return stat;
}
