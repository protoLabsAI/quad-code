/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { IdeIntegrationNudge } from '../IdeIntegrationNudge.js';
import { CommandFormatMigrationNudge } from '../CommandFormatMigrationNudge.js';
import { LoopDetectionConfirmation } from './LoopDetectionConfirmation.js';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import { ShellConfirmationDialog } from './ShellConfirmationDialog.js';
import { ConsentPrompt } from './ConsentPrompt.js';
import { SettingInputPrompt } from './SettingInputPrompt.js';
import { PluginChoicePrompt } from './PluginChoicePrompt.js';
import { ThemeDialog } from './ThemeDialog.js';
import { SettingsDialog } from './SettingsDialog.js';
import { AuthDialog } from '../auth/AuthDialog.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { TrustDialog } from './TrustDialog.js';
import { PermissionsDialog } from './PermissionsDialog.js';
import { ModelDialog } from './ModelDialog.js';
import { ArenaStartDialog } from './arena/ArenaStartDialog.js';
import { ArenaSelectDialog } from './arena/ArenaSelectDialog.js';
import { ArenaStopDialog } from './arena/ArenaStopDialog.js';
import { ArenaStatusDialog } from './arena/ArenaStatusDialog.js';
import { ApprovalModeDialog } from './ApprovalModeDialog.js';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import process from 'node:process';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { IdeTrustChangeDialog } from './IdeTrustChangeDialog.js';
import { WelcomeBackDialog } from './WelcomeBackDialog.js';
import { AgentCreationWizard } from './subagents/create/AgentCreationWizard.js';
import { AgentsManagerDialog } from './subagents/manage/AgentsManagerDialog.js';
import { ExtensionsManagerDialog } from './extensions/ExtensionsManagerDialog.js';
import { MCPManagementDialog } from './mcp/MCPManagementDialog.js';
import { HooksManagementDialog } from './hooks/HooksManagementDialog.js';
import { SessionPicker } from './SessionPicker.js';
import { RewindPicker } from './RewindPicker.js';
import { checkpointStore, CompressionStatus } from '@qwen-code/qwen-code-core';

interface DialogManagerProps {
  addItem: UseHistoryManagerReturn['addItem'];
  terminalWidth: number;
}

// Props for DialogManager
export const DialogManager = ({
  addItem,
  terminalWidth,
}: DialogManagerProps) => {
  const config = useConfig();
  const settings = useSettings();

  const uiState = useUIState();
  const uiActions = useUIActions();
  const { constrainHeight, terminalHeight, staticExtraHeight, mainAreaWidth } =
    uiState;

  if (uiState.showWelcomeBackDialog && uiState.welcomeBackInfo?.hasHistory) {
    return (
      <WelcomeBackDialog
        welcomeBackInfo={uiState.welcomeBackInfo}
        onSelect={uiActions.handleWelcomeBackSelection}
        onClose={uiActions.handleWelcomeBackClose}
      />
    );
  }
  if (uiState.showIdeRestartPrompt) {
    return <IdeTrustChangeDialog reason={uiState.ideTrustRestartReason} />;
  }
  if (uiState.shouldShowIdePrompt) {
    return (
      <IdeIntegrationNudge
        ide={uiState.currentIDE!}
        onComplete={uiActions.handleIdePromptComplete}
      />
    );
  }
  if (uiState.shouldShowCommandMigrationNudge) {
    return (
      <CommandFormatMigrationNudge
        tomlFiles={uiState.commandMigrationTomlFiles}
        onComplete={uiActions.handleCommandMigrationComplete}
      />
    );
  }
  if (uiState.isFolderTrustDialogOpen) {
    return (
      <FolderTrustDialog
        onSelect={uiActions.handleFolderTrustSelect}
        isRestarting={uiState.isRestarting}
      />
    );
  }
  if (uiState.shellConfirmationRequest) {
    return (
      <ShellConfirmationDialog request={uiState.shellConfirmationRequest} />
    );
  }
  if (uiState.loopDetectionConfirmationRequest) {
    return (
      <LoopDetectionConfirmation
        onComplete={uiState.loopDetectionConfirmationRequest.onComplete}
      />
    );
  }
  if (uiState.confirmationRequest) {
    return (
      <ConsentPrompt
        prompt={uiState.confirmationRequest.prompt}
        onConfirm={uiState.confirmationRequest.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.confirmUpdateExtensionRequests.length > 0) {
    const request = uiState.confirmUpdateExtensionRequests[0];
    return (
      <ConsentPrompt
        prompt={request.prompt}
        onConfirm={request.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.codingPlanUpdateRequest) {
    return (
      <ConsentPrompt
        prompt={uiState.codingPlanUpdateRequest.prompt}
        onConfirm={uiState.codingPlanUpdateRequest.onConfirm}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.settingInputRequests.length > 0) {
    const request = uiState.settingInputRequests[0];
    // Use settingName as key to force re-mount when switching between different settings
    return (
      <SettingInputPrompt
        key={request.settingName}
        settingName={request.settingName}
        settingDescription={request.settingDescription}
        sensitive={request.sensitive}
        onSubmit={request.onSubmit}
        onCancel={request.onCancel}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.pluginChoiceRequests.length > 0) {
    const request = uiState.pluginChoiceRequests[0];
    return (
      <PluginChoicePrompt
        key={request.marketplaceName}
        marketplaceName={request.marketplaceName}
        plugins={request.plugins}
        onSelect={request.onSelect}
        onCancel={request.onCancel}
        terminalWidth={terminalWidth}
      />
    );
  }
  if (uiState.isThemeDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.themeError && (
          <Box marginBottom={1}>
            <Text color={theme.status.error}>{uiState.themeError}</Text>
          </Box>
        )}
        <ThemeDialog
          onSelect={uiActions.handleThemeSelect}
          onHighlight={uiActions.handleThemeHighlight}
          settings={settings}
          availableTerminalHeight={
            constrainHeight ? terminalHeight - staticExtraHeight : undefined
          }
          terminalWidth={mainAreaWidth}
        />
      </Box>
    );
  }
  if (uiState.isEditorDialogOpen) {
    return (
      <Box flexDirection="column">
        {uiState.editorError && (
          <Box marginBottom={1}>
            <Text color={theme.status.error}>{uiState.editorError}</Text>
          </Box>
        )}
        <EditorSettingsDialog
          onSelect={uiActions.handleEditorSelect}
          settings={settings}
          onExit={uiActions.exitEditorDialog}
        />
      </Box>
    );
  }
  if (uiState.isSettingsDialogOpen) {
    return (
      <Box flexDirection="column">
        <SettingsDialog
          settings={settings}
          onSelect={(settingName) => {
            if (settingName === 'ui.theme') {
              uiActions.openThemeDialog();
              return;
            }
            if (settingName === 'general.preferredEditor') {
              uiActions.openEditorDialog();
              return;
            }
            uiActions.closeSettingsDialog();
          }}
          onRestartRequest={() => process.exit(0)}
          availableTerminalHeight={terminalHeight - staticExtraHeight}
          config={config}
        />
      </Box>
    );
  }
  if (uiState.isApprovalModeDialogOpen) {
    const currentMode = config.getApprovalMode();
    return (
      <Box flexDirection="column">
        <ApprovalModeDialog
          settings={settings}
          currentMode={currentMode}
          onSelect={uiActions.handleApprovalModeSelect}
          availableTerminalHeight={
            constrainHeight ? terminalHeight - staticExtraHeight : undefined
          }
        />
      </Box>
    );
  }
  if (uiState.isModelDialogOpen) {
    return (
      <ModelDialog
        onClose={uiActions.closeModelDialog}
        isFastModelMode={uiState.isFastModelMode}
      />
    );
  }
  if (uiState.activeArenaDialog === 'start') {
    return (
      <ArenaStartDialog
        onClose={() => uiActions.closeArenaDialog()}
        onConfirm={(models) => uiActions.handleArenaModelsSelected?.(models)}
      />
    );
  }
  if (uiState.activeArenaDialog === 'status') {
    const arenaManager = config.getArenaManager();
    if (arenaManager) {
      return (
        <ArenaStatusDialog
          manager={arenaManager}
          closeArenaDialog={uiActions.closeArenaDialog}
          width={mainAreaWidth}
        />
      );
    }
  }
  if (uiState.activeArenaDialog === 'stop') {
    return (
      <ArenaStopDialog
        config={config}
        addItem={addItem}
        closeArenaDialog={uiActions.closeArenaDialog}
      />
    );
  }
  if (uiState.activeArenaDialog === 'select') {
    const arenaManager = config.getArenaManager();
    if (arenaManager) {
      return (
        <ArenaSelectDialog
          manager={arenaManager}
          config={config}
          addItem={addItem}
          closeArenaDialog={uiActions.closeArenaDialog}
        />
      );
    }
  }

  if (uiState.isAuthDialogOpen || uiState.authError) {
    return (
      <Box flexDirection="column">
        <AuthDialog />
      </Box>
    );
  }

  if (uiState.isTrustDialogOpen) {
    return (
      <TrustDialog onExit={uiActions.closeTrustDialog} addItem={addItem} />
    );
  }

  if (uiState.isPermissionsDialogOpen) {
    return <PermissionsDialog onExit={uiActions.closePermissionsDialog} />;
  }

  if (uiState.isSubagentCreateDialogOpen) {
    return (
      <AgentCreationWizard
        onClose={uiActions.closeSubagentCreateDialog}
        config={config}
      />
    );
  }

  if (uiState.isAgentsManagerDialogOpen) {
    return (
      <AgentsManagerDialog
        onClose={uiActions.closeAgentsManagerDialog}
        config={config}
      />
    );
  }

  if (uiState.isExtensionsManagerDialogOpen) {
    return (
      <ExtensionsManagerDialog
        onClose={uiActions.closeExtensionsManagerDialog}
        config={config}
      />
    );
  }
  if (uiState.isHooksDialogOpen) {
    return <HooksManagementDialog onClose={uiActions.closeHooksDialog} />;
  }
  if (uiState.isMcpDialogOpen) {
    return <MCPManagementDialog onClose={uiActions.closeMcpDialog} />;
  }

  if (uiState.isResumeDialogOpen) {
    return (
      <SessionPicker
        sessionService={config.getSessionService()}
        currentBranch={uiState.branchName}
        onSelect={uiActions.handleResume}
        onCancel={uiActions.closeResumeDialog}
      />
    );
  }

  if (uiState.isRewindDialogOpen) {
    /**
     * Compute the UI history cut index for a given checkpoint promptId.
     * Slices the UI history to BEFORE the user turn that corresponds to
     * the selected checkpoint (i.e., rewind to the state before that turn).
     */
    const getUiHistoryCutIndex = (promptId: string): number => {
      const allCheckpoints = checkpointStore.list(); // chronological order
      const cpIndex = allCheckpoints.findIndex(
        (cp) => cp.promptId === promptId,
      );
      if (cpIndex < 0) return uiState.history.length; // not found — keep all

      // Find the cpIndex-th user item in UI history (0-based).
      // The cut is BEFORE that item (exclusive).
      let usersSeen = 0;
      for (let i = 0; i < uiState.history.length; i++) {
        if (uiState.history[i].type === 'user') {
          if (usersSeen === cpIndex) {
            return i; // slice(0, i) keeps everything before this turn
          }
          usersSeen++;
        }
      }
      return uiState.history.length;
    };

    /** Apply a conversation rewind: slice UI history and LLM history. */
    const applyConversationRewind = (
      promptId: string,
    ): { slicedUiHistory: typeof uiState.history; originalPrompt: string } => {
      const cutIdx = getUiHistoryCutIndex(promptId);
      const slicedUiHistory = uiState.history.slice(0, cutIdx);
      uiState.historyManager.loadHistory(slicedUiHistory);

      // Slice the LLM history to match the number of user turns kept.
      const geminiClient = config?.getGeminiClient?.();
      if (geminiClient) {
        const userTurnCount = slicedUiHistory.filter(
          (item) => item.type === 'user',
        ).length;
        const llmHistory = geminiClient.getHistory();
        let usersSeen = 0;
        let llmCutIdx = 0;
        for (let i = 0; i < llmHistory.length; i++) {
          if (llmHistory[i].role === 'user') {
            usersSeen++;
            if (usersSeen > userTurnCount) {
              llmCutIdx = i;
              break;
            }
            llmCutIdx = i + 1;
          }
        }
        geminiClient.setHistory(
          userTurnCount === 0 ? [] : llmHistory.slice(0, llmCutIdx),
        );
      }

      // Get the original prompt text from the checkpoint for pre-filling.
      const checkpoint = checkpointStore.getByPromptId(promptId);
      const originalPrompt = checkpoint?.userPrompt ?? '';
      return { slicedUiHistory, originalPrompt };
    };

    const handleRestoreFilesAndConversation = (promptId: string) => {
      // 1. Restore files to pre-turn state
      try {
        checkpointStore.rewindToCheckpoint(promptId);
      } catch {
        // checkpoint may have no file snapshots — safe to ignore
      }
      // 2. Restore conversation (LLM history + UI history)
      const { slicedUiHistory, originalPrompt } =
        applyConversationRewind(promptId);
      uiActions.closeRewindDialog();
      // 3. Pre-fill original prompt text
      if (originalPrompt) {
        uiState.buffer.setText(originalPrompt);
      }
      const turnNumber = slicedUiHistory.filter(
        (item) => item.type === 'user',
      ).length;
      addItem(
        {
          type: 'info',
          text:
            turnNumber === 0
              ? 'Rewound to the beginning (files + conversation restored).'
              : `Rewound to turn ${turnNumber} (files + conversation restored).`,
        },
        Date.now(),
      );
    };

    const handleRestoreConversationOnly = (promptId: string) => {
      const { slicedUiHistory, originalPrompt } =
        applyConversationRewind(promptId);
      uiActions.closeRewindDialog();
      // Pre-fill original prompt text
      if (originalPrompt) {
        uiState.buffer.setText(originalPrompt);
      }
      const turnNumber = slicedUiHistory.filter(
        (item) => item.type === 'user',
      ).length;
      addItem(
        {
          type: 'info',
          text:
            turnNumber === 0
              ? 'Rewound to the beginning (conversation restored).'
              : `Rewound to turn ${turnNumber} (conversation restored).`,
        },
        Date.now(),
      );
    };

    const handleRestoreFilesOnly = (promptId: string) => {
      try {
        checkpointStore.rewindToCheckpoint(promptId);
      } catch {
        // checkpoint may have no file snapshots — safe to ignore
      }
      uiActions.closeRewindDialog();
      addItem(
        {
          type: 'info',
          text: 'Files restored to checkpoint state (conversation unchanged).',
        },
        Date.now(),
      );
    };

    const handleSummarizeFromHere = async (promptId: string) => {
      // 1. Rewind conversation to the selected checkpoint
      const { slicedUiHistory } = applyConversationRewind(promptId);
      uiActions.closeRewindDialog();

      const turnNumber = slicedUiHistory.filter(
        (item) => item.type === 'user',
      ).length;

      // 2. Compress the remaining history
      const geminiClient = config?.getGeminiClient?.();
      if (!geminiClient) {
        addItem(
          { type: 'error', text: 'Cannot summarize: client not available.' },
          Date.now(),
        );
        return;
      }
      try {
        const compressed = await geminiClient.tryCompressChat(
          `rewind-summarize-${Date.now()}`,
          true,
        );
        if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
          addItem(
            {
              type: 'info',
              text:
                turnNumber === 0
                  ? `Rewound to beginning and summarized (${compressed.originalTokenCount} → ${compressed.newTokenCount} tokens).`
                  : `Rewound to turn ${turnNumber} and summarized (${compressed.originalTokenCount} → ${compressed.newTokenCount} tokens).`,
            },
            Date.now(),
          );
        } else {
          addItem(
            {
              type: 'info',
              text:
                turnNumber === 0
                  ? 'Rewound to beginning (summarization skipped — context already short).'
                  : `Rewound to turn ${turnNumber} (summarization skipped — context already short).`,
            },
            Date.now(),
          );
        }
      } catch (err) {
        addItem(
          {
            type: 'error',
            text: `Rewound but summarization failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          Date.now(),
        );
      }
    };

    return (
      <RewindPicker
        onRestoreFilesAndConversation={handleRestoreFilesAndConversation}
        onRestoreConversationOnly={handleRestoreConversationOnly}
        onRestoreFilesOnly={handleRestoreFilesOnly}
        onSummarizeFromHere={handleSummarizeFromHere}
        onCancel={uiActions.closeRewindDialog}
      />
    );
  }

  return null;
};
