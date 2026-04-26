/**
 * @license
 * Copyright 2025 proto
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import type { HistoryItemInsightProgress } from '../types.js';
import { t } from '../../i18n/index.js';
import { join } from 'path';
import { StaticInsightGenerator } from '../../services/insight/generators/StaticInsightGenerator.js';
import { createDebugLogger, Storage } from '@qwen-code/qwen-code-core';
import { SettingScope } from '../../config/settings.js';
import open from 'open';

const logger = createDebugLogger('DataProcessor');

function statusMessage(context: CommandContext): SlashCommandActionReturn {
  const enabled = context.services.settings.merged.insight?.enabled ?? true;
  return {
    type: 'message',
    messageType: 'info',
    content: enabled
      ? 'Insight: enabled. Run /insight to generate a report.'
      : 'Insight: disabled. Run /insight enable to turn it back on.',
  };
}

function setEnabled(
  context: CommandContext,
  value: boolean,
): SlashCommandActionReturn {
  context.services.settings.setValue(
    SettingScope.User,
    'insight.enabled',
    value,
  );
  return {
    type: 'message',
    messageType: 'info',
    content: value
      ? 'Insight enabled. Run /insight to generate a report.'
      : 'Insight disabled. Run /insight enable to turn it back on.',
  };
}

export const insightCommand: SlashCommand = {
  name: 'insight',
  get description() {
    return t(
      'generate personalized programming insights from your chat history',
    );
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'status',
      description: 'Show insight enabled status',
      kind: CommandKind.BUILT_IN,
      action: statusMessage,
    },
    {
      name: 'enable',
      description: 'Enable /insight report generation',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext): SlashCommandActionReturn =>
        setEnabled(context, true),
    },
    {
      name: 'disable',
      description: 'Disable /insight report generation',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext): SlashCommandActionReturn =>
        setEnabled(context, false),
    },
  ],
  action: async (context: CommandContext) => {
    if (context.services.settings.merged.insight?.enabled === false) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: t(
            'Insight is disabled. Run /insight enable to turn it back on.',
          ),
        },
        Date.now(),
      );
      return;
    }
    try {
      context.ui.setDebugMessage(t('Generating insights...'));

      const projectsDir = join(Storage.getRuntimeBaseDir(), 'projects');
      if (!context.services.config) {
        throw new Error('Config service is not available');
      }
      const insightGenerator = new StaticInsightGenerator(
        context.services.config,
      );

      const updateProgress = (
        stage: string,
        progress: number,
        detail?: string,
      ) => {
        const progressItem: HistoryItemInsightProgress = {
          type: MessageType.INSIGHT_PROGRESS,
          progress: {
            stage,
            progress,
            detail,
          },
        };
        context.ui.setPendingItem(progressItem);
      };

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: t('This may take a couple minutes. Sit tight!'),
        },
        Date.now(),
      );

      // Initial progress
      updateProgress(t('Starting insight generation...'), 0);

      // Generate the static insight HTML file
      const outputPath = await insightGenerator.generateStaticInsight(
        projectsDir,
        updateProgress,
      );

      // Clear pending item
      context.ui.setPendingItem(null);

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: t('Insight report generated successfully!'),
        },
        Date.now(),
      );

      // Open the file in the default browser
      try {
        await open(outputPath);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: t('Opening insights in your browser: {{path}}', {
              path: outputPath,
            }),
          },
          Date.now(),
        );
      } catch (browserError) {
        logger.error('Failed to open browser automatically:', browserError);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: t(
              'Insights generated at: {{path}}. Please open this file in your browser.',
              {
                path: outputPath,
              },
            ),
          },
          Date.now(),
        );
      }

      context.ui.setDebugMessage(t('Insights ready.'));
    } catch (error) {
      // Clear pending item on error
      context.ui.setPendingItem(null);

      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: t('Failed to generate insights: {{error}}', {
            error: (error as Error).message,
          }),
        },
        Date.now(),
      );

      logger.error('Insight generation error:', error);
    }
  },
};
