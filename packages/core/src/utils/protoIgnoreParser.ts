/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';

export interface ProtoIgnoreFilter {
  isIgnored(filePath: string): boolean;
  getPatterns(): string[];
}

export class ProtoIgnoreParser implements ProtoIgnoreFilter {
  private projectRoot: string;
  private patterns: string[] = [];
  private ig = ignore();

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.loadPatterns();
  }

  private loadPatterns(): void {
    // Load .protoignore (primary) and inherit patterns from .claudeignore
    // when present, so projects already configured for Claude Code don't
    // need a duplicate file. Order is .claudeignore first, .protoignore
    // second — later patterns override earlier ones (gitignore semantics).
    const sources = ['.claudeignore', '.protoignore'];
    const merged: string[] = [];

    for (const filename of sources) {
      const patternsFilePath = path.join(this.projectRoot, filename);
      let content: string;
      try {
        content = fs.readFileSync(patternsFilePath, 'utf-8');
      } catch (_error) {
        continue;
      }
      const lines = (content ?? '')
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p !== '' && !p.startsWith('#'));
      merged.push(...lines);
    }

    if (merged.length === 0) {
      return;
    }

    this.patterns = merged;
    this.ig.add(this.patterns);
  }

  isIgnored(filePath: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }

    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    if (
      filePath.startsWith('\\') ||
      filePath === '/' ||
      filePath.includes('\0')
    ) {
      return false;
    }

    const resolved = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, resolved);

    if (relativePath === '' || relativePath.startsWith('..')) {
      return false;
    }

    // Even in windows, Ignore expects forward slashes.
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (normalizedPath.startsWith('/') || normalizedPath === '') {
      return false;
    }

    return this.ig.ignores(normalizedPath);
  }

  getPatterns(): string[] {
    return this.patterns;
  }
}
