/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { type Config, type IdeContext } from '@qwen-code/qwen-code-core';
import { useKeypress, type Key } from './useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { StreamingState } from '../types.js';
import { type HistoryItemBtw } from '../types.js';

export const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

interface UseKeyboardHandlingParams {
  buffer: { text: string; setText: (v: string) => void };
  streamingState: StreamingState;
  btwItem: HistoryItemBtw | null;
  cancelBtw: () => void;
  setBtwItem: (item: HistoryItemBtw | null) => void;
  embeddedShellFocused: boolean;
  handleSlashCommand: (cmd: string) => void;
  cancelOngoingRequest: (() => void) | undefined;
  isAuthenticating: boolean;
  openRewindDialog: () => void;
  activePtyId: number | undefined;
  setEmbeddedShellFocused: Dispatch<SetStateAction<boolean>>;
  config: Config;
  ideContextState: IdeContext | undefined;
  handleExit: (
    pressedOnce: boolean,
    setPressedOnce: (v: boolean) => void,
    timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
  ) => void;
  debugKeystrokeLogging: boolean | undefined;
  onBackgroundSession: (() => void) | undefined;
}

interface UseKeyboardHandlingResult {
  showToolDescriptions: boolean;
  setShowToolDescriptions: (v: boolean) => void;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  escapePressedOnce: boolean;
  showEscapePrompt: boolean;
  handleEscapePromptChange: (show: boolean) => void;
  constrainHeight: boolean;
  setConstrainHeight: React.Dispatch<React.SetStateAction<boolean>>;
  dialogsVisibleRef: React.MutableRefObject<boolean>;
}

export function useKeyboardHandling(
  params: UseKeyboardHandlingParams,
): UseKeyboardHandlingResult {
  const {
    buffer,
    streamingState,
    btwItem,
    cancelBtw,
    setBtwItem,
    embeddedShellFocused,
    cancelOngoingRequest,
    isAuthenticating,
    openRewindDialog,
    activePtyId,
    setEmbeddedShellFocused,
    config,
    ideContextState,
    handleExit,
    handleSlashCommand,
    debugKeystrokeLogging,
    onBackgroundSession,
  } = params;

  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);

  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [escapePressedOnce, setEscapePressedOnce] = useState(false);
  const escapeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dialogsVisibleRef = useRef(false);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);

  const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
    setShowEscapePrompt(showPrompt);
  }, []);

  // Keep a ref to the latest version of the handler so the subscription never
  // needs to be torn down and re-created. Eliminates the keypress-loss window
  // that occurred every time any dependency (streamingState, buffer, …) changed.
  const globalKeypressHandlerRef = useRef<(key: Key) => void>(() => {});
  globalKeypressHandlerRef.current = (key: Key) => {
    // Debug log keystrokes if enabled
    if (debugKeystrokeLogging) {
      const debugLogger = config.getDebugLogger();
      debugLogger.debug('[DEBUG] Keystroke:', JSON.stringify(key));
    }

    if (keyMatchers[Command.QUIT](key)) {
      if (isAuthenticating) {
        return;
      }

      // On first press: set flag, start timer, and call handleExit for cleanup
      // On second press (within timeout): handleExit sees flag and does fast quit
      if (!ctrlCPressedOnce) {
        setCtrlCPressedOnce(true);
        ctrlCTimerRef.current = setTimeout(() => {
          setCtrlCPressedOnce(false);
          ctrlCTimerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
      }

      handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
      return;
    } else if (keyMatchers[Command.EXIT](key)) {
      if (buffer.text.length > 0) {
        return;
      }
      handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
      return;
    } else if (keyMatchers[Command.ESCAPE](key)) {
      // Dismiss or cancel btw side-question on Escape,
      // but only when btw is actually visible (not hidden behind a dialog).
      if (btwItem && !dialogsVisibleRef.current) {
        cancelBtw();
        return;
      }

      // Skip if shell is focused (to allow shell's own escape handling)
      if (embeddedShellFocused) {
        return;
      }

      // If input has content, use double-press to clear
      if (buffer.text.length > 0) {
        if (escapePressedOnce) {
          // Second press: clear input, keep the flag to allow immediate cancel
          buffer.setText('');
          return;
        }
        // First press: set flag and show prompt
        setEscapePressedOnce(true);
        escapeTimerRef.current = setTimeout(() => {
          setEscapePressedOnce(false);
          escapeTimerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
        return;
      }

      // Input is empty, cancel request immediately (no double-press needed)
      if (streamingState === StreamingState.Responding) {
        if (escapeTimerRef.current) {
          clearTimeout(escapeTimerRef.current);
          escapeTimerRef.current = null;
        }
        cancelOngoingRequest?.();
        setEscapePressedOnce(false);
        return;
      }

      // Double-ESC with empty input and not streaming: open rewind dialog
      if (escapePressedOnce) {
        if (escapeTimerRef.current) {
          clearTimeout(escapeTimerRef.current);
          escapeTimerRef.current = null;
        }
        setEscapePressedOnce(false);
        openRewindDialog();
        return;
      }

      // First ESC with empty input and not streaming: set flag for double-press
      if (!escapePressedOnce) {
        setEscapePressedOnce(true);
        escapeTimerRef.current = setTimeout(() => {
          setEscapePressedOnce(false);
          escapeTimerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
        return;
      }

      // No action available, reset the flag
      if (escapeTimerRef.current) {
        clearTimeout(escapeTimerRef.current);
        escapeTimerRef.current = null;
      }
      setEscapePressedOnce(false);
      return;
    }

    // Dismiss completed btw side-question on Space or Enter,
    // but only when btw is visible and the input buffer is empty.
    if (
      btwItem &&
      !btwItem.btw.isPending &&
      !dialogsVisibleRef.current &&
      buffer.text.length === 0
    ) {
      if (key.name === 'return' || key.sequence === ' ') {
        setBtwItem(null);
        return;
      }
    }

    let enteringConstrainHeightMode = false;
    if (!constrainHeight) {
      enteringConstrainHeightMode = true;
      setConstrainHeight(true);
    }

    if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
      const newValue = !showToolDescriptions;
      setShowToolDescriptions(newValue);

      const mcpServers = config.getMcpServers();
      if (Object.keys(mcpServers || {}).length > 0) {
        handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
      }
    } else if (
      keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
      config.getIdeMode() &&
      ideContextState
    ) {
      handleSlashCommand('/ide status');
    } else if (
      keyMatchers[Command.SHOW_MORE_LINES](key) &&
      !enteringConstrainHeightMode
    ) {
      setConstrainHeight(false);
    } else if (keyMatchers[Command.TOGGLE_SHELL_INPUT_FOCUS](key)) {
      if (activePtyId || embeddedShellFocused) {
        setEmbeddedShellFocused((prev) => !prev);
      }
    } else if (
      keyMatchers[Command.BACKGROUND_SESSION](key) &&
      onBackgroundSession
    ) {
      onBackgroundSession();
      return;
    }
  };

  // Stable reference — never recreated, so useKeypress never re-subscribes.
  const handleGlobalKeypress = useCallback(
    (key: Key) => globalKeypressHandlerRef.current(key),
    [],
  );

  useKeypress(handleGlobalKeypress, { isActive: true });

  return {
    showToolDescriptions,
    setShowToolDescriptions,
    ctrlCPressedOnce,
    ctrlDPressedOnce,
    escapePressedOnce,
    showEscapePrompt,
    handleEscapePromptChange,
    constrainHeight,
    setConstrainHeight,
    dialogsVisibleRef,
  };
}
