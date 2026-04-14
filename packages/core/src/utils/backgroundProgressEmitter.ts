/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Global singleton event bus for background agent progress.
 *
 * Background agents (session memory extractor, AgentTool background workers)
 * emit their lifecycle events here. The CLI layer subscribes to surface
 * progress in the UI without polling or blocking the main agent loop.
 *
 * Usage:
 *   // In core — forward a local AgentEventEmitter into this bus:
 *   import { bridgeToProgressBus } from './backgroundProgressEmitter.js';
 *   const emitter = new AgentEventEmitter();
 *   bridgeToProgressBus(emitter, agentName, agentId);
 *
 *   // In CLI — subscribe:
 *   import { backgroundProgressEmitter } from '@qwen-code/qwen-code-core';
 *   backgroundProgressEmitter.on('agent_start', handler);
 */

import { EventEmitter } from 'node:events';
import type { AgentEventEmitter } from '../agents/runtime/agent-events.js';
import { AgentEventType } from '../agents/runtime/agent-events.js';
import type { AgentTerminateMode } from '../agents/runtime/agent-types.js';

// ─── Event Payloads ──────────────────────────────────────────────────────────

export interface BgAgentStarted {
  agentId: string;
  agentName: string;
  timestamp: number;
}

export interface BgAgentRound {
  agentId: string;
  agentName: string;
  round: number;
  timestamp: number;
}

export interface BgAgentToolCall {
  agentId: string;
  agentName: string;
  round: number;
  toolName: string;
  timestamp: number;
}

export interface BgAgentFinished {
  agentId: string;
  agentName: string;
  terminateReason: AgentTerminateMode | string;
  /** True if the agent hit its turn or time limit rather than completing normally. */
  hitLimit: boolean;
  rounds: number;
  durationMs: number;
  timestamp: number;
}

export interface BgAgentFailed {
  agentId: string;
  agentName: string;
  error: string;
  timestamp: number;
}

export type BgProgressEventMap = {
  agent_started: BgAgentStarted;
  agent_round: BgAgentRound;
  agent_tool_call: BgAgentToolCall;
  agent_finished: BgAgentFinished;
  agent_failed: BgAgentFailed;
};

// ─── Typed Emitter ───────────────────────────────────────────────────────────

class BackgroundProgressEmitter extends EventEmitter {
  override on<K extends keyof BgProgressEventMap>(
    event: K,
    listener: (payload: BgProgressEventMap[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof BgProgressEventMap>(
    event: K,
    listener: (payload: BgProgressEventMap[K]) => void,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof BgProgressEventMap>(
    event: K,
    payload: BgProgressEventMap[K],
  ): boolean {
    return super.emit(event, payload);
  }
}

export const backgroundProgressEmitter = new BackgroundProgressEmitter();

// ─── Bridge Helper ───────────────────────────────────────────────────────────

/**
 * Subscribes to a local AgentEventEmitter and forwards selected events to the
 * global backgroundProgressEmitter under the agent's name/id identity.
 *
 * Call this just before starting a background agent. The bridge is
 * automatically cleaned up when the FINISH or ERROR event fires.
 */
export function bridgeToProgressBus(
  source: AgentEventEmitter,
  agentName: string,
  agentId: string,
): void {
  const startTime = Date.now();

  const onStart = () => {
    backgroundProgressEmitter.emit('agent_started', {
      agentId,
      agentName,
      timestamp: Date.now(),
    });
  };

  const onRound = (payload: { round: number }) => {
    backgroundProgressEmitter.emit('agent_round', {
      agentId,
      agentName,
      round: payload.round,
      timestamp: Date.now(),
    });
  };

  const onToolCall = (payload: { name: string; round: number }) => {
    backgroundProgressEmitter.emit('agent_tool_call', {
      agentId,
      agentName,
      round: payload.round,
      toolName: payload.name,
      timestamp: Date.now(),
    });
  };

  const onFinish = (payload: {
    terminateReason: string;
    rounds?: number;
    totalDurationMs?: number;
  }) => {
    const hitLimit =
      payload.terminateReason === 'max_turns' ||
      payload.terminateReason === 'timeout';
    backgroundProgressEmitter.emit('agent_finished', {
      agentId,
      agentName,
      terminateReason: payload.terminateReason,
      hitLimit,
      rounds: payload.rounds ?? 0,
      durationMs: payload.totalDurationMs ?? Date.now() - startTime,
      timestamp: Date.now(),
    });
    cleanup();
  };

  const onError = (payload: { error: string }) => {
    backgroundProgressEmitter.emit('agent_failed', {
      agentId,
      agentName,
      error: payload.error,
      timestamp: Date.now(),
    });
    cleanup();
  };

  function cleanup() {
    source.off(AgentEventType.START, onStart);
    source.off(AgentEventType.ROUND_START, onRound);
    source.off(AgentEventType.TOOL_CALL, onToolCall);
    source.off(AgentEventType.FINISH, onFinish);
    source.off(AgentEventType.ERROR, onError);
  }

  source.on(AgentEventType.START, onStart);
  source.on(AgentEventType.ROUND_START, onRound);
  source.on(AgentEventType.TOOL_CALL, onToolCall);
  source.on(AgentEventType.FINISH, onFinish);
  source.on(AgentEventType.ERROR, onError);
}
