/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * Background-shell watcher.
 *
 * Polls a registered task's `.exit` sentinel file (and falls back to a
 * liveness check on the captured PID) to detect process exit. Updates
 * the registry on terminal status — no streaming required, since stdout
 * is already going to disk via the shell-level redirection in shell.ts.
 */

import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { readBackgroundTaskExit, readBackgroundTaskPid } from './diskOutput.js';

const debugLogger = createDebugLogger('BG_SHELL_WATCHER');

const POLL_INTERVAL_MS = 1000;
/** Hard ceiling so a stuck watcher can't run forever. ~7 days. */
const MAX_POLL_ATTEMPTS = 60 * 60 * 24 * 7;

/** True iff a process with this pid is still alive (best-effort, POSIX). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM = exists but we can't signal it (still alive). ESRCH = gone.
    return code === 'EPERM';
  }
}

/**
 * Begin polling for a task's exit. Resolves once the task has been marked
 * with a terminal status. Errors are logged and swallowed — this runs as
 * a fire-and-forget side effect.
 */
export function startBackgroundShellWatcher(
  config: Config,
  taskId: string,
): void {
  void poll(config, taskId).catch((err) => {
    debugLogger.warn(
      `[bg-shell-watcher] task ${taskId}: poll failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

async function poll(config: Config, taskId: string): Promise<void> {
  const registry = config.getBackgroundShellRegistry();
  let attempts = 0;
  let pidCache: number | null = null;

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    const task = registry.get(taskId);
    if (!task) return; // registry was cleared, nothing to watch
    if (task.status !== 'running') return; // someone else (bg_stop) finalized it

    if (pidCache === null) {
      pidCache = await readBackgroundTaskPid(config, taskId);
      if (pidCache !== null && task.pid === undefined) {
        registry.update(taskId, { pid: pidCache });
      }
    }

    // Prefer the exit-code sentinel: it's written *after* the process
    // exits and tells us the actual code, including for failures.
    const exitCode = await readBackgroundTaskExit(config, taskId);
    if (exitCode !== null) {
      const status = exitCode === 0 ? 'completed' : 'failed';
      registry.markExit(taskId, status, exitCode);
      return;
    }

    // Fallback: pid disappeared but we somehow missed the sentinel
    // (process killed by SIGKILL, oom, etc). Mark as failed with
    // unknown exit code so the next-turn notification still fires.
    if (pidCache !== null && !isPidAlive(pidCache)) {
      // Give the sentinel one more poll cycle to land — common race
      // where the process exited but the parent shell hasn't flushed
      // `echo $? > .exit` yet.
      await sleep(POLL_INTERVAL_MS);
      const lateExit = await readBackgroundTaskExit(config, taskId);
      if (lateExit !== null) {
        const status = lateExit === 0 ? 'completed' : 'failed';
        registry.markExit(taskId, status, lateExit);
        return;
      }
      registry.markExit(taskId, 'failed', null);
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  debugLogger.warn(
    `[bg-shell-watcher] task ${taskId}: gave up after ${attempts} attempts`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
