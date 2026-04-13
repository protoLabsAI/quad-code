/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session Memory — background agent that continuously maintains .proto/session-notes.md.
 *
 * After each conversation turn (above token thresholds), a restricted AgentHeadless
 * instance reads the recent history and edits the notes file in-place. When
 * compaction fires, chatCompressionService can use those notes as the summary
 * instead of making a fresh LLM summarisation call.
 */

import type { Content } from '@google/genai';
import type { Config } from '../../config/config.js';
import {
  AgentHeadless,
  ContextState,
} from '../../agents/runtime/agent-headless.js';
import { ToolNames } from '../../tools/tool-names.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import {
  initSessionNotes,
  getSessionNotesPath,
  readSessionNotes,
} from '../sessionNotes.js';
import {
  buildExtractionPrompt,
  isSessionNotesEmpty,
  SESSION_MEMORY_TEMPLATE,
} from './prompts.js';
import {
  markExtractionCompleted,
  markExtractionStarted,
  recordExtractionTokenCount,
  setLastSummarizedCursorIndex,
  shouldExtractSessionMemory,
} from './sessionMemoryUtils.js';

const logger = createDebugLogger('SESSION_MEMORY');

const MAX_EXTRACTOR_TURNS = 2;
const MAX_EXTRACTOR_MINUTES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the session-notes file exists, seeding it from the template if needed.
 */
async function ensureNotesFile(projectDir: string): Promise<void> {
  const existing = await readSessionNotes(projectDir);
  if (existing === null) {
    await initSessionNotes(projectDir);
  }
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

/**
 * Run the session memory extraction agent.
 * Fire-and-forget — the caller should not await unless it needs the result.
 *
 * @param config     - App config (model, project root, etc.)
 * @param history    - Current conversation history snapshot
 * @param tokenCount - Current context window token usage (from uiTelemetryService)
 */
export async function extractSessionMemory(
  config: Config,
  history: Content[],
  tokenCount: number,
): Promise<void> {
  if (!(config.getSessionMemory()?.enabled ?? true)) return;
  if (!shouldExtractSessionMemory(tokenCount)) return;

  markExtractionStarted();
  try {
    await _runExtraction(config, history, tokenCount);
  } catch (err) {
    logger.debug('Session memory extraction failed (non-fatal):', err);
  } finally {
    markExtractionCompleted();
  }
}

/**
 * Manually trigger session memory extraction, bypassing threshold checks.
 * Used by the /summary slash command.
 */
export async function manuallyExtractSessionMemory(
  config: Config,
  history: Content[],
  tokenCount: number,
): Promise<{ success: boolean; notesPath?: string; error?: string }> {
  const projectDir = config.getProjectRoot();
  const notesPath = getSessionNotesPath(projectDir);

  markExtractionStarted();
  try {
    await _runExtraction(config, history, tokenCount);
    return { success: true, notesPath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    markExtractionCompleted();
  }
}

// ---------------------------------------------------------------------------
// Internal runner
// ---------------------------------------------------------------------------

async function _runExtraction(
  config: Config,
  history: Content[],
  tokenCount: number,
): Promise<void> {
  const projectDir = config.getProjectRoot();

  // Ensure the file exists (seed from template on first run)
  await ensureNotesFile(projectDir);

  const notesPath = getSessionNotesPath(projectDir);
  const currentNotes =
    (await readSessionNotes(projectDir)) ?? SESSION_MEMORY_TEMPLATE;

  const systemPrompt = buildExtractionPrompt(currentNotes, notesPath, history);

  const agent = await AgentHeadless.create(
    'session-memory',
    config,
    { systemPrompt },
    { model: config.getModel() },
    {
      max_turns: MAX_EXTRACTOR_TURNS,
      max_time_minutes: MAX_EXTRACTOR_MINUTES,
    },
    // Restrict to Edit only — the agent should only touch the notes file
    { tools: [ToolNames.EDIT] },
  );

  await agent.execute(new ContextState());

  // Update compaction boundary markers after successful extraction
  recordExtractionTokenCount(tokenCount);
  if (history.length > 0) {
    setLastSummarizedCursorIndex(history.length - 1);
  }

  logger.debug(
    `Session memory updated (${history.length} history entries, ${tokenCount} tokens)`,
  );
}

// ---------------------------------------------------------------------------
// Re-export for consumers that only import from this file
// ---------------------------------------------------------------------------

export { isSessionNotesEmpty };
