/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseFrontmatter } from './frontmatterParser.js';
import { getMemoryDir, regenerateIndex } from './memoryStore.js';
import type { MemoryFile, MemoryScope } from './types.js';
import { ENTRYPOINT_NAME, FRONTMATTER_MAX_LINES } from './types.js';

export const PROPOSALS_DIR_NAME = 'proposals';

/**
 * Returns the proposals directory for a given scope.
 */
export function getProposalsDir(scope: MemoryScope, cwd?: string): string {
  return path.join(getMemoryDir(scope, cwd), PROPOSALS_DIR_NAME);
}

/**
 * List all pending proposal files in the proposals directory.
 */
export async function listProposals(
  scope: MemoryScope,
  cwd?: string,
): Promise<MemoryFile[]> {
  const proposalsDir = getProposalsDir(scope, cwd);
  let entries: string[];

  try {
    entries = await fs.readdir(proposalsDir);
  } catch {
    return [];
  }

  const mdFiles = entries.filter(
    (f) => f.endsWith('.md') && f !== ENTRYPOINT_NAME,
  );

  const results: MemoryFile[] = [];
  await Promise.allSettled(
    mdFiles.map(async (filename) => {
      const filePath = path.join(proposalsDir, filename);
      try {
        const handle = await fs.open(filePath, 'r');
        try {
          const buf = Buffer.alloc(4096);
          const { bytesRead } = await handle.read(buf, 0, 4096, 0);
          const raw = buf.toString('utf-8', 0, bytesRead);
          const lines = raw.split('\n').slice(0, FRONTMATTER_MAX_LINES);
          const { header, body } = parseFrontmatter(lines.join('\n'));
          if (header) {
            const stat = await fs.stat(filePath);
            results.push({
              header,
              content: body,
              filePath,
              mtimeMs: stat.mtimeMs,
            });
          }
        } finally {
          await handle.close();
        }
      } catch {
        // Skip unreadable files
      }
    }),
  );

  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

/**
 * Accept a proposal by moving it from proposals/ to the memory directory.
 * Returns the path of the accepted file, or null if the source does not exist.
 */
export async function acceptProposal(
  proposalFilePath: string,
  scope: MemoryScope,
  cwd?: string,
): Promise<string | null> {
  const memoryDir = getMemoryDir(scope, cwd);
  const destPath = path.join(memoryDir, path.basename(proposalFilePath));

  try {
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.rename(proposalFilePath, destPath);
    await regenerateIndex(scope, cwd);
    return destPath;
  } catch {
    return null;
  }
}

/**
 * Reject (delete) a proposal file.
 */
export async function rejectProposal(
  proposalFilePath: string,
): Promise<boolean> {
  try {
    await fs.unlink(proposalFilePath);
    return true;
  } catch {
    return false;
  }
}
