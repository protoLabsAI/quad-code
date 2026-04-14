/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import { type DOMElement, measureElement } from 'ink';
import { App } from './App.js';
import { AppContext } from './contexts/AppContext.js';
import { UIStateContext, type UIState } from './contexts/UIStateContext.js';
import {
  UIActionsContext,
  type UIActions,
} from './contexts/UIActionsContext.js';
import { ConfigContext } from './contexts/ConfigContext.js';
import {
  type HistoryItem,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from './types.js';
import { MessageType, StreamingState } from './types.js';
import {
  type EditorType,
  type Config,
  type IdeInfo,
  type IdeContext,
  IdeClient,
  ideContextStore,
  createDebugLogger,
  getErrorMessage,
  getAllGeminiMdFilenames,
  ShellExecutionService,
  Storage,
  acceptSpeculation,
  abortSpeculation,
  logSpeculation,
  SpeculationEvent,
  IDLE_SPECULATION,
} from '@qwen-code/qwen-code-core';
import { validateAuthMethod } from '../config/auth.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import process from 'node:process';
import { useHistory } from './hooks/useHistoryManager.js';
import { useMemoryMonitor } from './hooks/useMemoryMonitor.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useFeedbackDialog } from './hooks/useFeedbackDialog.js';
import { useAuthCommand } from './auth/useAuth.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useArenaCommand } from './hooks/useArenaCommand.js';
import { useApprovalModeCommand } from './hooks/useApprovalModeCommand.js';
import { useResumeCommand } from './hooks/useResumeCommand.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useVimMode } from './contexts/VimModeContext.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { calculatePromptWidths } from './components/InputPrompt.js';
import { useStdin, useStdout } from 'ink';
import ansiEscapes from 'ansi-escapes';
import * as fs from 'node:fs';
import { clearScreen } from '../utils/stdioHelpers.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useLogger } from './hooks/useLogger.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useVim } from './hooks/vim.js';
import { isBtwCommand } from './utils/commandUtils.js';
import { type LoadedSettings, SettingScope } from '../config/settings.js';
import { type InitializationResult } from '../core/initializer.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useKeyboardHandling } from './hooks/useKeyboardHandling.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useIdeTrustListener } from './hooks/useIdeTrustListener.js';
import { type IdeIntegrationNudgeResult } from './IdeIntegrationNudge.js';
import { type CommandMigrationNudgeResult } from './CommandFormatMigrationNudge.js';
import { useCommandMigration } from './hooks/useCommandMigration.js';
import { useIdleMessageDrain } from './hooks/useIdleMessageDrain.js';
import { useWindowTitle } from './hooks/useWindowTitle.js';
import { useInitializationEffects } from './hooks/useInitializationEffects.js';
import { usePromptSuggestions } from './hooks/usePromptSuggestions.js';
import { useExitHandling } from './hooks/useExitHandling.js';
import { migrateTomlCommands } from '../services/command-migration-tool.js';
import { type UpdateObject } from './utils/updateCheck.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import { runExitCleanup } from '../utils/cleanup.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useBackgroundAgentProgress } from './hooks/useBackgroundAgentProgress.js';
import { useSessionStats } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import {
  useExtensionUpdates,
  useConfirmUpdateRequests,
  useSettingInputRequests,
  usePluginChoiceRequests,
} from './hooks/useExtensionUpdates.js';
import { useCodingPlanUpdates } from './hooks/useCodingPlanUpdates.js';
import { ShellFocusContext } from './contexts/ShellFocusContext.js';
import { useAgentViewState } from './contexts/AgentViewContext.js';
import { t } from '../i18n/index.js';
import { useWelcomeBack } from './hooks/useWelcomeBack.js';
import { useDialogClose } from './hooks/useDialogClose.js';
import { useInitializationAuthError } from './hooks/useInitializationAuthError.js';
import { useSubagentCreateDialog } from './hooks/useSubagentCreateDialog.js';
import { useAgentsManagerDialog } from './hooks/useAgentsManagerDialog.js';
import { useExtensionsManagerDialog } from './hooks/useExtensionsManagerDialog.js';
import { useMcpDialog } from './hooks/useMcpDialog.js';
import { useHooksDialog } from './hooks/useHooksDialog.js';
import { useAttentionNotifications } from './hooks/useAttentionNotifications.js';
import {
  requestConsentInteractive,
  requestConsentOrFail,
} from '../commands/extensions/consent.js';
import { useVoice } from './hooks/useVoice.js';
import { DEFAULT_STT_ENDPOINT } from './commands/voiceCommand.js';

const debugLogger = createDebugLogger('APP_CONTAINER');

function isToolExecuting(pendingHistoryItems: HistoryItemWithoutId[]) {
  return pendingHistoryItems.some((item) => {
    if (item && item.type === 'tool_group') {
      return item.tools.some(
        (tool) => ToolCallStatus.Executing === tool.status,
      );
    }
    return false;
  });
}

interface AppContainerProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  initializationResult: InitializationResult;
}

/**
 * The fraction of the terminal width to allocate to the shell.
 * This provides horizontal padding.
 */
const SHELL_WIDTH_FRACTION = 0.89;

/**
 * The number of lines to subtract from the available terminal height
 * for the shell. This provides vertical padding and space for other UI elements.
 */
const SHELL_HEIGHT_PADDING = 10;

export const AppContainer = (props: AppContainerProps) => {
  const { settings, config, initializationResult } = props;
  const historyManager = useHistory();
  useMemoryMonitor(historyManager);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const [themeError, setThemeError] = useState<string | null>(
    initializationResult.themeError,
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [embeddedShellFocused, setEmbeddedShellFocused] = useState(false);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(
    initializationResult.geminiMdFileCount,
  );
  const [shellModeActive, setShellModeActive] = useState(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [historyRemountKey, setHistoryRemountKey] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
  const [isTrustedFolder, setIsTrustedFolder] = useState<boolean | undefined>(
    config.isTrustedFolder(),
  );

  const extensionManager = config.getExtensionManager();

  const { addConfirmUpdateExtensionRequest, confirmUpdateExtensionRequests } =
    useConfirmUpdateRequests();

  const { addSettingInputRequest, settingInputRequests } =
    useSettingInputRequests();

  const { addPluginChoiceRequest, pluginChoiceRequests } =
    usePluginChoiceRequests();

  extensionManager.setRequestConsent(
    requestConsentOrFail.bind(null, (description) =>
      requestConsentInteractive(description, addConfirmUpdateExtensionRequest),
    ),
  );

  extensionManager.setRequestChoicePlugin(
    (marketplace) =>
      new Promise<string>((resolve, reject) => {
        addPluginChoiceRequest({
          marketplaceName: marketplace.name,
          plugins: marketplace.plugins.map((p) => ({
            name: p.name,
            description: p.description,
          })),
          onSelect: (pluginName) => {
            resolve(pluginName);
          },
          onCancel: () => {
            reject(new Error('Plugin selection cancelled'));
          },
        });
      }),
  );

  extensionManager.setRequestSetting(
    (setting) =>
      new Promise<string>((resolve, reject) => {
        addSettingInputRequest({
          settingName: setting.name,
          settingDescription: setting.description,
          sensitive: setting.sensitive ?? false,
          onSubmit: (value) => {
            resolve(value);
          },
          onCancel: () => {
            reject(new Error('Setting input cancelled'));
          },
        });
      }),
  );

  const {
    extensionsUpdateState,
    extensionsUpdateStateInternal,
    dispatchExtensionStateUpdate,
  } = useExtensionUpdates(
    extensionManager,
    historyManager.addItem,
    config.getWorkingDir(),
  );

  const { codingPlanUpdateRequest, dismissCodingPlanUpdate } =
    useCodingPlanUpdates(settings, config, historyManager.addItem);

  const [isTrustDialogOpen, setTrustDialogOpen] = useState(false);
  const openTrustDialog = useCallback(() => setTrustDialogOpen(true), []);
  const closeTrustDialog = useCallback(() => setTrustDialogOpen(false), []);

  const [isPermissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const openPermissionsDialog = useCallback(
    () => setPermissionsDialogOpen(true),
    [],
  );
  const closePermissionsDialog = useCallback(
    () => setPermissionsDialogOpen(false),
    [],
  );

  // Helper to determine the current model (polled, since Config has no model-change event).
  const getCurrentModel = useCallback(() => config.getModel(), [config]);

  const [currentModel, setCurrentModel] = useState(getCurrentModel());

  const [isConfigInitialized, setConfigInitialized] = useState(false);

  const [userMessages, setUserMessages] = useState<string[]>([]);

  // Terminal and layout hooks
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();

  // Additional hooks moved from App.tsx
  const { stats: sessionStats, startNewSession } = useSessionStats();
  const logger = useLogger(config.storage, sessionStats.sessionId);
  const branchName = useGitBranchName(config.getTargetDir());

  // Layout measurements
  const mainControlsRef = useRef<DOMElement>(null);
  const staticExtraHeight = 3;

  // Initialize config (runs once on mount)
  useInitializationEffects(config, historyManager, setConfigInitialized);

  useEffect(
    () => setUpdateHandler(historyManager.addItem, setUpdateInfo),
    [historyManager.addItem],
  );

  // Surface background agent completions and limit-hit warnings in the
  // conversation history so the user and model can see them.
  const { lastFinished } = useBackgroundAgentProgress();
  useEffect(() => {
    if (!lastFinished) return;
    if (lastFinished.hitLimit) {
      historyManager.addItem(
        {
          type: MessageType.WARNING,
          text: `Background agent "${lastFinished.agentName}" hit its ${lastFinished.terminateReason === 'timeout' ? 'time' : 'turn'} limit after ${lastFinished.rounds} round(s) — notes may be partially updated.`,
        },
        Date.now(),
      );
    }
  }, [lastFinished, historyManager]);

  // Watch for model changes (e.g., user switches model via /model).
  // Skip the initial check to avoid a re-render during Ink's first render pass.
  useEffect(() => {
    const interval = setInterval(() => {
      const model = getCurrentModel();
      if (model !== currentModel) {
        setCurrentModel(model);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [config, currentModel, getCurrentModel]);

  // Derive widths for InputPrompt using shared helper
  const { inputWidth, suggestionsWidth } = useMemo(() => {
    const { inputWidth, suggestionsWidth } =
      calculatePromptWidths(terminalWidth);
    return { inputWidth, suggestionsWidth };
  }, [terminalWidth]);
  // Uniform width for bordered box components: accounts for margins and caps at 100
  const mainAreaWidth = Math.min(terminalWidth - 4, 100);
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);

  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || [];
      const currentSessionUserMessages = historyManager.history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse();
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]);
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [historyManager.history, logger]);

  const refreshStatic = useCallback(() => {
    // Wrap in synchronized update to prevent flicker during clear + redraw
    stdout.write('\x1b[?2026h');
    stdout.write(ansiEscapes.clearTerminal);
    stdout.write('\x1b[?2026l');
    setHistoryRemountKey((prev) => prev + 1);
  }, [setHistoryRemountKey, stdout]);

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(
    settings,
    setThemeError,
    historyManager.addItem,
    initializationResult.themeError,
  );

  const {
    isApprovalModeDialogOpen,
    openApprovalModeDialog,
    handleApprovalModeSelect,
  } = useApprovalModeCommand(settings, config);

  const {
    setAuthState,
    authError,
    onAuthError,
    isAuthDialogOpen,
    isAuthenticating,
    pendingAuthType,
    handleAuthSelect,
    handleCodingPlanSubmit,
    handleAlibabaStandardSubmit,
    openAuthDialog,
    cancelAuthentication,
  } = useAuthCommand(settings, config, historyManager.addItem, refreshStatic);

  useInitializationAuthError(initializationResult.authError, onAuthError);

  // Sync user tier from config when authentication changes
  // TODO: Implement getUserTier() method on Config if needed
  // useEffect(() => {
  //   if (authState === AuthState.Authenticated) {
  //     setUserTier(config.getUserTier());
  //   }
  // }, [config, authState]);

  // Check for enforced auth type mismatch
  useEffect(() => {
    // Check for initialization error first
    const currentAuthType = config.getModelsConfig().getCurrentAuthType();

    if (
      settings.merged.security?.auth?.enforcedType &&
      currentAuthType &&
      settings.merged.security?.auth.enforcedType !== currentAuthType
    ) {
      onAuthError(
        t(
          'Authentication is enforced to be {{enforcedType}}, but you are currently using {{currentType}}.',
          {
            enforcedType: String(settings.merged.security?.auth.enforcedType),
            currentType: String(currentAuthType),
          },
        ),
      );
    } else if (!settings.merged.security?.auth?.useExternal) {
      // If no authType is selected yet, allow the auth UI flow to prompt the user.
      // Only validate credentials once a concrete authType exists.
      if (currentAuthType) {
        const error = validateAuthMethod(currentAuthType, config);
        if (error) {
          onAuthError(error);
        }
      }
    }
  }, [
    settings.merged.security?.auth?.enforcedType,
    settings.merged.security?.auth?.useExternal,
    config,
    onAuthError,
  ]);

  const [editorError, setEditorError] = useState<string | null>(null);
  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, historyManager.addItem);

  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

  const {
    isModelDialogOpen,
    isFastModelMode,
    openModelDialog,
    closeModelDialog,
  } = useModelCommand();
  const { activeArenaDialog, openArenaDialog, closeArenaDialog } =
    useArenaCommand();

  const {
    isResumeDialogOpen,
    openResumeDialog,
    closeResumeDialog,
    handleResume,
  } = useResumeCommand({
    config,
    historyManager,
    startNewSession,
    remount: refreshStatic,
  });

  const { toggleVimEnabled } = useVimMode();

  const {
    isSubagentCreateDialogOpen,
    openSubagentCreateDialog,
    closeSubagentCreateDialog,
  } = useSubagentCreateDialog();
  const {
    isAgentsManagerDialogOpen,
    openAgentsManagerDialog,
    closeAgentsManagerDialog,
  } = useAgentsManagerDialog();
  const {
    isExtensionsManagerDialogOpen,
    openExtensionsManagerDialog,
    closeExtensionsManagerDialog,
  } = useExtensionsManagerDialog();
  const { isMcpDialogOpen, openMcpDialog, closeMcpDialog } = useMcpDialog();
  const { isHooksDialogOpen, openHooksDialog, closeHooksDialog } =
    useHooksDialog();

  const [isRewindDialogOpen, setIsRewindDialogOpen] = useState(false);
  const openRewindDialog = useCallback(() => setIsRewindDialogOpen(true), []);
  const closeRewindDialog = useCallback(() => setIsRewindDialogOpen(false), []);

  const slashCommandActions = useMemo(
    () => ({
      openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openSettingsDialog,
      openModelDialog,
      openTrustDialog,
      openArenaDialog,
      openPermissionsDialog,
      openApprovalModeDialog,
      quit: (messages: HistoryItem[]) => {
        setQuittingMessages(messages);
        setTimeout(async () => {
          await runExitCleanup();
          process.exit(0);
        }, 100);
      },
      setDebugMessage,
      dispatchExtensionStateUpdate,
      addConfirmUpdateExtensionRequest,
      openSubagentCreateDialog,
      openAgentsManagerDialog,
      openExtensionsManagerDialog,
      openMcpDialog,
      openHooksDialog,
      openResumeDialog,
      openRewindDialog,
    }),
    [
      openAuthDialog,
      openThemeDialog,
      openEditorDialog,
      openSettingsDialog,
      openModelDialog,
      openArenaDialog,
      setDebugMessage,
      dispatchExtensionStateUpdate,
      openTrustDialog,
      openPermissionsDialog,
      openApprovalModeDialog,
      addConfirmUpdateExtensionRequest,
      openSubagentCreateDialog,
      openAgentsManagerDialog,
      openExtensionsManagerDialog,
      openMcpDialog,
      openHooksDialog,
      openResumeDialog,
      openRewindDialog,
    ],
  );

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    btwItem,
    setBtwItem,
    cancelBtw,
    commandContext,
    shellConfirmationRequest,
    confirmationRequest,
  } = useSlashCommandProcessor(
    config,
    settings,
    historyManager.addItem,
    historyManager.clearItems,
    historyManager.loadHistory,
    historyManager.history,
    refreshStatic,
    toggleVimEnabled,
    isProcessing,
    setIsProcessing,
    setGeminiMdFileCount,
    slashCommandActions,
    extensionsUpdateStateInternal,
    isConfigInitialized,
    logger,
  );

  // onDebugMessage should log to debug logfile, not update footer debugMessage
  const onDebugMessage = useCallback(
    (message: string) => {
      config.getDebugLogger().debug(message);
    },
    [config],
  );

  const performMemoryRefresh = useCallback(async () => {
    historyManager.addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (QWEN.md or other context files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        settings.merged.context?.loadFromIncludeDirectories
          ? config.getWorkspaceContext().getDirectories()
          : [],
        config.getFileService(),
        config.getExtensionContextFilePaths(),
        config.isTrustedFolder(),
        settings.merged.context?.importFormat || 'tree', // Use setting or default to 'tree'
      );

      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${
            memoryContent.length > 0
              ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
              : 'No memory content found.'
          }`,
        },
        Date.now(),
      );
      debugLogger.debug(
        `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(
          0,
          200,
        )}...`,
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      historyManager.addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      debugLogger.error('Error refreshing memory:', error);
    }
  }, [config, historyManager, settings.merged]);

  const cancelHandlerRef = useRef<() => void>(() => {});

  // Queue declared before useGeminiStream so drain() can be passed directly.
  const { messageQueue, addMessage, popLast, drain } = useMessageQueue();

  // Voice input — lifted here so Footer and InputPrompt share the same state
  const voiceEnabled = settings.merged.voice?.enabled ?? false;
  const sttEndpoint =
    settings.merged.voice?.sttEndpoint ?? DEFAULT_STT_ENDPOINT;
  const sttEnvKey = settings.merged.voice?.sttEnvKey;
  const sttApiKey = sttEnvKey ? process.env[sttEnvKey] : undefined;
  const voice = useVoice(sttEndpoint, sttApiKey);
  const voiceStart = voice.start;
  const voiceStop = voice.stop;
  const voiceReset = voice.reset;
  const voiceStateValue = voice.voiceState;

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    cancelOngoingRequest,
    retryLastPrompt,
    handleApprovalModeChange,
    activePtyId,
    loopDetectionConfirmationRequest,
  } = useGeminiStream(
    config.getGeminiClient(),
    historyManager.history,
    historyManager.addItem,
    config,
    settings,
    onDebugMessage,
    handleSlashCommand,
    shellModeActive,
    () => settings.merged.general?.preferredEditor as EditorType,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
    refreshStatic,
    () => cancelHandlerRef.current(),
    setEmbeddedShellFocused,
    terminalWidth,
    terminalHeight,
    drain,
  );

  // Idle drain: submit any messages still in the queue when the turn ends.
  // Most messages are injected mid-turn via handleCompletedTools.drain(),
  // but pure text turns (no tool calls) need this fallback.
  useIdleMessageDrain(
    isConfigInitialized,
    streamingState,
    messageQueue,
    drain,
    submitQuery,
  );

  // Track whether suggestions are visible for Tab key handling
  const [hasSuggestionsVisible, setHasSuggestionsVisible] = useState(false);

  const agentViewState = useAgentViewState();

  // Auto-accept indicator — disabled on agent tabs (agents handle their own)
  const geminiClient = config.getGeminiClient();

  const showAutoAcceptIndicator = useAutoAcceptIndicator({
    config,
    addItem: historyManager.addItem,
    onApprovalModeChange: handleApprovalModeChange,
    shouldBlockTab: () => hasSuggestionsVisible,
    disabled: agentViewState.activeView !== 'main',
  });

  // Prompt suggestions (generation, speculation, dismissal)
  const {
    promptSuggestion,
    setPromptSuggestion,
    dismissPromptSuggestion,
    speculationRef,
  } = usePromptSuggestions({
    config,
    settings,
    streamingState,
    geminiClient,
    historyManager,
    shellConfirmationRequest,
    confirmationRequest,
    loopDetectionConfirmationRequest,
    isPermissionsDialogOpen,
    settingInputRequests,
    pendingGeminiHistoryItems,
  });

  // Callback for handling final submit (must be after addMessage from useMessageQueue)
  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      // Route to active in-process agent if viewing a sub-agent tab.
      if (agentViewState.activeView !== 'main') {
        const agent = agentViewState.agents.get(agentViewState.activeView);
        if (agent) {
          agent.interactiveAgent.enqueueMessage(submittedValue.trim());
          return;
        }
      }
      if (
        streamingState === StreamingState.Responding &&
        isBtwCommand(submittedValue)
      ) {
        void submitQuery(submittedValue);
        return;
      }

      // Check if speculation has results for this submission
      const spec = speculationRef.current;
      if (
        spec.status !== 'idle' &&
        spec.suggestion === submittedValue &&
        spec.status === 'completed'
      ) {
        // Accept completed speculation: inject messages and apply files
        acceptSpeculation(spec, geminiClient)
          .then((result) => {
            logSpeculation(
              config,
              new SpeculationEvent({
                outcome: 'accepted',
                turns_used: spec.messages.filter((m) => m.role === 'model')
                  .length,
                files_written: result.filesApplied.length,
                tool_use_count: spec.toolUseCount,
                duration_ms: Date.now() - spec.startTime,
                boundary_type: spec.boundary?.type,
                had_pipelined_suggestion: !!result.nextSuggestion,
              }),
            );
            // Speculation completed fully (no boundary) — render results in UI
            {
              const now = Date.now();

              // Render each speculated message as the appropriate HistoryItem
              for (let mi = 0; mi < result.messages.length; mi++) {
                const msg = result.messages[mi];
                if (msg.role === 'user' && msg.parts) {
                  // Check if this is a tool result (functionResponse) or user text
                  const hasText = msg.parts.some(
                    (p) => p.text && !p.functionResponse,
                  );
                  if (hasText) {
                    const text = msg.parts
                      .map((p) => p.text ?? '')
                      .filter(Boolean)
                      .join('');
                    if (text) {
                      historyManager.addItem(
                        { type: 'user' as const, text },
                        now,
                      );
                    }
                  }
                  // functionResponse parts are rendered as part of the tool_group below
                } else if (msg.role === 'model' && msg.parts) {
                  // Extract text and tool calls separately
                  const textParts = msg.parts
                    .filter((p) => p.text && !p.functionCall)
                    .map((p) => p.text!)
                    .join('');
                  const toolCalls = msg.parts.filter((p) => p.functionCall);

                  if (textParts) {
                    historyManager.addItem(
                      { type: 'gemini' as const, text: textParts },
                      now,
                    );
                  }

                  if (toolCalls.length > 0) {
                    // Find matching tool results from the next message
                    const nextMsg = result.messages[mi + 1];
                    const toolResults =
                      nextMsg?.parts?.filter((p) => p.functionResponse) ?? [];

                    const tools = toolCalls.map((tc, i) => {
                      const name = tc.functionCall?.name ?? 'unknown';
                      const args = tc.functionCall?.args ?? {};
                      const resp = toolResults[i]?.functionResponse?.response;
                      const resultText =
                        typeof resp === 'object' && resp
                          ? ((resp as Record<string, unknown>)['output'] ??
                            JSON.stringify(resp))
                          : String(resp ?? '');
                      return {
                        callId: `spec-${name}-${i}`,
                        name,
                        description:
                          Object.entries(args)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
                            .join(', ') || name,
                        resultDisplay: String(resultText).slice(0, 500),
                        status: ToolCallStatus.Success,
                        confirmationDetails: undefined,
                      };
                    });

                    const toolGroupItem: HistoryItemWithoutId = {
                      type: 'tool_group' as const,
                      tools,
                    };
                    historyManager.addItem(toolGroupItem, now);
                  }
                }
              }
            }
            if (result.nextSuggestion) {
              setPromptSuggestion(result.nextSuggestion);
            }
          })
          .catch(() => {
            // Fallback: submit normally
            addMessage(submittedValue);
          });
        speculationRef.current = IDLE_SPECULATION;
        return;
      }

      // Abort any running speculation since we're submitting something different
      if (spec.status === 'running') {
        abortSpeculation(spec).catch(() => {});
        speculationRef.current = IDLE_SPECULATION;
      }

      addMessage(submittedValue);
    },
    [
      addMessage,
      agentViewState,
      streamingState,
      submitQuery,
      config,
      geminiClient,
      historyManager,
      setPromptSuggestion,
      speculationRef,
    ],
  );

  const handleArenaModelsSelected = useCallback(
    (models: string[]) => {
      const value = models.join(',');
      buffer.setText(`/arena start --models ${value} `);
      closeArenaDialog();
    },
    [buffer, closeArenaDialog],
  );

  // Welcome back functionality (must be after handleFinalSubmit)
  const {
    welcomeBackInfo,
    showWelcomeBackDialog,
    welcomeBackChoice,
    handleWelcomeBackSelection,
    handleWelcomeBackClose,
  } = useWelcomeBack(config, handleFinalSubmit, buffer, settings.merged);

  cancelHandlerRef.current = useCallback(() => {
    const pendingHistoryItems = [
      ...pendingSlashCommandHistoryItems,
      ...pendingGeminiHistoryItems,
    ];
    if (isToolExecuting(pendingHistoryItems)) {
      buffer.setText(''); // Just clear the prompt
      return;
    }

    // Pop one message from the queue at a time instead of dumping all.
    // Each ESC press removes the most recent queued message and puts it
    // back in the input buffer so the user can edit or discard it.
    const popped = popLast();
    if (popped) {
      buffer.setText(popped);
      return;
    }

    // No queued messages — restore last user message to the input buffer
    const lastUserMessage = userMessages.at(-1);
    if (lastUserMessage) {
      buffer.setText(lastUserMessage);
    }
  }, [
    buffer,
    userMessages,
    popLast,
    pendingSlashCommandHistoryItems,
    pendingGeminiHistoryItems,
  ]);

  const handleClearScreen = useCallback(() => {
    historyManager.clearItems();
    clearScreen();
    refreshStatic();
  }, [historyManager, refreshStatic]);

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

  /**
   * Determines if the input prompt should be active and accept user input.
   * Input is disabled during:
   * - Initialization errors
   * - Slash command processing
   * - Tool confirmations (WaitingForConfirmation state)
   * - Any future streaming states not explicitly allowed
   */
  const isInputActive =
    !initError &&
    !isProcessing &&
    (streamingState === StreamingState.Idle ||
      streamingState === StreamingState.Responding);

  const [controlsHeight, setControlsHeight] = useState(0);

  useLayoutEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      if (fullFooterMeasurement.height > 0) {
        setControlsHeight(fullFooterMeasurement.height);
      }
    }
  }, [buffer, terminalWidth, terminalHeight]);

  // agentViewState is declared earlier (before handleFinalSubmit) so it
  // is available for input routing. Referenced here for layout computation.

  // Compute available terminal height based on controls measurement.
  // When in-process agents are present the AgentTabBar renders an extra
  // row at the top of the layout; subtract it so downstream consumers
  // (shell, transcript, etc.) don't overestimate available space.
  const tabBarHeight = agentViewState.agents.size > 0 ? 1 : 0;
  const availableTerminalHeight = Math.max(
    0,
    terminalHeight - controlsHeight - staticExtraHeight - 2 - tabBarHeight,
  );

  config.setShellExecutionConfig({
    terminalWidth: Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
    terminalHeight: Math.max(
      Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING),
      1,
    ),
    pager: settings.merged.tools?.shell?.pager,
    showColor: settings.merged.tools?.shell?.showColor,
  });

  const isFocused = useFocus();
  useBracketedPaste();

  // Context file names computation
  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.context?.fileName;
    return fromSettings
      ? Array.isArray(fromSettings)
        ? fromSettings
        : [fromSettings]
      : getAllGeminiMdFilenames();
  }, [settings.merged.context?.fileName]);
  // Initial prompt handling
  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const initialPromptSubmitted = useRef(false);

  useEffect(() => {
    if (activePtyId) {
      ShellExecutionService.resizePty(
        activePtyId,
        Math.floor(terminalWidth * SHELL_WIDTH_FRACTION),
        Math.max(Math.floor(availableTerminalHeight - SHELL_HEIGHT_PADDING), 1),
      );
    }
  }, [terminalWidth, availableTerminalHeight, activePtyId]);

  useEffect(() => {
    if (
      initialPrompt &&
      isConfigInitialized &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isAuthDialogOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !showWelcomeBackDialog &&
      welcomeBackChoice !== 'restart' &&
      geminiClient?.isInitialized?.()
    ) {
      handleFinalSubmit(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    isConfigInitialized,
    handleFinalSubmit,
    isAuthenticating,
    isAuthDialogOpen,
    isThemeDialogOpen,
    isEditorDialogOpen,
    showWelcomeBackDialog,
    welcomeBackChoice,
    geminiClient,
  ]);

  const [idePromptAnswered, setIdePromptAnswered] = useState(false);
  const [currentIDE, setCurrentIDE] = useState<IdeInfo | null>(null);

  useEffect(() => {
    const getIde = async () => {
      const ideClient = await IdeClient.getInstance();
      const currentIde = ideClient.getCurrentIde();
      setCurrentIDE(currentIde || null);
    };
    getIde();
  }, []);
  const shouldShowIdePrompt = Boolean(
    currentIDE &&
      !config.getIdeMode() &&
      !settings.merged.ide?.hasSeenNudge &&
      !idePromptAnswered,
  );

  // Command migration nudge
  const {
    showMigrationNudge: shouldShowCommandMigrationNudge,
    tomlFiles: commandMigrationTomlFiles,
    setShowMigrationNudge: setShowCommandMigrationNudge,
  } = useCommandMigration(settings, config.storage);

  const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
  const [showIdeRestartPrompt, setShowIdeRestartPrompt] = useState(false);

  const { isFolderTrustDialogOpen, handleFolderTrustSelect, isRestarting } =
    useFolderTrust(settings, setIsTrustedFolder);
  const {
    needsRestart: ideNeedsRestart,
    restartReason: ideTrustRestartReason,
  } = useIdeTrustListener();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (ideNeedsRestart) {
      // IDE trust changed, force a restart.
      setShowIdeRestartPrompt(true);
    }
  }, [ideNeedsRestart]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const handler = setTimeout(() => {
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, refreshStatic]);

  useEffect(() => {
    const unsubscribe = ideContextStore.subscribe(setIdeContextState);
    setIdeContextState(ideContextStore.get());
    return unsubscribe;
  }, []);

  const handleIdePromptComplete = useCallback(
    (result: IdeIntegrationNudgeResult) => {
      if (result.userSelection === 'yes') {
        // Check whether the extension has been pre-installed
        if (result.isExtensionPreInstalled) {
          handleSlashCommand('/ide enable');
        } else {
          handleSlashCommand('/ide install');
        }
        settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
      } else if (result.userSelection === 'dismiss') {
        settings.setValue(SettingScope.User, 'ide.hasSeenNudge', true);
      }
      setIdePromptAnswered(true);
    },
    [handleSlashCommand, settings],
  );

  const handleCommandMigrationComplete = useCallback(
    async (result: CommandMigrationNudgeResult) => {
      setShowCommandMigrationNudge(false);

      if (result.userSelection === 'yes') {
        // Perform migration for both workspace and user levels
        try {
          const results = [];

          // Migrate workspace commands
          const workspaceCommandsDir = config.storage.getProjectCommandsDir();
          const workspaceResult = await migrateTomlCommands({
            commandDir: workspaceCommandsDir,
            createBackup: true,
            deleteOriginal: false,
          });
          if (
            workspaceResult.convertedFiles.length > 0 ||
            workspaceResult.failedFiles.length > 0
          ) {
            results.push({ level: 'workspace', result: workspaceResult });
          }

          // Migrate user commands
          const userCommandsDir = Storage.getUserCommandsDir();
          const userResult = await migrateTomlCommands({
            commandDir: userCommandsDir,
            createBackup: true,
            deleteOriginal: false,
          });
          if (
            userResult.convertedFiles.length > 0 ||
            userResult.failedFiles.length > 0
          ) {
            results.push({ level: 'user', result: userResult });
          }

          // Report results
          for (const { level, result: migrationResult } of results) {
            if (
              migrationResult.success &&
              migrationResult.convertedFiles.length > 0
            ) {
              historyManager.addItem(
                {
                  type: MessageType.INFO,
                  text: `[${level}] Successfully migrated ${migrationResult.convertedFiles.length} command file${migrationResult.convertedFiles.length > 1 ? 's' : ''} to Markdown format. Original files backed up as .toml.backup`,
                },
                Date.now(),
              );
            }

            if (migrationResult.failedFiles.length > 0) {
              historyManager.addItem(
                {
                  type: MessageType.ERROR,
                  text: `[${level}] Failed to migrate ${migrationResult.failedFiles.length} file${migrationResult.failedFiles.length > 1 ? 's' : ''}:\n${migrationResult.failedFiles.map((f) => `  • ${f.file}: ${f.error}`).join('\n')}`,
                },
                Date.now(),
              );
            }
          }

          if (results.length === 0) {
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: 'No TOML files found to migrate.',
              },
              Date.now(),
            );
          }
        } catch (error) {
          historyManager.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Migration failed: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
      }
    },
    [historyManager, setShowCommandMigrationNudge, config.storage],
  );

  const currentCandidatesTokens = Object.values(
    sessionStats.metrics?.models ?? {},
  ).reduce((acc, model) => acc + (model.tokens?.candidates ?? 0), 0);

  const { elapsedTime, currentLoadingPhrase, taskStartTokens } =
    useLoadingIndicator(
      streamingState,
      settings.merged.ui?.customWittyPhrases,
      currentCandidatesTokens,
    );

  useAttentionNotifications({
    isFocused,
    streamingState,
    elapsedTime,
    settings,
    config,
  });

  // Dialog close functionality
  const { closeAnyOpenDialog } = useDialogClose({
    isThemeDialogOpen,
    handleThemeSelect,
    isApprovalModeDialogOpen,
    handleApprovalModeSelect,
    isAuthDialogOpen,
    handleAuthSelect,
    pendingAuthType,
    isEditorDialogOpen,
    exitEditorDialog,
    isSettingsDialogOpen,
    closeSettingsDialog,
    activeArenaDialog,
    closeArenaDialog,
    isFolderTrustDialogOpen,
    showWelcomeBackDialog,
    handleWelcomeBackClose,
  });

  const { handleExit } = useExitHandling({
    isAuthDialogOpen,
    handleSlashCommand,
    closeAnyOpenDialog,
    streamingState,
    cancelOngoingRequest,
    buffer,
  });

  const {
    showToolDescriptions,
    ctrlCPressedOnce,
    ctrlDPressedOnce,
    showEscapePrompt,
    handleEscapePromptChange,
    constrainHeight,
    setConstrainHeight,
    dialogsVisibleRef,
  } = useKeyboardHandling({
    buffer,
    streamingState,
    btwItem,
    cancelBtw,
    setBtwItem,
    embeddedShellFocused,
    handleSlashCommand,
    cancelOngoingRequest,
    isAuthenticating,
    openRewindDialog,
    activePtyId,
    setEmbeddedShellFocused,
    config,
    ideContextState,
    handleExit,
    debugKeystrokeLogging: settings.merged.general?.debugKeystrokeLogging,
  });

  // Update terminal title with proto status and thoughts
  useWindowTitle(
    streamingState,
    thought,
    settings,
    stdout,
    config.getTargetDir(),
  );

  const nightly = props.version.includes('nightly');

  const dialogsVisible =
    showWelcomeBackDialog ||
    shouldShowIdePrompt ||
    shouldShowCommandMigrationNudge ||
    isFolderTrustDialogOpen ||
    !!shellConfirmationRequest ||
    !!confirmationRequest ||
    confirmUpdateExtensionRequests.length > 0 ||
    !!codingPlanUpdateRequest ||
    settingInputRequests.length > 0 ||
    pluginChoiceRequests.length > 0 ||
    !!loopDetectionConfirmationRequest ||
    isThemeDialogOpen ||
    isSettingsDialogOpen ||
    isModelDialogOpen ||
    isTrustDialogOpen ||
    activeArenaDialog !== null ||
    isPermissionsDialogOpen ||
    isAuthDialogOpen ||
    isAuthenticating ||
    isEditorDialogOpen ||
    showIdeRestartPrompt ||
    isSubagentCreateDialogOpen ||
    isAgentsManagerDialogOpen ||
    isMcpDialogOpen ||
    isHooksDialogOpen ||
    isApprovalModeDialogOpen ||
    isResumeDialogOpen ||
    isRewindDialogOpen ||
    isExtensionsManagerDialogOpen;
  dialogsVisibleRef.current = dialogsVisible;

  const {
    isFeedbackDialogOpen,
    openFeedbackDialog,
    closeFeedbackDialog,
    temporaryCloseFeedbackDialog,
    submitFeedback,
  } = useFeedbackDialog({
    config,
    settings,
    streamingState,
    history: historyManager.history,
    sessionStats,
  });

  const pendingHistoryItems = useMemo(
    () => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems],
    [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems],
  );

  const uiState: UIState = useMemo(
    () => ({
      history: historyManager.history,
      historyManager,
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      isAuthDialogOpen,
      pendingAuthType,
      editorError,
      isEditorDialogOpen,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isModelDialogOpen,
      isFastModelMode,
      isTrustDialogOpen,
      activeArenaDialog,
      isPermissionsDialogOpen,
      isApprovalModeDialogOpen,
      isResumeDialogOpen,
      isRewindDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      confirmUpdateExtensionRequests,
      codingPlanUpdateRequest,
      settingInputRequests,
      pluginChoiceRequests,
      loopDetectionConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      userMessages,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      shouldShowCommandMigrationNudge,
      commandMigrationTomlFiles,
      isFolderTrustDialogOpen: isFolderTrustDialogOpen ?? false,
      isTrustedFolder,
      constrainHeight,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      messageQueue,
      showAutoAcceptIndicator,
      currentModel,
      contextFileNames,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      btwItem,
      setBtwItem,
      cancelBtw,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      extensionsUpdateState,
      activePtyId,
      embeddedShellFocused,
      // Welcome back dialog
      showWelcomeBackDialog,
      welcomeBackInfo,
      welcomeBackChoice,
      // Subagent dialogs
      isSubagentCreateDialogOpen,
      isAgentsManagerDialogOpen,
      // Extensions manager dialog
      isExtensionsManagerDialogOpen,
      // MCP dialog
      isMcpDialogOpen,
      // Hooks dialog
      isHooksDialogOpen,
      // Feedback dialog
      isFeedbackDialogOpen,
      // Per-task token tracking
      taskStartTokens,
      // Voice input state
      voiceEnabled,
      voiceBackendAvailable: voice.backendAvailable,
      voiceState: voice.voiceState,
      voiceError: voice.error,
      // Prompt suggestion
      promptSuggestion,
      dismissPromptSuggestion,
    }),
    [
      isThemeDialogOpen,
      themeError,
      isAuthenticating,
      isConfigInitialized,
      authError,
      isAuthDialogOpen,
      pendingAuthType,
      editorError,
      isEditorDialogOpen,
      debugMessage,
      quittingMessages,
      isSettingsDialogOpen,
      isModelDialogOpen,
      isFastModelMode,
      isTrustDialogOpen,
      activeArenaDialog,
      isPermissionsDialogOpen,
      isApprovalModeDialogOpen,
      isResumeDialogOpen,
      isRewindDialogOpen,
      slashCommands,
      pendingSlashCommandHistoryItems,
      commandContext,
      shellConfirmationRequest,
      confirmationRequest,
      confirmUpdateExtensionRequests,
      codingPlanUpdateRequest,
      settingInputRequests,
      pluginChoiceRequests,
      loopDetectionConfirmationRequest,
      geminiMdFileCount,
      streamingState,
      initError,
      pendingGeminiHistoryItems,
      thought,
      shellModeActive,
      userMessages,
      buffer,
      inputWidth,
      suggestionsWidth,
      isInputActive,
      shouldShowIdePrompt,
      shouldShowCommandMigrationNudge,
      commandMigrationTomlFiles,
      isFolderTrustDialogOpen,
      isTrustedFolder,
      constrainHeight,
      ideContextState,
      showToolDescriptions,
      ctrlCPressedOnce,
      ctrlDPressedOnce,
      showEscapePrompt,
      isFocused,
      elapsedTime,
      currentLoadingPhrase,
      historyRemountKey,
      messageQueue,
      showAutoAcceptIndicator,
      contextFileNames,
      availableTerminalHeight,
      mainAreaWidth,
      staticAreaMaxItemHeight,
      staticExtraHeight,
      dialogsVisible,
      pendingHistoryItems,
      btwItem,
      setBtwItem,
      cancelBtw,
      nightly,
      branchName,
      sessionStats,
      terminalWidth,
      terminalHeight,
      mainControlsRef,
      currentIDE,
      updateInfo,
      showIdeRestartPrompt,
      ideTrustRestartReason,
      isRestarting,
      currentModel,
      extensionsUpdateState,
      activePtyId,
      historyManager,
      embeddedShellFocused,
      // Welcome back dialog
      showWelcomeBackDialog,
      welcomeBackInfo,
      welcomeBackChoice,
      // Subagent dialogs
      isSubagentCreateDialogOpen,
      isAgentsManagerDialogOpen,
      // Extensions manager dialog
      isExtensionsManagerDialogOpen,
      // MCP dialog
      isMcpDialogOpen,
      // Hooks dialog
      isHooksDialogOpen,
      // Feedback dialog
      isFeedbackDialogOpen,
      // Per-task token tracking
      taskStartTokens,
      // Voice input state
      voiceEnabled,
      voice.backendAvailable,
      voice.voiceState,
      voice.error,
      // Prompt suggestion
      promptSuggestion,
      dismissPromptSuggestion,
    ],
  );

  const uiActions: UIActions = useMemo(
    () => ({
      openThemeDialog,
      openEditorDialog,
      handleThemeSelect,
      handleThemeHighlight,
      handleApprovalModeSelect,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      cancelAuthentication,
      handleCodingPlanSubmit,
      handleAlibabaStandardSubmit,
      handleEditorSelect,
      exitEditorDialog,
      closeSettingsDialog,
      closeModelDialog,
      openArenaDialog,
      closeArenaDialog,
      handleArenaModelsSelected,
      dismissCodingPlanUpdate,
      closeTrustDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleCommandMigrationComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      onEscapePromptChange: handleEscapePromptChange,
      onSuggestionsVisibilityChange: setHasSuggestionsVisible,
      refreshStatic,
      handleFinalSubmit,
      handleRetryLastPrompt: retryLastPrompt,
      handleClearScreen,
      dequeueAll: drain,
      onVoiceToggle: () => {
        if (voiceStateValue === 'idle') void voiceStart();
        else if (voiceStateValue === 'recording')
          void voiceStop().then((transcript) => {
            if (transcript) buffer.insert(transcript, { paste: false });
          });
        else if (voiceStateValue === 'error') voiceReset();
      },
      // Welcome back dialog
      handleWelcomeBackSelection,
      handleWelcomeBackClose,
      // Subagent dialogs
      closeSubagentCreateDialog,
      closeAgentsManagerDialog,
      // Extensions manager dialog
      closeExtensionsManagerDialog,
      // MCP dialog
      closeMcpDialog,
      // Hooks dialog
      openHooksDialog,
      // Hooks dialog
      closeHooksDialog,
      // Resume session dialog
      openResumeDialog,
      closeResumeDialog,
      handleResume,
      // Rewind dialog
      openRewindDialog,
      closeRewindDialog,
      // Feedback dialog
      openFeedbackDialog,
      closeFeedbackDialog,
      temporaryCloseFeedbackDialog,
      submitFeedback,
    }),
    [
      openThemeDialog,
      openEditorDialog,
      handleThemeSelect,
      handleThemeHighlight,
      handleApprovalModeSelect,
      handleAuthSelect,
      setAuthState,
      onAuthError,
      cancelAuthentication,
      handleCodingPlanSubmit,
      handleAlibabaStandardSubmit,
      handleEditorSelect,
      exitEditorDialog,
      closeSettingsDialog,
      closeModelDialog,
      openArenaDialog,
      closeArenaDialog,
      handleArenaModelsSelected,
      dismissCodingPlanUpdate,
      closeTrustDialog,
      closePermissionsDialog,
      setShellModeActive,
      vimHandleInput,
      handleIdePromptComplete,
      handleCommandMigrationComplete,
      handleFolderTrustSelect,
      setConstrainHeight,
      handleEscapePromptChange,
      refreshStatic,
      handleFinalSubmit,
      retryLastPrompt,
      handleClearScreen,
      drain,
      voiceStateValue,
      voiceStart,
      voiceStop,
      voiceReset,
      buffer,
      handleWelcomeBackSelection,
      handleWelcomeBackClose,
      // Subagent dialogs
      closeSubagentCreateDialog,
      closeAgentsManagerDialog,
      // Extensions manager dialog
      closeExtensionsManagerDialog,
      // MCP dialog
      closeMcpDialog,
      // Hooks dialog
      openHooksDialog,
      // Hooks dialog
      closeHooksDialog,
      // Resume session dialog
      openResumeDialog,
      closeResumeDialog,
      handleResume,
      // Rewind dialog
      openRewindDialog,
      closeRewindDialog,
      // Feedback dialog
      openFeedbackDialog,
      closeFeedbackDialog,
      temporaryCloseFeedbackDialog,
      submitFeedback,
    ],
  );

  return (
    <UIStateContext.Provider value={uiState}>
      <UIActionsContext.Provider value={uiActions}>
        <ConfigContext.Provider value={config}>
          <AppContext.Provider
            value={{
              version: props.version,
              startupWarnings: props.startupWarnings || [],
            }}
          >
            <ShellFocusContext.Provider value={isFocused}>
              <App />
            </ShellFocusContext.Provider>
          </AppContext.Provider>
        </ConfigContext.Provider>
      </UIActionsContext.Provider>
    </UIStateContext.Provider>
  );
};
