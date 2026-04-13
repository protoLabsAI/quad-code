/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static } from 'ink';
import { useMemo } from 'react';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { TruncatedHistoryBanner } from './TruncatedHistoryBanner.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { Notifications } from './Notifications.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { DebugModeNotification } from './DebugModeNotification.js';

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
const MAX_GEMINI_MESSAGE_LINES = 65536;

/**
 * Maximum number of history items to keep in the Static render window.
 * Items before this window have already been printed to the terminal and
 * do not need to be held in the React tree. Ink's Static identifies
 * already-printed items by React key, so the slice does not cause
 * re-printing — only genuinely new items at the tail are emitted.
 *
 * On historyRemountKey change (terminal clear + view switch), only the
 * windowed items are reprinted instead of the full unbounded history.
 */
const STATIC_HISTORY_WINDOW = 200;

export const MainContent = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const {
    pendingHistoryItems,
    terminalWidth,
    mainAreaWidth,
    staticAreaMaxItemHeight,
    availableTerminalHeight,
  } = uiState;

  const staticItems = useMemo(() => {
    const history = uiState.history;
    const truncatedCount = Math.max(0, history.length - STATIC_HISTORY_WINDOW);
    const visibleHistory =
      truncatedCount > 0 ? history.slice(-STATIC_HISTORY_WINDOW) : history;

    return [
      <AppHeader key="app-header" version={version} />,
      <DebugModeNotification key="debug-notification" />,
      <Notifications key="notifications" />,
      ...(truncatedCount > 0
        ? [
            <TruncatedHistoryBanner
              key="truncated-banner"
              count={truncatedCount}
            />,
          ]
        : []),
      ...visibleHistory.map((h) => (
        <HistoryItemDisplay
          terminalWidth={terminalWidth}
          mainAreaWidth={mainAreaWidth}
          availableTerminalHeight={staticAreaMaxItemHeight}
          availableTerminalHeightGemini={MAX_GEMINI_MESSAGE_LINES}
          key={h.id}
          item={h}
          isPending={false}
          commands={uiState.slashCommands}
        />
      )),
    ];
  }, [
    uiState.history,
    uiState.slashCommands,
    version,
    terminalWidth,
    mainAreaWidth,
    staticAreaMaxItemHeight,
  ]);

  return (
    <>
      <Static key={`${uiState.historyRemountKey}`} items={staticItems}>
        {(item) => item}
      </Static>
      <OverflowProvider>
        <Box flexDirection="column">
          {pendingHistoryItems.map((item, i) => (
            <HistoryItemDisplay
              key={i}
              availableTerminalHeight={
                uiState.constrainHeight ? availableTerminalHeight : undefined
              }
              terminalWidth={terminalWidth}
              mainAreaWidth={mainAreaWidth}
              item={{ ...item, id: 0 }}
              isPending={true}
              isFocused={!uiState.isEditorDialogOpen}
              activeShellPtyId={uiState.activePtyId}
              embeddedShellFocused={uiState.embeddedShellFocused}
            />
          ))}
          <ShowMoreLines constrainHeight={uiState.constrainHeight} />
        </Box>
      </OverflowProvider>
    </>
  );
};
