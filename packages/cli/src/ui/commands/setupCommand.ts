/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageActionReturn, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';

export const setupCommand: SlashCommand = {
  name: 'setup',
  get description() {
    return t(
      'Configure a model provider interactively (run `proto setup` from terminal for full wizard)',
    );
  },
  kind: CommandKind.BUILT_IN,
  action: (_context, _args): MessageActionReturn => ({
    type: 'message',
    messageType: 'info',
    content: t(
      '🔧 The setup wizard requires exclusive terminal access.\n\nRun `proto setup` from your terminal to configure a provider, API key, and default model interactively.',
    ),
  }),
};
