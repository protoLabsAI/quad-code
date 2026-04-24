/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { runSetupWizard } from './setup/handler.js';
import { t } from '../i18n/index.js';

export const setupCommand: CommandModule = {
  command: 'setup',
  describe: t(
    'Interactive setup wizard — configure a model provider, API key, and default model',
  ),
  builder: (yargs: Argv) => yargs.version(false),
  handler: async () => {
    await runSetupWizard();
  },
};
