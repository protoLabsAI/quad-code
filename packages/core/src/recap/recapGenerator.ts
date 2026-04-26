/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recap Generator
 *
 * Generates a 1-3 sentence "where we left off" card after long agent turns.
 * Modeled on cc-2.18's awaySummary, but triggered by turn duration / tool count
 * rather than terminal blur.
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('RECAP');

/** Last-N turns of conversation that get sent to the recap model. */
const RECENT_MESSAGE_WINDOW = 30;

const RECAP_PROMPT = `That last agent turn was long. Summarize where we are so the user can pick back up cold.

Write exactly 1-3 short sentences. Lead with the high-level goal — what they're building or debugging, not implementation details. Then state the concrete current status or next step. No status reports, no commit recaps, no apologies.

Reply with ONLY the recap text — no headers, no quotes, no preamble.`;

/**
 * Generates a short recap of recent conversation. Returns null on abort,
 * empty input, or any error (recap is best-effort and must not crash callers).
 */
export async function generateRecap(
  config: Config,
  conversationHistory: Content[],
  abortSignal: AbortSignal,
): Promise<string | null> {
  if (conversationHistory.length === 0) return null;

  try {
    const recent = conversationHistory.slice(-RECENT_MESSAGE_WINDOW);
    const contents: Content[] = [
      ...recent,
      { role: 'user', parts: [{ text: RECAP_PROMPT }] },
    ];

    const generator = config.getContentGenerator();
    const response = await generator.generateContent(
      {
        model: config.getModel(),
        contents,
        config: {
          abortSignal,
          thinkingConfig: { includeThoughts: false },
        },
      },
      'recap',
    );

    const text = response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) return null;
    return text;
  } catch (error) {
    if (abortSignal.aborted) return null;
    debugLogger.warn(
      `[recap] generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
