/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * Builds the <task_notification> blocks that get prepended to the next
 * user query so the model sees backgrounded tasks finishing.
 */

import type { BackgroundShellTask } from './types.js';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildBackgroundTaskNotification(
  task: BackgroundShellTask,
): string {
  const exitLine =
    task.exitCode !== undefined && task.exitCode !== null
      ? `\n<exit_code>${task.exitCode}</exit_code>`
      : '';
  const summary = (() => {
    const desc = task.description || task.command;
    switch (task.status) {
      case 'completed':
        return `Background command "${desc}" completed${
          task.exitCode != null ? ` (exit code ${task.exitCode})` : ''
        }.`;
      case 'failed':
        return `Background command "${desc}" failed${
          task.exitCode != null ? ` with exit code ${task.exitCode}` : ''
        }.`;
      case 'killed':
        return `Background command "${desc}" was stopped.`;
      default:
        return `Background command "${desc}" ended in unknown state.`;
    }
  })();

  return [
    '<task_notification>',
    `<task_id>${task.id}</task_id>`,
    `<output_file>${task.outputPath}</output_file>`,
    `<status>${task.status}</status>${exitLine}`,
    `<summary>${escapeXml(summary)}</summary>`,
    '</task_notification>',
    '',
    `Read ${task.outputPath} to see the full output.`,
  ].join('\n');
}
