/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

export type BackgroundShellStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed';

export interface BackgroundShellTask {
  /** Stable opaque ID — used in tool returns, /bg, and bg_stop. */
  id: string;
  /** The command line as the model wrote it. */
  command: string;
  /** Short human-readable description (often a truncated command). */
  description: string;
  /** Working directory. */
  cwd: string;
  /** ms epoch when the task was registered. */
  startTime: number;
  /** ms epoch when the task exited (any terminal status). */
  endTime?: number;
  status: BackgroundShellStatus;
  /** Process exit code if known. Null when killed by signal with no clean code. */
  exitCode?: number | null;
  /** Absolute path where stdout+stderr is being captured. */
  outputPath: string;
  /** PID of the spawned shell wrapper (used by bg_stop to signal the group). */
  pid?: number;
  /** True once the model has been informed of completion via task_notification. */
  notified: boolean;
}

export interface BackgroundShellRegistrationInput {
  id: string;
  command: string;
  description: string;
  cwd: string;
  outputPath: string;
  pid?: number;
}
