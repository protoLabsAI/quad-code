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
import { SettingScope } from '../../config/settings.js';

const DEFAULT_THRESHOLD_SECONDS = 300;
const DEFAULT_THRESHOLD_TOOL_CALLS = 15;

function statusMessage(context: CommandContext): SlashCommandActionReturn {
  const merged = context.services.settings.merged;
  const enabled = merged.recap?.enabled ?? true;
  const seconds = merged.recap?.thresholdSeconds ?? DEFAULT_THRESHOLD_SECONDS;
  const toolCalls =
    merged.recap?.thresholdToolCalls ?? DEFAULT_THRESHOLD_TOOL_CALLS;

  return {
    type: 'message',
    messageType: 'info',
    content: [
      `Recap: ${enabled ? 'enabled' : 'disabled'}`,
      `Duration threshold: ${seconds}s`,
      `Tool-call threshold: ${toolCalls}`,
      enabled
        ? 'A "where we left off" card will be appended after long agent turns.'
        : 'Run /recap enable to turn it back on.',
    ].join('\n'),
  };
}

function setEnabled(
  context: CommandContext,
  value: boolean,
): SlashCommandActionReturn {
  context.services.settings.setValue(SettingScope.User, 'recap.enabled', value);
  return {
    type: 'message',
    messageType: 'info',
    content: value
      ? 'Recap enabled. Long-running turns will produce a "where we left off" card.'
      : 'Recap disabled.',
  };
}

export const recapCommand: SlashCommand = {
  name: 'recap',
  description:
    'Toggle the long-turn recap card (※ where we left off). Run with no args for status.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'status',
      description: 'Show recap status and thresholds',
      kind: CommandKind.BUILT_IN,
      action: statusMessage,
    },
    {
      name: 'enable',
      description: 'Enable the long-turn recap card',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext): SlashCommandActionReturn =>
        setEnabled(context, true),
    },
    {
      name: 'disable',
      description: 'Disable the long-turn recap card',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext): SlashCommandActionReturn =>
        setEnabled(context, false),
    },
  ],
  action: (context: CommandContext): SlashCommandActionReturn =>
    statusMessage(context),
};
