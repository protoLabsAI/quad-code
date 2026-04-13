/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  extractSessionMemory,
  manuallyExtractSessionMemory,
  isSessionNotesEmpty,
} from './sessionMemory.js';

export {
  shouldExtractSessionMemory,
  waitForExtraction,
  getLastSummarizedCursorIndex,
  setLastSummarizedCursorIndex,
  resetSessionMemoryState,
  setSessionMemorySettings,
  getSessionMemorySettings,
  markExtractionStarted,
  markExtractionCompleted,
  isExtractionInProgress,
  recordExtractionTokenCount,
  DEFAULT_SESSION_MEMORY_SETTINGS,
  initTimedMicrocompact,
  shouldRunTimedMicrocompact,
  recordTimedMicrocompact,
  DEFAULT_TIMED_MICROCOMPACT_INTERVAL_MS,
} from './sessionMemoryUtils.js';

// SessionMemorySettings is exported from config.ts (canonical location)

export {
  SESSION_MEMORY_TEMPLATE,
  buildExtractionPrompt,
  truncateNotesForCompact,
} from './prompts.js';
