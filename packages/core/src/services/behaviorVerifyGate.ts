/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { recordVerificationFailure } from '../telemetry/harnessTelemetry.js';

export interface VerifyScenario {
  name: string;
  command: string; // shell command to run
  expectedPattern?: string; // optional regex that stdout/stderr must match
  timeoutMs?: number; // default 30_000
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  output: string; // truncated stdout/stderr (max 500 chars)
  durationMs: number;
  failReason?: 'exit_code' | 'pattern_mismatch' | 'timeout';
}

export class BehaviorVerifyGate {
  /**
   * Load verify scenarios from `.proto/verify-scenarios.json` in the project root.
   * Returns [] if the file is missing or invalid — never throws.
   */
  static async loadScenarios(projectRoot: string): Promise<VerifyScenario[]> {
    const scenariosPath = join(projectRoot, '.proto', 'verify-scenarios.json');
    try {
      const raw = await readFile(scenariosPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as VerifyScenario[];
    } catch {
      return [];
    }
  }

  /**
   * Run all scenarios in parallel. Each gets its own timeout.
   * Catches all errors gracefully — never throws.
   */
  static async runScenarios(
    scenarios: VerifyScenario[],
    cwd: string,
  ): Promise<ScenarioResult[]> {
    return Promise.all(
      scenarios.map((scenario) =>
        BehaviorVerifyGate.runScenario(scenario, cwd),
      ),
    );
  }

  private static runScenario(
    scenario: VerifyScenario,
    cwd: string,
  ): Promise<ScenarioResult> {
    const timeoutMs = scenario.timeoutMs ?? 30_000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const parts = scenario.command.split(/\s+/);
      const cmd = parts[0]!;
      const args = parts.slice(1);

      const child = execFile(
        cmd,
        args,
        { cwd, timeout: timeoutMs, maxBuffer: 1024 * 100 },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const rawOutput = (stdout + stderr).trim();
          const output =
            rawOutput.length > 500
              ? rawOutput.slice(0, 500) + '...(truncated)'
              : rawOutput;

          if (error) {
            // Check if it's a timeout
            const isTimeout =
              error.killed === true ||
              (error as NodeJS.ErrnoException & { code?: string | number })
                .code === 'ETIMEDOUT';

            if (isTimeout) {
              resolve({
                name: scenario.name,
                passed: false,
                output,
                durationMs,
                failReason: 'timeout',
              });
              return;
            }

            // Non-zero exit code
            resolve({
              name: scenario.name,
              passed: false,
              output,
              durationMs,
              failReason: 'exit_code',
            });
            return;
          }

          // Exit code 0 — check pattern if provided
          if (scenario.expectedPattern) {
            const regex = new RegExp(scenario.expectedPattern);
            const combined = stdout + stderr;
            if (!regex.test(combined)) {
              resolve({
                name: scenario.name,
                passed: false,
                output,
                durationMs,
                failReason: 'pattern_mismatch',
              });
              return;
            }
          }

          resolve({
            name: scenario.name,
            passed: true,
            output,
            durationMs,
          });
        },
      );

      // Handle spawn errors (e.g., command not found before the callback fires)
      child.on('error', (spawnError) => {
        const durationMs = Date.now() - startTime;
        resolve({
          name: scenario.name,
          passed: false,
          output: spawnError.message.slice(0, 500),
          durationMs,
          failReason: 'exit_code',
        });
      });
    });
  }

  /**
   * Format results as a human-readable summary string.
   */
  static formatResults(results: ScenarioResult[]): string {
    const lines: string[] = ['[Behavior Verification Results]'];
    for (const r of results) {
      const status = r.passed ? 'PASS' : 'FAIL';
      const reason = r.failReason ? ` (${r.failReason})` : '';
      lines.push(`  ${status} — ${r.name}${reason} [${r.durationMs}ms]`);
      if (!r.passed && r.output) {
        lines.push(`    Output: ${r.output}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Returns a structured remediation message if any scenario failed,
   * or null if all passed.
   *
   * Also records telemetry for each failed scenario.
   */
  static gateMessage(results: ScenarioResult[]): string | null {
    const failed = results.filter((r) => !r.passed);
    if (failed.length === 0) return null;

    const lines: string[] = [
      `[Behavior Verification Gate — ${failed.length} of ${results.length} scenario(s) FAILED]`,
      '',
      'The following end-to-end scenarios did not pass after your changes:',
    ];

    for (const r of failed) {
      const reason = r.failReason ? ` [${r.failReason}]` : '';
      lines.push(`\n  FAIL — ${r.name}${reason}`);
      if (r.output) {
        lines.push(`  Output:\n    ${r.output.replace(/\n/g, '\n    ')}`);
      }
    }

    lines.push(
      '',
      'Remediation:',
      '1. Read each failure above carefully — identify which change caused it',
      '2. Fix the root cause before declaring the task complete',
      '3. Do not mark the task as done until all behavior scenarios pass',
    );

    const message = lines.join('\n');

    // Record telemetry for each failure
    for (const r of failed) {
      recordVerificationFailure({
        command: r.name,
        exitCode: r.failReason ?? 'non-zero',
        outputSnippet: r.output,
        recoveryMessage: message,
      });
    }

    return message;
  }
}
