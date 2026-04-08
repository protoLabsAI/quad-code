/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { checkpointStore } from '@qwen-code/qwen-code-core';
import type { Checkpoint } from '@qwen-code/qwen-code-core';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { formatRelativeTime } from '../utils/formatters.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RewindPickerProps {
  /** Called when the user chooses "Restore files + conversation" */
  onRestoreFilesAndConversation: (promptId: string) => void;
  /** Called when the user chooses "Restore conversation only" */
  onRestoreConversationOnly: (promptId: string) => void;
  /** Called when the user chooses "Restore files only" */
  onRestoreFilesOnly: (promptId: string) => void;
  /** Called when the user chooses "Summarize from here" */
  onSummarizeFromHere: (promptId: string) => void;
  /** Called when the user cancels (Esc or "Cancel" action) */
  onCancel: () => void;
}

/** Phase of the 2-step picker flow */
type Phase = 'pick' | 'action';

// ─── Action menu items ────────────────────────────────────────────────────────

type ActionKey =
  | 'files_and_conversation'
  | 'conversation_only'
  | 'files_only'
  | 'summarize_from_here'
  | 'cancel';

interface ActionItem {
  label: string;
  key: ActionKey;
}

function buildActionItems(hasFileSnapshots: boolean): ActionItem[] {
  const items: ActionItem[] = [];
  if (hasFileSnapshots) {
    items.push({
      label: 'Restore files + conversation',
      key: 'files_and_conversation',
    });
  }
  items.push({ label: 'Restore conversation only', key: 'conversation_only' });
  if (hasFileSnapshots) {
    items.push({ label: 'Restore files only', key: 'files_only' });
  }
  items.push({ label: 'Summarize from here', key: 'summarize_from_here' });
  items.push({ label: 'Cancel', key: 'cancel' });
  return items;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ─── RewindPicker ─────────────────────────────────────────────────────────────

/**
 * Two-step interactive picker for the /rewind command.
 *
 * Step 1 — Checkpoint list: shows all recorded checkpoints in reverse
 * chronological order (most-recent first) with prompt preview and timestamp.
 *
 * Step 2 — Action submenu: after selecting a checkpoint, presents four options:
 *   1. Restore files + conversation
 *   2. Restore conversation only
 *   3. Restore files only
 *   4. Cancel
 *
 * Esc dismisses the picker at any point.
 */
export function RewindPicker({
  onRestoreFilesAndConversation,
  onRestoreConversationOnly,
  onRestoreFilesOnly,
  onSummarizeFromHere,
  onCancel,
}: RewindPickerProps) {
  const { columns: width, rows: height } = useTerminalSize();

  // Main-thread checkpoints only, in reverse chronological order (most-recent first).
  // Subagent checkpoints (internal turns, empty prompts) are excluded.
  const checkpoints: Checkpoint[] = useMemo(
    () => checkpointStore.listMainThread().slice().reverse(),
    [],
  );

  const [phase, setPhase] = useState<Phase>('pick');
  const [selectedCheckpointIdx, setSelectedCheckpointIdx] = useState(0);
  const [selectedActionIdx, setSelectedActionIdx] = useState(0);

  // Derive action items based on whether the selected checkpoint has file snapshots.
  const actionItems = useMemo(() => {
    const cp = checkpoints[selectedCheckpointIdx];
    const hasFileSnapshots = (cp?.fileSnapshots.size ?? 0) > 0;
    return buildActionItems(hasFileSnapshots);
  }, [checkpoints, selectedCheckpointIdx]);

  const boxWidth = width - 4;

  // ─── Scroll logic for the checkpoint list ──────────────────────────────────

  const reservedLines = 8; // title(1) + sep(1) + footer(1) + sep(1) + borders(2) + padding(2)
  const maxVisibleItems = Math.max(1, height - reservedLines);

  const scrollOffset = useMemo(() => {
    if (checkpoints.length <= maxVisibleItems) return 0;
    const half = Math.floor(maxVisibleItems / 2);
    const maxOffset = checkpoints.length - maxVisibleItems;
    return Math.min(Math.max(0, selectedCheckpointIdx - half), maxOffset);
  }, [selectedCheckpointIdx, maxVisibleItems, checkpoints.length]);

  const visibleCheckpoints = checkpoints.slice(
    scrollOffset,
    scrollOffset + maxVisibleItems,
  );

  // ─── Key handlers ──────────────────────────────────────────────────────────

  const handleKeyInPickPhase = useCallback(
    (key: { name?: string }) => {
      if (key.name === 'escape') {
        onCancel();
        return;
      }
      if (key.name === 'return') {
        if (checkpoints.length === 0) {
          onCancel();
          return;
        }
        // Advance to action submenu
        setPhase('action');
        setSelectedActionIdx(0);
        return;
      }
      if (key.name === 'up') {
        setSelectedCheckpointIdx((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === 'down') {
        setSelectedCheckpointIdx((prev) =>
          Math.min(checkpoints.length - 1, prev + 1),
        );
        return;
      }
    },
    [onCancel, checkpoints.length],
  );

  const handleKeyInActionPhase = useCallback(
    (key: { name?: string }) => {
      if (key.name === 'escape') {
        // Esc dismisses the picker entirely from any phase
        onCancel();
        return;
      }
      if (key.name === 'return') {
        const selectedCheckpoint = checkpoints[selectedCheckpointIdx];
        if (!selectedCheckpoint) {
          onCancel();
          return;
        }
        const action = actionItems[selectedActionIdx];
        if (!action) {
          onCancel();
          return;
        }
        const actionKey: ActionKey = action.key;
        switch (actionKey) {
          case 'files_and_conversation':
            onRestoreFilesAndConversation(selectedCheckpoint.promptId);
            break;
          case 'conversation_only':
            onRestoreConversationOnly(selectedCheckpoint.promptId);
            break;
          case 'files_only':
            onRestoreFilesOnly(selectedCheckpoint.promptId);
            break;
          case 'summarize_from_here':
            onSummarizeFromHere(selectedCheckpoint.promptId);
            break;
          case 'cancel':
            onCancel();
            break;
          default:
            break;
        }
        return;
      }
      if (key.name === 'up') {
        setSelectedActionIdx((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === 'down') {
        setSelectedActionIdx((prev) =>
          Math.min(actionItems.length - 1, prev + 1),
        );
        return;
      }
    },
    [
      onCancel,
      onRestoreFilesAndConversation,
      onRestoreConversationOnly,
      onRestoreFilesOnly,
      onSummarizeFromHere,
      checkpoints,
      selectedCheckpointIdx,
      selectedActionIdx,
      actionItems,
    ],
  );

  useKeypress(
    phase === 'pick' ? handleKeyInPickPhase : handleKeyInActionPhase,
    { isActive: true },
  );

  // ─── Render helpers ────────────────────────────────────────────────────────

  const maxTextWidth = Math.max(10, boxWidth - 30);

  // ─── Step 1: Checkpoint picker ─────────────────────────────────────────────

  if (phase === 'pick') {
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
              Rewind — Select a checkpoint
            </Text>
          </Box>

          {/* Separator */}
          <Box>
            <Text color={theme.border.default}>{'─'.repeat(boxWidth - 2)}</Text>
          </Box>

          {/* Checkpoint list */}
          <Box
            flexDirection="column"
            flexGrow={1}
            paddingX={1}
            overflow="hidden"
          >
            {checkpoints.length === 0 ? (
              <Box paddingY={1} justifyContent="center">
                <Text color={theme.text.secondary}>
                  No checkpoints recorded yet.
                </Text>
              </Box>
            ) : (
              visibleCheckpoints.map((cp, visibleIdx) => {
                const actualIndex = scrollOffset + visibleIdx;
                const isSelected = actualIndex === selectedCheckpointIdx;
                const prefix = isSelected ? '› ' : '  ';
                const timeLabel = formatRelativeTime(cp.timestamp);
                const preview = truncate(cp.userPrompt, maxTextWidth);

                return (
                  <Box key={cp.promptId} flexDirection="row">
                    <Text
                      color={isSelected ? theme.text.accent : undefined}
                      bold={isSelected}
                    >
                      {prefix}
                    </Text>
                    <Text
                      color={
                        isSelected ? theme.text.accent : theme.text.primary
                      }
                      bold={isSelected}
                    >
                      {preview}
                    </Text>
                    <Text color={theme.text.secondary}>{' · '}</Text>
                    <Text color={theme.text.secondary}>{timeLabel}</Text>
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
          <Box paddingX={1}>
            <Text color={theme.text.secondary}>
              ↑↓ navigate · Enter select · Esc cancel
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // ─── Step 2: Action submenu ────────────────────────────────────────────────

  const selectedCheckpoint = checkpoints[selectedCheckpointIdx];
  const previewText = selectedCheckpoint
    ? truncate(selectedCheckpoint.userPrompt, maxTextWidth)
    : '';

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
        <Box paddingX={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Rewind — Choose action
          </Text>
          <Text color={theme.text.secondary}>
            {'  '}
            {previewText}
          </Text>
        </Box>

        {/* Separator */}
        <Box>
          <Text color={theme.border.default}>{'─'.repeat(boxWidth - 2)}</Text>
        </Box>

        {/* Action list */}
        <Box flexDirection="column" paddingX={1} overflow="hidden">
          {actionItems.map((item, idx) => {
            const isSelected = idx === selectedActionIdx;
            const prefix = isSelected ? '› ' : '  ';
            return (
              <Box key={item.key} flexDirection="row">
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
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Separator */}
        <Box>
          <Text color={theme.border.default}>{'─'.repeat(boxWidth - 2)}</Text>
        </Box>

        {/* Footer */}
        <Box paddingX={1}>
          <Text color={theme.text.secondary}>
            ↑↓ navigate · Enter confirm · Esc cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
