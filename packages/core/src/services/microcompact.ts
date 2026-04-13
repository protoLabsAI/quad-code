/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Microcompact: selectively clear tool-result bodies from older history entries.
 *
 * Unlike applyObservationMask (which collapses a chunk into a single placeholder
 * message), microcompact preserves the full call/response structure — only the
 * *content* of old functionResponse parts is replaced with a one-line stub.
 *
 * This is lighter than full compaction, requires no LLM call, and is
 * particularly effective for tool-heavy sessions (shell, file reads, etc.)
 * where result payloads are large but the call names / return structure
 * still provide useful signal to the model.
 */

import type { Content } from '@google/genai';
import { INCREMENTAL_PROTECTED_TAIL } from './chatCompressionService.js';

/** Text substituted for cleared tool-result payloads. */
export const MICROCOMPACT_STUB =
  '[result cleared — see session notes for context]';

/**
 * Walk the history and replace the response payload of every functionResponse
 * part that falls *before* the verbatim window with MICROCOMPACT_STUB.
 *
 * The verbatim window keeps the most-recent `verbatimWindowSize` tool-call /
 * result pairs intact (same boundary used by applyObservationMask).
 *
 * @returns The modified history and the number of results cleared.
 */
export function applyMicrocompact(
  history: Content[],
  verbatimWindowSize: number = INCREMENTAL_PROTECTED_TAIL,
): { newHistory: Content[]; clearedCount: number } {
  if (history.length <= verbatimWindowSize) {
    return { newHistory: history, clearedCount: 0 };
  }

  // Determine the cut index — same logic as applyObservationMask.
  let pairsKept = 0;
  let cutIndex = history.length;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === 'user' && msg.parts?.some((p) => p.functionResponse)) {
      pairsKept++;
      if (pairsKept >= verbatimWindowSize) {
        cutIndex = i;
        break;
      }
    }
  }

  if (cutIndex === 0) {
    return { newHistory: history, clearedCount: 0 };
  }

  let clearedCount = 0;

  const newHistory: Content[] = history.map((msg, idx) => {
    // Only clear results before the cut index
    if (idx >= cutIndex) return msg;
    if (msg.role !== 'user') return msg;
    if (!msg.parts?.some((p) => p.functionResponse)) return msg;

    const newParts = msg.parts.map((part) => {
      if (!part.functionResponse) return part;

      const response = part.functionResponse.response;
      // Already a stub — don't double-clear
      if (
        typeof response === 'object' &&
        response !== null &&
        (response as Record<string, unknown>)['output'] === MICROCOMPACT_STUB
      ) {
        return part;
      }

      clearedCount++;
      return {
        functionResponse: {
          ...part.functionResponse,
          response: { output: MICROCOMPACT_STUB },
        },
      };
    });

    return { ...msg, parts: newParts };
  });

  return { newHistory, clearedCount };
}

/**
 * Estimate the token saving from microcompacting the given history.
 * Returns a fraction [0, 1] — the proportion of tokens that would be saved.
 */
export function estimateMicrocompactSaving(
  history: Content[],
  verbatimWindowSize: number = INCREMENTAL_PROTECTED_TAIL,
): number {
  const original = JSON.stringify(history).length;
  if (original === 0) return 0;

  const { newHistory } = applyMicrocompact(history, verbatimWindowSize);
  const compacted = JSON.stringify(newHistory).length;

  return Math.max(0, (original - compacted) / original);
}
