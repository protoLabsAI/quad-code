/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import type { ProtoIgnoreFilter } from '../utils/protoIgnoreParser.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import { ProtoIgnoreParser } from '../utils/protoIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'node:path';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectProtoIgnore?: boolean;
}

export interface FilterReport {
  filteredPaths: string[];
  gitIgnoredCount: number;
  protoIgnoredCount: number;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private protoIgnoreFilter: ProtoIgnoreFilter | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    if (isGitRepository(this.projectRoot)) {
      this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
    }
    this.protoIgnoreFilter = new ProtoIgnoreParser(this.projectRoot);
  }

  /**
   * Filters a list of file paths based on git ignore rules
   */
  filterFiles(
    filePaths: string[],
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectProtoIgnore: true,
    },
  ): string[] {
    return filePaths.filter((filePath) => {
      if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        return false;
      }
      if (options.respectProtoIgnore && this.shouldProtoIgnoreFile(filePath)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Filters a list of file paths based on git ignore rules and returns a report
   * with counts of ignored files.
   */
  filterFilesWithReport(
    filePaths: string[],
    opts: FilterFilesOptions = {
      respectGitIgnore: true,
      respectProtoIgnore: true,
    },
  ): FilterReport {
    const filteredPaths: string[] = [];
    let gitIgnoredCount = 0;
    let protoIgnoredCount = 0;

    for (const filePath of filePaths) {
      if (opts.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        gitIgnoredCount++;
        continue;
      }

      if (opts.respectProtoIgnore && this.shouldProtoIgnoreFile(filePath)) {
        protoIgnoredCount++;
        continue;
      }

      filteredPaths.push(filePath);
    }

    return {
      filteredPaths,
      gitIgnoredCount,
      protoIgnoredCount,
    };
  }

  /**
   * Checks if a single file should be git-ignored
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    if (this.gitIgnoreFilter) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Checks if a single file should be proto-ignored
   */
  shouldProtoIgnoreFile(filePath: string): boolean {
    if (this.protoIgnoreFilter) {
      return this.protoIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Unified method to check if a file should be ignored based on filtering options
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    const {
      respectGitIgnore = true,
      respectProtoIgnore: respectProtoIgnore = true,
    } = options;

    if (respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
      return true;
    }
    if (respectProtoIgnore && this.shouldProtoIgnoreFile(filePath)) {
      return true;
    }
    return false;
  }

  /**
   * Returns loaded patterns from .protoignore
   */
  getProtoIgnorePatterns(): string[] {
    return this.protoIgnoreFilter?.getPatterns() ?? [];
  }
}
