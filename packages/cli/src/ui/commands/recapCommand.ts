/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateRecap } from '@qwen-code/qwen-code-core';
import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

export const recapCommand: SlashCommand = {
  name: 'recap',
  description:
    'Print a short "where we left off" card summarizing the recent conversation.',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
    const config = context.services.config;
    const geminiClient = config?.getGeminiClient();
    if (!config || !geminiClient) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    const conversation = geminiClient.getHistory?.() ?? [];
    const hasModel = conversation.some((c) => c.role === 'model');
    const hasUser = conversation.some((c) => c.role === 'user');
    if (!hasModel || !hasUser) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation to recap yet.',
      };
    }

    const controller = new AbortController();
    const onUpstreamAbort = () => controller.abort();
    context.abortSignal?.addEventListener('abort', onUpstreamAbort);

    try {
      const text = await generateRecap(config, conversation, controller.signal);
      if (controller.signal.aborted) return undefined;
      if (!text) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'Recap returned no content.',
        };
      }
      context.ui.addItem({ type: MessageType.RECAP, text }, Date.now());
      return undefined;
    } finally {
      context.abortSignal?.removeEventListener('abort', onUpstreamAbort);
    }
  },
};
