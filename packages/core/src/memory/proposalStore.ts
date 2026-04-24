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
 * Returns true if `filePath` is contained within `dir` (no path traversal).
 */
function isInsideDir(dir: string, filePath: string): boolean {
  const rel = path.relative(dir, filePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Accept a proposal by moving it from proposals/ to the memory directory.
 * Returns the path of the accepted file, or null if the source does not exist
 * or if the path is outside the proposals directory.
 */
export async function acceptProposal(
  proposalFilePath: string,
  scope: MemoryScope,
  cwd?: string,
): Promise<string | null> {
  const proposalsDir = getProposalsDir(scope, cwd);
  const resolvedProposal = path.resolve(proposalFilePath);
  const resolvedProposalsDir = path.resolve(proposalsDir);

  if (!isInsideDir(resolvedProposalsDir, resolvedProposal)) {
    return null;
  }

  const memoryDir = getMemoryDir(scope, cwd);
  const basename = path.basename(resolvedProposal);
  let destPath = path.join(memoryDir, basename);

  // Avoid silently overwriting an existing memory file
  if (
    await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false)
  ) {
    const ext = path.extname(basename);
    const stem = path.basename(basename, ext);
    destPath = path.join(memoryDir, `${stem}-${Date.now()}${ext}`);
  }

  try {
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.rename(resolvedProposal, destPath);
    await regenerateIndex(scope, cwd);
    return destPath;
  } catch {
    return null;
  }
}

/**
 * Reject (delete) a proposal file.
 * Returns false if the path is outside the proposals directory.
 */
export async function rejectProposal(
  proposalFilePath: string,
  scope: MemoryScope,
  cwd?: string,
): Promise<boolean> {
  const proposalsDir = getProposalsDir(scope, cwd);
  const resolvedProposal = path.resolve(proposalFilePath);
  const resolvedProposalsDir = path.resolve(proposalsDir);

  if (!isInsideDir(resolvedProposalsDir, resolvedProposal)) {
    return false;
  }

  try {
    await fs.unlink(resolvedProposal);
    return true;
  } catch {
    return false;
  }
}
