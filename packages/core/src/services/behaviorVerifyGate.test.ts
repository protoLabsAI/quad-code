/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorVerifyGate } from './behaviorVerifyGate.js';
import * as path from 'node:path';
import * as os from 'node:os';
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('../telemetry/harnessTelemetry.js', () => ({
  recordVerificationFailure: vi.fn(),
}));

// Get the mocked module
const mockedFs = await import('node:fs/promises');

describe('BehaviorVerifyGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // loadScenarios
  // ---------------------------------------------------------------------------
  describe('loadScenarios', () => {
    it('returns [] when the file is missing', async () => {
      vi.mocked(mockedFs.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      const result = await BehaviorVerifyGate.loadScenarios('/some/project');
      expect(result).toEqual([]);
    });

    it('returns [] when the file contains invalid JSON', async () => {
      vi.mocked(mockedFs.readFile).mockResolvedValue('not-json' as never);
      const result = await BehaviorVerifyGate.loadScenarios('/some/project');
      expect(result).toEqual([]);
    });

    it('returns [] when the file contains a non-array value', async () => {
      vi.mocked(mockedFs.readFile).mockResolvedValue(
        JSON.stringify({ name: 'not-an-array' }) as never,
      );
      const result = await BehaviorVerifyGate.loadScenarios('/some/project');
      expect(result).toEqual([]);
    });

    it('parses and returns scenarios from a valid file', async () => {
      const scenarios = [
        { name: 'test', command: 'npm test', timeoutMs: 60000 },
      ];
      vi.mocked(mockedFs.readFile).mockResolvedValue(
        JSON.stringify(scenarios) as never,
      );
      const result = await BehaviorVerifyGate.loadScenarios('/some/project');
      expect(result).toEqual(scenarios);
    });

    it('reads from .proto/verify-scenarios.json inside the project root', async () => {
      vi.mocked(mockedFs.readFile).mockResolvedValue('[]' as never);
      await BehaviorVerifyGate.loadScenarios('/my/project');
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.join('/my/project', '.proto', 'verify-scenarios.json'),
        'utf-8',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // runScenarios — these tests run real shell commands (not mocked)
  // ---------------------------------------------------------------------------
  describe('runScenarios', () => {
    it('passes a scenario when the command exits 0', async () => {
      const [result] = await BehaviorVerifyGate.runScenarios(
        [{ name: 'echo test', command: 'echo ok' }],
        process.cwd(),
      );
      expect(result!.passed).toBe(true);
      expect(result!.name).toBe('echo test');
      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
      expect(result!.failReason).toBeUndefined();
    });

    it('fails a scenario when the command exits non-zero', async () => {
      const [result] = await BehaviorVerifyGate.runScenarios(
        // 'false' is a POSIX command that always exits 1
        [{ name: 'fail cmd', command: 'false' }],
        process.cwd(),
      );
      expect(result!.passed).toBe(false);
      expect(result!.failReason).toBe('exit_code');
    });

    it('passes when expectedPattern matches stdout', async () => {
      const [result] = await BehaviorVerifyGate.runScenarios(
        [
          {
            name: 'pattern match',
            command: 'echo hello-world',
            expectedPattern: 'hello',
          },
        ],
        process.cwd(),
      );
      expect(result!.passed).toBe(true);
      expect(result!.failReason).toBeUndefined();
    });

    it('fails with pattern_mismatch when expectedPattern does not match', async () => {
      const [result] = await BehaviorVerifyGate.runScenarios(
        [
          {
            name: 'pattern mismatch',
            command: 'echo goodbye',
            expectedPattern: 'hello',
          },
        ],
        process.cwd(),
      );
      expect(result!.passed).toBe(false);
      expect(result!.failReason).toBe('pattern_mismatch');
    });

    it('truncates output longer than 500 chars', async () => {
      // Write a real temp script file to avoid shell-quoting issues with execFile.
      // Use execFileSync from child_process to write the file (bypasses fs mock).
      const { execFileSync } = await import('node:child_process');
      const tmpFile = path.join(os.tmpdir(), `bhvr-gate-test-${Date.now()}.js`);
      // Use printf via shell to write the file
      execFileSync('sh', [
        '-c',
        `printf "process.stdout.write('x'.repeat(600));" > ${tmpFile}`,
      ]);
      try {
        const nodePath = process.execPath;
        const [result] = await BehaviorVerifyGate.runScenarios(
          [{ name: 'long output', command: `${nodePath} ${tmpFile}` }],
          process.cwd(),
        );
        expect(result!.passed).toBe(true);
        expect(result!.output.length).toBeLessThanOrEqual(515);
        expect(result!.output).toContain('...(truncated)');
      } finally {
        execFileSync('rm', ['-f', tmpFile]);
      }
    });

    it('runs multiple scenarios in parallel and returns all results', async () => {
      const results = await BehaviorVerifyGate.runScenarios(
        [
          { name: 'pass', command: 'echo ok' },
          { name: 'fail', command: 'false' },
        ],
        process.cwd(),
      );
      expect(results).toHaveLength(2);
      expect(results.find((r) => r.name === 'pass')!.passed).toBe(true);
      expect(results.find((r) => r.name === 'fail')!.passed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // gateMessage
  // ---------------------------------------------------------------------------
  describe('gateMessage', () => {
    it('returns null when all scenarios pass', () => {
      const results = [
        { name: 'a', passed: true, output: '', durationMs: 10 },
        { name: 'b', passed: true, output: '', durationMs: 20 },
      ];
      expect(BehaviorVerifyGate.gateMessage(results)).toBeNull();
    });

    it('returns a non-null message when any scenario fails', () => {
      const results = [
        { name: 'a', passed: true, output: '', durationMs: 10 },
        {
          name: 'b',
          passed: false,
          output: 'Error: something went wrong',
          durationMs: 20,
          failReason: 'exit_code' as const,
        },
      ];
      const msg = BehaviorVerifyGate.gateMessage(results);
      expect(msg).not.toBeNull();
      expect(msg).toContain('FAIL');
      expect(msg).toContain('b');
      expect(msg).toContain('Error: something went wrong');
    });

    it('includes remediation instructions in the message', () => {
      const results = [
        {
          name: 'test',
          passed: false,
          output: 'oops',
          durationMs: 5,
          failReason: 'exit_code' as const,
        },
      ];
      const msg = BehaviorVerifyGate.gateMessage(results);
      expect(msg).toContain('Remediation');
    });

    it('calls recordVerificationFailure for each failed scenario', async () => {
      const { recordVerificationFailure } = await import(
        '../telemetry/harnessTelemetry.js'
      );
      const results = [
        {
          name: 'fail1',
          passed: false,
          output: 'err1',
          durationMs: 1,
          failReason: 'exit_code' as const,
        },
        {
          name: 'fail2',
          passed: false,
          output: 'err2',
          durationMs: 2,
          failReason: 'timeout' as const,
        },
        { name: 'pass', passed: true, output: '', durationMs: 3 },
      ];
      BehaviorVerifyGate.gateMessage(results);
      expect(recordVerificationFailure).toHaveBeenCalledTimes(2);
      expect(recordVerificationFailure).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'fail1' }),
      );
      expect(recordVerificationFailure).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'fail2' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // formatResults
  // ---------------------------------------------------------------------------
  describe('formatResults', () => {
    it('formats pass and fail results correctly', () => {
      const results = [
        { name: 'unit tests', passed: true, output: '', durationMs: 100 },
        {
          name: 'build',
          passed: false,
          output: 'build error',
          durationMs: 50,
          failReason: 'exit_code' as const,
        },
      ];
      const formatted = BehaviorVerifyGate.formatResults(results);
      expect(formatted).toContain('PASS');
      expect(formatted).toContain('FAIL');
      expect(formatted).toContain('unit tests');
      expect(formatted).toContain('build');
      expect(formatted).toContain('build error');
    });
  });
});
