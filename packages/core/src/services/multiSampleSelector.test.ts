/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildRetryPrompt,
  runWithMultiSample,
  shouldRetry,
  formatMultiSampleResult,
  DEFAULT_TEMPERATURES,
} from './multiSampleSelector.js';
import { AgentTerminateMode } from '../agents/runtime/agent-types.js';

// Mock OTel to avoid span infrastructure in tests
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        addEvent: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      }),
    }),
  },
  SpanKind: { INTERNAL: 'INTERNAL' },
  SpanStatusCode: { OK: 'OK', ERROR: 'ERROR' },
  context: { active: () => ({}) },
}));

vi.mock('../telemetry/turnSpanContext.js', () => ({
  getActiveTurnContext: () => null,
}));

// BehaviorVerifyGate mock — no scenarios by default
vi.mock('./behaviorVerifyGate.js', () => ({
  BehaviorVerifyGate: {
    loadScenarios: vi.fn().mockResolvedValue([]),
    runScenarios: vi.fn().mockResolvedValue([]),
    gateMessage: vi.fn().mockReturnValue(null),
  },
}));

describe('shouldRetry', () => {
  it('returns true for ERROR', () => {
    expect(shouldRetry(AgentTerminateMode.ERROR)).toBe(true);
  });
  it('returns true for MAX_TURNS', () => {
    expect(shouldRetry(AgentTerminateMode.MAX_TURNS)).toBe(true);
  });
  it('returns true for TIMEOUT', () => {
    expect(shouldRetry(AgentTerminateMode.TIMEOUT)).toBe(true);
  });
  it('returns false for GOAL', () => {
    expect(shouldRetry(AgentTerminateMode.GOAL)).toBe(false);
  });
  it('returns false for CANCELLED', () => {
    expect(shouldRetry(AgentTerminateMode.CANCELLED)).toBe(false);
  });
});

describe('buildRetryPrompt', () => {
  it('returns original prompt when no previous attempts', () => {
    expect(buildRetryPrompt('do thing', [])).toBe('do thing');
  });

  it('injects failure context from previous attempt', () => {
    const result = buildRetryPrompt('do thing', [
      {
        attempt: 0,
        temperature: 0.7,
        terminateMode: AgentTerminateMode.ERROR,
        finalText: 'it broke',
        gatePass: null,
        score: 0,
      },
    ]);
    expect(result).toContain('do thing');
    expect(result).toContain('RETRY CONTEXT');
    expect(result).toContain('it broke');
    expect(result).toContain('temp=0.7');
  });

  it('labels GOAL+gate fail as "completed but failed behavior verification"', () => {
    const result = buildRetryPrompt('do thing', [
      {
        attempt: 0,
        temperature: 0.7,
        terminateMode: AgentTerminateMode.GOAL,
        finalText: 'done',
        gatePass: false,
        score: 2,
      },
    ]);
    expect(result).toContain('completed but failed behavior verification');
  });
});

describe('runWithMultiSample', () => {
  it('returns immediately on first-attempt success', async () => {
    const runAttempt = vi.fn().mockResolvedValue({
      terminateMode: AgentTerminateMode.GOAL,
      finalText: 'success',
    });

    const result = await runWithMultiSample('task', [], '/tmp', runAttempt, {
      maxAttempts: 3,
    });

    expect(runAttempt).toHaveBeenCalledTimes(1);
    expect(result.best.terminateMode).toBe(AgentTerminateMode.GOAL);
    expect(result.best.score).toBe(3);
    expect(result.success).toBe(true);
  });

  it('retries on failure and returns best result', async () => {
    const runAttempt = vi
      .fn()
      .mockResolvedValueOnce({
        terminateMode: AgentTerminateMode.ERROR,
        finalText: 'fail1',
      })
      .mockResolvedValueOnce({
        terminateMode: AgentTerminateMode.MAX_TURNS,
        finalText: 'partial',
      })
      .mockResolvedValueOnce({
        terminateMode: AgentTerminateMode.GOAL,
        finalText: 'success',
      });

    const result = await runWithMultiSample('task', [], '/tmp', runAttempt, {
      maxAttempts: 3,
    });

    expect(runAttempt).toHaveBeenCalledTimes(3);
    expect(result.best.terminateMode).toBe(AgentTerminateMode.GOAL);
    expect(result.best.score).toBe(3);
    expect(result.attempts).toHaveLength(3);
  });

  it('uses escalating temperatures from the ladder', async () => {
    const temps: number[] = [];
    const runAttempt = vi.fn().mockImplementation(async (_prompt, temp) => {
      temps.push(temp);
      return { terminateMode: AgentTerminateMode.ERROR, finalText: '' };
    });

    await runWithMultiSample('task', [], '/tmp', runAttempt, {
      maxAttempts: 3,
    });

    expect(temps).toEqual([
      DEFAULT_TEMPERATURES[0],
      DEFAULT_TEMPERATURES[1],
      DEFAULT_TEMPERATURES[2],
    ]);
  });

  it('injects failure context into retry prompts', async () => {
    const prompts: string[] = [];
    const runAttempt = vi.fn().mockImplementation(async (prompt) => {
      prompts.push(prompt);
      return { terminateMode: AgentTerminateMode.ERROR, finalText: 'fail' };
    });

    await runWithMultiSample('original task', [], '/tmp', runAttempt, {
      maxAttempts: 2,
    });

    expect(prompts[0]).toBe('original task');
    expect(prompts[1]).toContain('original task');
    expect(prompts[1]).toContain('RETRY CONTEXT');
  });

  it('picks best result even if all fail', async () => {
    const runAttempt = vi
      .fn()
      .mockResolvedValueOnce({
        terminateMode: AgentTerminateMode.ERROR,
        finalText: 'err',
      })
      .mockResolvedValueOnce({
        terminateMode: AgentTerminateMode.MAX_TURNS,
        finalText: 'partial',
      });

    const result = await runWithMultiSample('task', [], '/tmp', runAttempt, {
      maxAttempts: 2,
    });

    // MAX_TURNS scores 1, ERROR scores 0 → best is MAX_TURNS
    expect(result.best.terminateMode).toBe(AgentTerminateMode.MAX_TURNS);
    expect(result.best.score).toBe(1);
    expect(result.success).toBe(false);
  });
});

describe('formatMultiSampleResult', () => {
  it('formats a single successful attempt', () => {
    const result = formatMultiSampleResult({
      attempts: [
        {
          attempt: 0,
          temperature: 0.7,
          terminateMode: AgentTerminateMode.GOAL,
          finalText: '',
          gatePass: null,
          score: 3,
        },
      ],
      best: {
        attempt: 0,
        temperature: 0.7,
        terminateMode: AgentTerminateMode.GOAL,
        finalText: '',
        gatePass: null,
        score: 3,
      },
      success: true,
    });
    expect(result).toContain('1 attempt(s)');
    expect(result).toContain('SUCCESS');
  });

  it('shows all attempts with gate status', () => {
    const result = formatMultiSampleResult({
      attempts: [
        {
          attempt: 0,
          temperature: 0.7,
          terminateMode: AgentTerminateMode.ERROR,
          finalText: '',
          gatePass: null,
          score: 0,
        },
        {
          attempt: 1,
          temperature: 1.0,
          terminateMode: AgentTerminateMode.GOAL,
          finalText: '',
          gatePass: false,
          score: 2,
        },
      ],
      best: {
        attempt: 1,
        temperature: 1.0,
        terminateMode: AgentTerminateMode.GOAL,
        finalText: '',
        gatePass: false,
        score: 2,
      },
      success: true,
    });
    expect(result).toContain('2 attempt(s)');
    expect(result).toContain('FAILED');
    expect(result).toContain('COMPLETED');
    expect(result).toContain('gate: FAIL');
  });
});
