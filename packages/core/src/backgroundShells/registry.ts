/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * Background shell registry — tracks long-running background shell tasks
 * spawned by the shell tool with `is_background: true`, plus any commands
 * that get auto-backgrounded after exceeding the foreground budget.
 *
 * Shape mirrors cc-2.18's task framework, but scoped to local shells only
 * (no agents/remote sessions).
 *
 * One registry per Config — singleton per session. Output files live at
 * <projectTempDir>/<sessionId>/tasks/<taskId>.output.
 */

import type {
  BackgroundShellRegistrationInput,
  BackgroundShellStatus,
  BackgroundShellTask,
} from './types.js';

export class BackgroundShellRegistry {
  private readonly tasks = new Map<string, BackgroundShellTask>();
  private readonly listeners = new Set<() => void>();

  register(input: BackgroundShellRegistrationInput): BackgroundShellTask {
    const task: BackgroundShellTask = {
      id: input.id,
      command: input.command,
      description: input.description,
      cwd: input.cwd,
      outputPath: input.outputPath,
      pid: input.pid,
      startTime: Date.now(),
      status: 'running',
      notified: false,
    };
    this.tasks.set(task.id, task);
    this.notify();
    return task;
  }

  /** Mark a still-tracked task as exited and capture its final state. */
  markExit(
    id: string,
    status: Exclude<BackgroundShellStatus, 'running'>,
    exitCode: number | null,
  ): BackgroundShellTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (task.status !== 'running') return task;
    task.status = status;
    task.exitCode = exitCode;
    task.endTime = Date.now();
    this.notify();
    return task;
  }

  /** Patch arbitrary fields. Used by bg_stop and the watcher. */
  update(id: string, patch: Partial<BackgroundShellTask>): void {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, patch);
    this.notify();
  }

  get(id: string): BackgroundShellTask | undefined {
    return this.tasks.get(id);
  }

  /** All tasks, newest first. */
  list(): BackgroundShellTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startTime - a.startTime);
  }

  /** Currently-running tasks. */
  running(): BackgroundShellTask[] {
    return this.list().filter((t) => t.status === 'running');
  }

  /**
   * Returns completed-but-unnotified tasks and atomically marks them
   * notified. Called by the client just before sending a user query so
   * the model sees a <task_notification> for each task that finished
   * since the last turn.
   */
  drainPendingNotifications(): BackgroundShellTask[] {
    const drained: BackgroundShellTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'running' && !task.notified) {
        task.notified = true;
        drained.push({ ...task });
      }
    }
    if (drained.length > 0) this.notify();
    return drained;
  }

  /** Subscribe to any change. Returns an unsubscribe handle. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Drop all registry state. Used by tests and when a session ends —
   * does NOT delete the on-disk output files.
   */
  clear(): void {
    this.tasks.clear();
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // listener errors must not bring down the registry
      }
    }
  }
}
