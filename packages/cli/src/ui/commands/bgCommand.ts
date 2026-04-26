/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs > 0 ? ` ${rs}s` : ''}`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm > 0 ? ` ${rm}m` : ''}`;
}

function listAction(context: CommandContext): SlashCommandActionReturn {
  const config = context.services.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not available.',
    };
  }
  const registry = config.getBackgroundShellRegistry();
  const tasks = registry.list();

  if (tasks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'No background tasks. Run a shell command with is_background: true to start one.',
    };
  }

  const now = Date.now();
  const lines: string[] = ['Background shell tasks (newest first):', ''];
  for (const t of tasks) {
    const ageMs = (t.endTime ?? now) - t.startTime;
    const status =
      t.status === 'running'
        ? `running (${formatDuration(ageMs)})`
        : `${t.status}${t.exitCode != null ? ` exit=${t.exitCode}` : ''} (ran ${formatDuration(ageMs)})`;
    lines.push(`  ${t.id}  ${status}`);
    lines.push(`    cmd: ${t.command}`);
    lines.push(`    out: ${t.outputPath}`);
    if (t.pid != null) lines.push(`    pid: ${t.pid}`);
    lines.push('');
  }
  lines.push(
    'Stop a running task with the bg_stop tool (or kill <pid> manually).',
  );
  return {
    type: 'message',
    messageType: 'info',
    content: lines.join('\n'),
  };
}

export const bgCommand: SlashCommand = {
  name: 'bg',
  description: 'List long-running background shell tasks',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      description: 'List background tasks',
      kind: CommandKind.BUILT_IN,
      action: listAction,
    },
  ],
  action: listAction,
};
