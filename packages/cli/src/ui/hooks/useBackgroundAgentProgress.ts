/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type {
  BgAgentStarted,
  BgAgentRound,
  BgAgentToolCall,
  BgAgentFinished,
  BgAgentFailed,
} from '@qwen-code/qwen-code-core';
import { backgroundProgressEmitter } from '@qwen-code/qwen-code-core';

export interface ActiveAgentState {
  agentId: string;
  agentName: string;
  round: number;
  toolName?: string;
  startedAt: number;
}

/**
 * Subscribes to the global backgroundProgressEmitter and returns a snapshot
 * of all currently-running background agents with their latest activity.
 *
 * Agents are added on `agent_started` and removed on `agent_finished` /
 * `agent_failed`. The returned map is stable (new object only on changes).
 */
export function useBackgroundAgentProgress(): {
  activeAgents: ActiveAgentState[];
  lastFinished: (BgAgentFinished & { agentName: string }) | null;
} {
  const [activeAgents, setActiveAgents] = useState<
    Map<string, ActiveAgentState>
  >(new Map());
  const [lastFinished, setLastFinished] = useState<
    (BgAgentFinished & { agentName: string }) | null
  >(null);

  useEffect(() => {
    const onStarted = (payload: BgAgentStarted) => {
      setActiveAgents((prev) => {
        const next = new Map(prev);
        next.set(payload.agentId, {
          agentId: payload.agentId,
          agentName: payload.agentName,
          round: 0,
          startedAt: payload.timestamp,
        });
        return next;
      });
    };

    const onRound = (payload: BgAgentRound) => {
      setActiveAgents((prev) => {
        const entry = prev.get(payload.agentId);
        if (!entry) return prev;
        const next = new Map(prev);
        next.set(payload.agentId, {
          ...entry,
          round: payload.round,
          toolName: undefined, // clear tool name on new round
        });
        return next;
      });
    };

    const onToolCall = (payload: BgAgentToolCall) => {
      setActiveAgents((prev) => {
        const entry = prev.get(payload.agentId);
        if (!entry) return prev;
        const next = new Map(prev);
        next.set(payload.agentId, { ...entry, toolName: payload.toolName });
        return next;
      });
    };

    const onFinished = (payload: BgAgentFinished) => {
      setActiveAgents((prev) => {
        const next = new Map(prev);
        next.delete(payload.agentId);
        return next;
      });
      setLastFinished({ ...payload, agentName: payload.agentName });
    };

    const onFailed = (payload: BgAgentFailed) => {
      setActiveAgents((prev) => {
        const next = new Map(prev);
        next.delete(payload.agentId);
        return next;
      });
      // Surface failures as a synthetic finished event with hitLimit=false
      setLastFinished({
        agentId: payload.agentId,
        agentName: payload.agentName,
        terminateReason: 'error',
        hitLimit: false,
        rounds: 0,
        durationMs: 0,
        timestamp: payload.timestamp,
      });
    };

    backgroundProgressEmitter.on('agent_started', onStarted);
    backgroundProgressEmitter.on('agent_round', onRound);
    backgroundProgressEmitter.on('agent_tool_call', onToolCall);
    backgroundProgressEmitter.on('agent_finished', onFinished);
    backgroundProgressEmitter.on('agent_failed', onFailed);

    return () => {
      backgroundProgressEmitter.off('agent_started', onStarted);
      backgroundProgressEmitter.off('agent_round', onRound);
      backgroundProgressEmitter.off('agent_tool_call', onToolCall);
      backgroundProgressEmitter.off('agent_finished', onFinished);
      backgroundProgressEmitter.off('agent_failed', onFailed);
    };
  }, []);

  return {
    activeAgents: Array.from(activeAgents.values()),
    lastFinished,
  };
}
