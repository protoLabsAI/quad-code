/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolCallRequestInfo,
  ExecutingToolCall,
  ScheduledToolCall,
  ValidatingToolCall,
  WaitingToolCall,
  CompletedToolCall,
  CancelledToolCall,
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
  ToolCall,
  Status as CoreStatus,
  EditorType,
} from '@qwen-code/qwen-code-core';
import {
  CoreToolScheduler,
  createDebugLogger,
} from '@qwen-code/qwen-code-core';
import { useCallback, useState, useMemo, useRef } from 'react';
import type {
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
} from '../types.js';
import { ToolCallStatus } from '../types.js';

const debugLogger = createDebugLogger('REACT_TOOL_SCHEDULER');

export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => void;
export type MarkToolsAsSubmittedFn = (callIds: string[]) => void;
/**
 * Forcibly transition any non-terminal tool calls to a synthetic
 * `cancelled` state with `responseSubmittedToGemini=true`. Used by the
 * cancel handler to unblock `streamingState` when a tool ignores its
 * AbortSignal — the underlying process may keep running, but the UI
 * stops being held hostage by it. Returns the number of calls that
 * were force-cancelled (so callers can decide whether to surface a
 * notice).
 */
export type ForceCancelStaleToolCallsFn = () => number;

export type TrackedScheduledToolCall = ScheduledToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedValidatingToolCall = ValidatingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedWaitingToolCall = WaitingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedExecutingToolCall = ExecutingToolCall & {
  responseSubmittedToGemini?: boolean;
  pid?: number;
};
export type TrackedCompletedToolCall = CompletedToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedCancelledToolCall = CancelledToolCall & {
  responseSubmittedToGemini?: boolean;
};

export type TrackedToolCall =
  | TrackedScheduledToolCall
  | TrackedValidatingToolCall
  | TrackedWaitingToolCall
  | TrackedExecutingToolCall
  | TrackedCompletedToolCall
  | TrackedCancelledToolCall;

export function useReactToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => Promise<void>,
  config: Config,
  getPreferredEditor: () => EditorType | undefined,
  onEditorClose: () => void,
): [
  TrackedToolCall[],
  ScheduleFn,
  MarkToolsAsSubmittedFn,
  ForceCancelStaleToolCallsFn,
] {
  const [toolCallsForDisplay, setToolCallsForDisplay] = useState<
    TrackedToolCall[]
  >([]);

  const outputUpdateHandler: OutputUpdateHandler = useCallback(
    (toolCallId, outputChunk) => {
      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) => {
          if (tc.request.callId === toolCallId && tc.status === 'executing') {
            const executingTc = tc as TrackedExecutingToolCall;
            return { ...executingTc, liveOutput: outputChunk };
          }
          return tc;
        }),
      );
    },
    [],
  );

  const allToolCallsCompleteHandler: AllToolCallsCompleteHandler = useCallback(
    async (completedToolCalls) => {
      await onComplete(completedToolCalls);
    },
    [onComplete],
  );

  const toolCallsUpdateHandler: ToolCallsUpdateHandler = useCallback(
    (updatedCoreToolCalls: ToolCall[]) => {
      setToolCallsForDisplay((prevTrackedCalls) =>
        updatedCoreToolCalls.map((coreTc) => {
          const existingTrackedCall = prevTrackedCalls.find(
            (ptc) => ptc.request.callId === coreTc.request.callId,
          );
          // Start with the new core state, then layer on the existing UI state
          // to ensure UI-only properties like pid are preserved.
          const responseSubmittedToGemini =
            existingTrackedCall?.responseSubmittedToGemini ?? false;

          if (coreTc.status === 'executing') {
            return {
              ...coreTc,
              responseSubmittedToGemini,
              liveOutput: (existingTrackedCall as TrackedExecutingToolCall)
                ?.liveOutput,
              pid: (coreTc as ExecutingToolCall).pid,
            };
          }

          // For other statuses, explicitly set liveOutput and pid to undefined
          // to ensure they are not carried over from a previous executing state.
          return {
            ...coreTc,
            responseSubmittedToGemini,
            liveOutput: undefined,
            pid: undefined,
          };
        }),
      );
    },
    [setToolCallsForDisplay],
  );

  const scheduler = useMemo(
    () =>
      new CoreToolScheduler({
        config,
        chatRecordingService: config.getChatRecordingService(),
        outputUpdateHandler,
        onAllToolCallsComplete: allToolCallsCompleteHandler,
        onToolCallsUpdate: toolCallsUpdateHandler,
        getPreferredEditor,
        onEditorClose,
      }),
    [
      config,
      outputUpdateHandler,
      allToolCallsCompleteHandler,
      toolCallsUpdateHandler,
      getPreferredEditor,
      onEditorClose,
    ],
  );

  const schedule: ScheduleFn = useCallback(
    (
      request: ToolCallRequestInfo | ToolCallRequestInfo[],
      signal: AbortSignal,
    ) => {
      void scheduler.schedule(request, signal);
    },
    [scheduler],
  );

  const markToolsAsSubmitted: MarkToolsAsSubmittedFn = useCallback(
    (callIdsToMark: string[]) => {
      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) =>
          callIdsToMark.includes(tc.request.callId)
            ? { ...tc, responseSubmittedToGemini: true }
            : tc,
        ),
      );
    },
    [],
  );

  // Track how many calls were transitioned by the most recent
  // forceCancelStaleToolCalls invocation. The setter callback runs inside
  // setToolCallsForDisplay's reducer, so we need a side-channel ref to
  // return a synchronous count to the caller.
  const lastForceCancelledCountRef = useRef(0);

  const forceCancelStaleToolCalls: ForceCancelStaleToolCallsFn =
    useCallback(() => {
      lastForceCancelledCountRef.current = 0;
      setToolCallsForDisplay((prevCalls) => {
        let changed = 0;
        const next = prevCalls.map((tc): TrackedToolCall => {
          // Already terminal: just guarantee the submitted flag so
          // streamingState clears even if handleCompletedTools never ran.
          if (
            tc.status === 'success' ||
            tc.status === 'error' ||
            tc.status === 'cancelled'
          ) {
            if (tc.responseSubmittedToGemini) return tc;
            changed++;
            return { ...tc, responseSubmittedToGemini: true };
          }

          // Non-terminal: synthesize a cancelled response. The underlying
          // process may still be running — the UI stops waiting on it.
          changed++;
          const cancelled: TrackedCancelledToolCall = {
            request: tc.request,
            tool: 'tool' in tc ? tc.tool : undefined!,
            invocation: 'invocation' in tc ? tc.invocation : undefined!,
            status: 'cancelled',
            response: {
              callId: tc.request.callId,
              error: undefined,
              errorType: undefined,
              responseParts: [
                {
                  functionResponse: {
                    id: tc.request.callId,
                    name: tc.request.name,
                    response: {
                      error:
                        'User cancelled. Tool was force-cleared after the abort signal did not stop it within the grace window; the underlying process may still be running.',
                    },
                  },
                },
              ],
              resultDisplay:
                'Force-cancelled (tool did not honor AbortSignal in time).',
              contentLength: undefined,
            },
            durationMs: undefined,
            outcome: tc.outcome,
            responseSubmittedToGemini: true,
          };
          return cancelled;
        });
        lastForceCancelledCountRef.current = changed;
        return changed > 0 ? next : prevCalls;
      });
      return lastForceCancelledCountRef.current;
    }, []);

  return [
    toolCallsForDisplay,
    schedule,
    markToolsAsSubmitted,
    forceCancelStaleToolCalls,
  ];
}

/**
 * Maps a CoreToolScheduler status to the UI's ToolCallStatus enum.
 */
function mapCoreStatusToDisplayStatus(coreStatus: CoreStatus): ToolCallStatus {
  switch (coreStatus) {
    case 'validating':
      return ToolCallStatus.Executing;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    case 'error':
      return ToolCallStatus.Error;
    case 'scheduled':
      return ToolCallStatus.Pending;
    default: {
      const exhaustiveCheck: never = coreStatus;
      debugLogger.warn(`Unknown core status encountered: ${exhaustiveCheck}`);
      return ToolCallStatus.Error;
    }
  }
}

/**
 * Transforms `TrackedToolCall` objects into `HistoryItemToolGroup` objects for UI display.
 */
export function mapToDisplay(
  toolOrTools: TrackedToolCall[] | TrackedToolCall,
): HistoryItemToolGroup {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];

  const toolDisplays = toolCalls.map(
    (trackedCall): IndividualToolCallDisplay => {
      let displayName: string;
      let description: string;
      let renderOutputAsMarkdown = false;

      if (trackedCall.status === 'error') {
        displayName =
          trackedCall.tool === undefined
            ? trackedCall.request.name
            : trackedCall.tool.displayName;
        description = JSON.stringify(trackedCall.request.args);
      } else {
        displayName = trackedCall.tool.displayName;
        description = trackedCall.invocation.getDescription();
        renderOutputAsMarkdown = trackedCall.tool.isOutputMarkdown;
      }

      const baseDisplayProperties: Omit<
        IndividualToolCallDisplay,
        'status' | 'resultDisplay' | 'confirmationDetails'
      > = {
        callId: trackedCall.request.callId,
        name: displayName,
        description,
        renderOutputAsMarkdown,
      };

      switch (trackedCall.status) {
        case 'success':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay: trackedCall.response.resultDisplay,
            confirmationDetails: undefined,
          };
        case 'error':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay: trackedCall.response.resultDisplay,
            confirmationDetails: undefined,
          };
        case 'cancelled':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay: trackedCall.response.resultDisplay,
            confirmationDetails: undefined,
          };
        case 'awaiting_approval':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay: undefined,
            confirmationDetails: trackedCall.confirmationDetails,
          };
        case 'executing':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay:
              (trackedCall as TrackedExecutingToolCall).liveOutput ?? undefined,
            confirmationDetails: undefined,
            ptyId: (trackedCall as TrackedExecutingToolCall).pid,
          };
        case 'validating': // Fallthrough
        case 'scheduled':
          return {
            ...baseDisplayProperties,
            status: mapCoreStatusToDisplayStatus(trackedCall.status),
            resultDisplay: undefined,
            confirmationDetails: undefined,
          };
        default: {
          const exhaustiveCheck: never = trackedCall;
          return {
            callId: (exhaustiveCheck as TrackedToolCall).request.callId,
            name: 'Unknown Tool',
            description: 'Encountered an unknown tool call state.',
            status: ToolCallStatus.Error,
            resultDisplay: 'Unknown tool call state',
            confirmationDetails: undefined,
            renderOutputAsMarkdown: false,
          };
        }
      }
    },
  );

  return {
    type: 'tool_group',
    tools: toolDisplays,
  };
}
