/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import type { HistoryItem } from '../types.js';
import { ToolNames } from '@qwen-code/qwen-code-core';

export interface RewindDialogProps {
  history: HistoryItem[];
  onConfirm: (index: number) => void;
  onCancel: () => void;
}

/**
 * Extract user turns from the full history, preserving their original indices.
 * Also detects whether each turn triggered bash (shell) tool calls, which
 * cannot be undone by rewind.
 */
function extractUserTurns(
  history: HistoryItem[],
): Array<{
  historyIndex: number;
  text: string;
  turnNumber: number;
  hasBashCalls: boolean;
}> {
  const turns: Array<{
    historyIndex: number;
    text: string;
    turnNumber: number;
    hasBashCalls: boolean;
  }> = [];
  let turnNumber = 0;
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (item.type === 'user') {
      turnNumber++;
      // Look ahead for bash/shell tool calls until the next user message
      let hasBashCalls = false;
      for (let j = i + 1; j < history.length; j++) {
        const nextItem = history[j];
        if (nextItem.type === 'user') break;
        if (
          nextItem.type === 'tool_group' &&
          nextItem.tools.some((tool) => tool.name === ToolNames.SHELL)
        ) {
          hasBashCalls = true;
          break;
        }
      }
      turns.push({ historyIndex: i, text: item.text ?? '', turnNumber, hasBashCalls });
    }
  }
  return turns;
}

export function RewindDialog({
  history,
  onConfirm,
  onCancel,
}: RewindDialogProps) {
  const { columns: width, rows: height } = useTerminalSize();

  const userTurns = useMemo(() => extractUserTurns(history), [history]);

  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, userTurns.length - 1),
  );

  const boxWidth = width - 4;
  // Reserve space: title (1) + sep (1) + footer (1) + sep (1) + borders (2) + padding (2)
  const reservedLines = 8;
  const maxVisibleItems = Math.max(1, height - reservedLines);

  // Scroll offset to keep selected item visible
  const scrollOffset = useMemo(() => {
    if (userTurns.length <= maxVisibleItems) return 0;
    const half = Math.floor(maxVisibleItems / 2);
    const maxOffset = userTurns.length - maxVisibleItems;
    return Math.min(Math.max(0, selectedIndex - half), maxOffset);
  }, [selectedIndex, maxVisibleItems, userTurns.length]);

  const visibleTurns = userTurns.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems,
  );

  const handleKey = useCallback(
    (key: { name?: string; escape?: boolean; return?: boolean }) => {
      if (key.name === 'escape') {
        onCancel();
        return;
      }
      if (key.name === 'return') {
        if (userTurns.length === 0) {
          onCancel();
          return;
        }
        const selected = userTurns[selectedIndex];
        if (selected) {
          onConfirm(selected.historyIndex);
        }
        return;
      }
      if (key.name === 'up') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === 'down') {
        setSelectedIndex((prev) => Math.min(userTurns.length - 1, prev + 1));
        return;
      }
    },
    [onCancel, onConfirm, selectedIndex, userTurns],
  );

  useKeypress(handleKey, { isActive: true });

  // Max width for the message text: box - borders(2) - padding(2) - prefix(2) - turn label
  const maxTextWidth = Math.max(10, boxWidth - 20);

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '…';
  }

  return (
    <Box flexDirection="column" width={boxWidth} overflow="hidden">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        width={boxWidth}
        overflow="hidden"
      >
        {/* Header */}
        <Box paddingX={1}>
          <Text bold color={theme.text.primary}>
            Rewind Conversation
          </Text>
        </Box>

        {/* Separator */}
        <Box>
          <Text color={theme.border.default}>{'─'.repeat(boxWidth - 2)}</Text>
        </Box>

        {/* Turn list */}
        <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
          {userTurns.length === 0 ? (
            <Box paddingY={1} justifyContent="center">
              <Text color={theme.text.secondary}>
                No conversation turns to rewind to.
              </Text>
            </Box>
          ) : (
            visibleTurns.map((turn, visibleIdx) => {
              const actualIndex = scrollOffset + visibleIdx;
              const isSelected = actualIndex === selectedIndex;
              const prefix = isSelected ? '› ' : '  ';
              const totalTurns = userTurns.length;
              const label = `Turn ${turn.turnNumber} of ${totalTurns}`;
              const truncated = truncate(turn.text, maxTextWidth);

              return (
                <Box key={turn.historyIndex} flexDirection="row">
                  <Text
                    color={isSelected ? theme.text.accent : undefined}
                    bold={isSelected}
                  >
                    {prefix}
                  </Text>
                  <Text
                    color={isSelected ? theme.text.accent : theme.text.primary}
                    bold={isSelected}
                  >
                    {truncated}
                  </Text>
                  {turn.hasBashCalls && (
                    <Text color={theme.status.warning}> ⚠ bash</Text>
                  )}
                  <Text color={theme.text.secondary}>{' · '}</Text>
                  <Text color={theme.text.secondary}>{label}</Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Separator */}
        <Box>
          <Text color={theme.border.default}>{'─'.repeat(boxWidth - 2)}</Text>
        </Box>

        {/* Footer */}
        <Box paddingX={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            ↑↓ to navigate · Enter to rewind here · Esc to cancel
          </Text>
          <Text color={theme.status.warning}>
            ⚠ bash: shell changes cannot be rewound
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
