/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview teamRegistry — module-level registry of live TeamOrchestrators.
 *
 * Slash-command handlers are stateless async functions with no shared closure.
 * This registry bridges `/team start` (which creates an orchestrator) and
 * `/team stop` (which must retrieve and stop it). Keyed by team name.
 */

import type { TeamOrchestrator } from './TeamOrchestrator.js';

const registry = new Map<string, TeamOrchestrator>();

export const teamRegistry = {
  set(teamName: string, orchestrator: TeamOrchestrator): void {
    registry.set(teamName, orchestrator);
  },

  get(teamName: string): TeamOrchestrator | undefined {
    return registry.get(teamName);
  },

  delete(teamName: string): void {
    registry.delete(teamName);
  },

  has(teamName: string): boolean {
    return registry.has(teamName);
  },

  entries(): IterableIterator<[string, TeamOrchestrator]> {
    return registry.entries();
  },

  size(): number {
    return registry.size;
  },
};
