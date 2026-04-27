/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * useRecap — appends a "where we left off" card after long agent turns.
 *
 * Trigger: streamingState transitions from non-Idle to Idle, AND either
 *   - turn wall-clock duration > recap.thresholdSeconds, OR
 *   - tool calls during the turn > recap.thresholdToolCalls
 *
 * Settings: recap.enabled (default true), recap.thresholdSeconds (300),
 * recap.thresholdToolCalls (15). All in user settings.
 */

import { useEffect, useRef } from 'react';
import type { Config, GeminiClient } from '@qwen-code/qwen-code-core';
import { generateRecap } from '@qwen-code/qwen-code-core';
import type { HistoryItem, HistoryItemWithoutId } from '../types.js';
import { MessageType, StreamingState } from '../types.js';

export interface UseRecapOptions {
  config: Config | null;
  geminiClient: GeminiClient | null;
  streamingState: StreamingState;
  history: HistoryItem[];
  addItem: (item: HistoryItemWithoutId, baseTimestamp: number) => void;
  enabled: boolean;
  thresholdSeconds: number;
  thresholdToolCalls: number;
}

interface TurnState {
  startTime: number;
  historyLengthAtStart: number;
}

function countToolGroupsSince(
  history: HistoryItem[],
  startIndex: number,
): number {
  let count = 0;
  for (let i = startIndex; i < history.length; i++) {
    if (history[i]?.type === 'tool_group') count++;
  }
  return count;
}

function hasRecapSinceLastUserTurn(history: HistoryItem[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (!item) continue;
    if (item.type === MessageType.USER) return false;
    if (item.type === 'recap') return true;
  }
  return false;
}

export function useRecap(opts: UseRecapOptions): void {
  const {
    config,
    geminiClient,
    streamingState,
    history,
    addItem,
    enabled,
    thresholdSeconds,
    thresholdToolCalls,
  } = opts;

  const turnRef = useRef<TurnState | null>(null);
  const prevStateRef = useRef<StreamingState>(streamingState);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = streamingState;

    // Edge: Idle → non-Idle (turn started)
    if (
      prev === StreamingState.Idle &&
      streamingState !== StreamingState.Idle
    ) {
      turnRef.current = {
        startTime: Date.now(),
        historyLengthAtStart: history.length,
      };
      return;
    }

    // Edge: non-Idle → Idle (turn ended)
    if (
      prev !== StreamingState.Idle &&
      streamingState === StreamingState.Idle
    ) {
      const turn = turnRef.current;
      turnRef.current = null;

      if (!enabled || !config || !geminiClient || !turn) return;

      const durationSec = (Date.now() - turn.startTime) / 1000;
      const toolCount = countToolGroupsSince(
        history,
        turn.historyLengthAtStart,
      );
      const longEnough =
        durationSec > thresholdSeconds || toolCount > thresholdToolCalls;
      if (!longEnough) return;

      // Skip if the agent has already produced a recap for this turn.
      if (hasRecapSinceLastUserTurn(history)) return;

      // Skip if there's no actual LLM conversation to summarize. Slash
      // commands like /commit or /init flip streamingState through tools
      // without ever calling the model — `geminiClient.getHistory()`
      // returns empty in that case, and a recap built from an empty
      // history makes the model hallucinate ("I don't have access to
      // any previous conversation"). We require at least one prior
      // model-role turn AND at least one prior user-role turn so the
      // recap has something concrete to lead with.
      const conversation = geminiClient.getHistory?.() ?? [];
      const hasModelHistory = conversation.some((c) => c.role === 'model');
      const hasUserHistory = conversation.some((c) => c.role === 'user');
      if (!hasModelHistory || !hasUserHistory) return;

      // Cancel any in-flight prior generation; only one recap per turn.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void generateRecap(config, conversation, controller.signal).then(
        (text) => {
          if (controller.signal.aborted || !text) return;
          addItem({ type: MessageType.RECAP, text }, Date.now());
        },
      );
    }
  }, [
    streamingState,
    history,
    enabled,
    thresholdSeconds,
    thresholdToolCalls,
    config,
    geminiClient,
    addItem,
  ]);

  // Abort any in-flight generation on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );
}
