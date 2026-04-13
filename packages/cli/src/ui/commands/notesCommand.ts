/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * /notes — view or refresh the session notes file (.proto/session-notes.md).
 *
 * Usage:
 *   /notes          — trigger a fresh extraction then display the notes
 *   /notes --view   — display the current notes without re-extracting
 */

import {
  manuallyExtractSessionMemory,
  readSessionNotes,
  isSessionNotesEmpty,
  uiTelemetryService,
} from '@qwen-code/qwen-code-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';

export const notesCommand: SlashCommand = {
  name: 'notes',
  get description() {
    return t(
      'View or refresh session notes (.proto/session-notes.md). Use --view to display without re-extracting.',
    );
  },
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn> => {
    const { config } = context.services;
    const { ui } = context;
    const executionMode = context.executionMode ?? 'interactive';

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Config not loaded.'),
      };
    }

    const args = context.invocation?.args?.trim() ?? '';
    const viewOnly = args.includes('--view');

    const projectRoot = config.getProjectRoot();

    const run = async (): Promise<SlashCommandActionReturn> => {
      if (!viewOnly) {
        // Show a "refreshing" indicator while the agent runs
        if (executionMode === 'interactive') {
          ui.addItem(
            { type: MessageType.INFO, text: t('↺ Refreshing session notes…') },
            Date.now(),
          );
        }

        const geminiClient = config.getGeminiClient();
        const history = geminiClient?.getChat().getHistory() ?? [];
        const tokenCount = uiTelemetryService.getLastPromptTokenCount();

        const result = await manuallyExtractSessionMemory(
          config,
          history,
          tokenCount,
        );

        if (!result.success) {
          const errMsg = t('Failed to refresh session notes: {{error}}', {
            error: result.error ?? 'unknown error',
          });
          if (executionMode === 'interactive') {
            ui.addItem({ type: MessageType.ERROR, text: errMsg }, Date.now());
          }
          return { type: 'message', messageType: 'error', content: errMsg };
        }
      }

      // Read and display the notes
      const notes = await readSessionNotes(projectRoot);

      if (!notes || isSessionNotesEmpty(notes)) {
        const msg = t(
          'Session notes are empty. Keep chatting — notes are updated automatically after ~10 000 tokens.',
        );
        if (executionMode === 'interactive') {
          ui.addItem({ type: MessageType.INFO, text: msg }, Date.now());
        }
        return { type: 'message', messageType: 'info', content: msg };
      }

      const notesPath = `${projectRoot}/.proto/session-notes.md`;
      const header = viewOnly
        ? t('Session notes ({{path}}):', { path: notesPath })
        : t('Session notes refreshed ({{path}}):', { path: notesPath });

      if (executionMode === 'interactive') {
        ui.addItem(
          { type: MessageType.INFO, text: `${header}\n\n${notes}` },
          Date.now(),
        );
        return { type: 'message', messageType: 'info', content: '' };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `${header}\n\n${notes}`,
      };
    };

    if (executionMode === 'acp') {
      const messages = async function* () {
        try {
          yield {
            messageType: 'info' as const,
            content: t('Loading session notes…'),
          };
          const result = await run();
          if (result.type === 'message') {
            yield {
              messageType: result.messageType,
              content: result.content ?? '',
            };
          }
        } catch (e) {
          yield {
            messageType: 'error' as const,
            content: t('Failed to load session notes: {{error}}', {
              error: e instanceof Error ? e.message : String(e),
            }),
          };
        }
      };
      return { type: 'stream_messages', messages: messages() };
    }

    try {
      return await run();
    } catch (e) {
      const msg = t('Failed to load session notes: {{error}}', {
        error: e instanceof Error ? e.message : String(e),
      });
      if (executionMode === 'interactive') {
        ui.addItem({ type: MessageType.ERROR, text: msg }, Date.now());
      }
      return { type: 'message', messageType: 'error', content: msg };
    }
  },
};
