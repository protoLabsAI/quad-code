/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 *
 * Disk capture helpers for background shell tasks.
 *
 * Unlike cc-2.18's DiskTaskOutput (which uses an in-process write queue
 * fed by Node-side stream listeners), protoCLI redirects the child's
 * stdout+stderr to disk at the shell level. The OS keeps writing even
 * after the parent wrapper exits, which is the whole point — we never
 * lose output to a detached process.
 *
 * These helpers compute paths and tail-read the file (with a cap so we
 * never load multi-GB outputs into memory).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/config.js';

const DEFAULT_MAX_READ_BYTES = 8 * 1024 * 1024; // 8 MB

/** Directory that holds all background-task output files for this session. */
export function getBackgroundTasksDir(config: Config): string {
  const storage = config.storage;
  if (!storage) {
    throw new Error('Config has no storage; cannot resolve tasks dir');
  }
  return path.join(storage.getProjectTempDir(), config.getSessionId(), 'tasks');
}

export function getBackgroundTaskOutputPath(
  config: Config,
  taskId: string,
): string {
  return path.join(getBackgroundTasksDir(config), `${taskId}.output`);
}

export function getBackgroundTaskExitPath(
  config: Config,
  taskId: string,
): string {
  return path.join(getBackgroundTasksDir(config), `${taskId}.exit`);
}

export function getBackgroundTaskPidPath(
  config: Config,
  taskId: string,
): string {
  return path.join(getBackgroundTasksDir(config), `${taskId}.pid`);
}

export async function ensureBackgroundTasksDir(config: Config): Promise<void> {
  await fs.mkdir(getBackgroundTasksDir(config), { recursive: true });
}

/**
 * Read the tail of a task's output file. Returns the empty string if the
 * file doesn't exist yet — callers should treat that as "no output yet."
 */
export async function readBackgroundTaskOutput(
  config: Config,
  taskId: string,
  maxBytes: number = DEFAULT_MAX_READ_BYTES,
): Promise<string> {
  const outputPath = getBackgroundTaskOutputPath(config, taskId);
  try {
    const stat = await fs.stat(outputPath);
    if (stat.size <= maxBytes) {
      return await fs.readFile(outputPath, 'utf8');
    }
    const fh = await fs.open(outputPath, 'r');
    try {
      const offset = stat.size - maxBytes;
      const buf = Buffer.alloc(maxBytes);
      await fh.read(buf, 0, maxBytes, offset);
      return (
        `[${Math.round(offset / 1024)}KB of earlier output omitted]\n` +
        buf.toString('utf8')
      );
    } finally {
      await fh.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

/** Best-effort read of the exit code sentinel; returns null if absent. */
export async function readBackgroundTaskExit(
  config: Config,
  taskId: string,
): Promise<number | null> {
  try {
    const text = await fs.readFile(
      getBackgroundTaskExitPath(config, taskId),
      'utf8',
    );
    const n = Number.parseInt(text.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

/** Best-effort read of the pid sentinel; returns null if absent. */
export async function readBackgroundTaskPid(
  config: Config,
  taskId: string,
): Promise<number | null> {
  try {
    const text = await fs.readFile(
      getBackgroundTaskPidPath(config, taskId),
      'utf8',
    );
    const n = Number.parseInt(text.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}
