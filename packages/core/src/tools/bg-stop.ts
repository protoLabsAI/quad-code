/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * bg_stop — kill a long-running background shell task spawned by the
 * shell tool with `is_background: true`. Sends SIGTERM to the process
 * group, then SIGKILL after a short grace period if still alive.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('BG_STOP');

const SIGKILL_GRACE_MS = 3000;

export interface BgStopParams {
  task_id: string;
  reason?: string;
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    // Negative pid signals the whole process group, killing children too.
    process.kill(-pid, signal);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false; // already gone
    if (code === 'EPERM') {
      // Fall back to signaling just the leader.
      try {
        process.kill(pid, signal);
        return true;
      } catch {
        return false;
      }
    }
    debugLogger.warn(
      `[bg_stop] kill(-${pid}, ${signal}) failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

class BgStopToolInvocation extends BaseToolInvocation<
  BgStopParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: BgStopParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Stop background task: ${this.params.task_id}${
      this.params.reason ? ` (${this.params.reason})` : ''
    }`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const registry = this.config.getBackgroundShellRegistry();
    const task = registry.get(this.params.task_id);

    if (!task) {
      const msg = `No background task with ID "${this.params.task_id}".`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg },
      };
    }

    if (task.status !== 'running') {
      const msg = `Background task "${this.params.task_id}" already finished with status "${task.status}".`;
      return {
        llmContent: msg,
        returnDisplay: msg,
      };
    }

    if (!task.pid) {
      // No PID captured — can't signal. Mark killed so the next-turn
      // notification fires anyway.
      registry.markExit(task.id, 'killed', null);
      const msg = `Background task "${task.id}" had no captured PID; marked killed without signal.`;
      return { llmContent: msg, returnDisplay: msg };
    }

    const sigtermOk = killProcessGroup(task.pid, 'SIGTERM');
    if (!sigtermOk && !isAlive(task.pid)) {
      registry.markExit(task.id, 'killed', null);
      const msg = `Background task "${task.id}" was already gone.`;
      return { llmContent: msg, returnDisplay: msg };
    }

    // SIGKILL fallback after a short grace period.
    setTimeout(() => {
      if (task.pid && isAlive(task.pid)) {
        killProcessGroup(task.pid, 'SIGKILL');
      }
    }, SIGKILL_GRACE_MS).unref();

    // Optimistically mark as killed in the registry — the watcher will
    // also see the process disappear and is a no-op once status flipped.
    registry.markExit(task.id, 'killed', null);

    const msg = `Background task "${task.id}" stopped (SIGTERM${
      this.params.reason ? `: ${this.params.reason}` : ''
    }).`;
    return {
      llmContent: msg,
      returnDisplay: msg,
    };
  }
}

export class BgStopTool extends BaseDeclarativeTool<BgStopParams, ToolResult> {
  static readonly Name: string = ToolNames.BG_STOP;

  constructor(private readonly config: Config) {
    super(
      BgStopTool.Name,
      ToolDisplayNames.BG_STOP,
      'Stops a long-running background shell task spawned by the shell tool with is_background=true. Sends SIGTERM to the process group, escalating to SIGKILL after a short grace period.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'The ID of the background task to stop.',
            minLength: 1,
          },
          reason: {
            type: 'string',
            description: 'Optional reason for stopping (audit only).',
          },
        },
        required: ['task_id'],
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
    );
  }

  protected createInvocation(
    params: BgStopParams,
  ): ToolInvocation<BgStopParams, ToolResult> {
    return new BgStopToolInvocation(this.config, params);
  }
}
