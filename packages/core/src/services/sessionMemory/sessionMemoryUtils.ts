/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session Memory utility functions — pure state management with no heavy imports.
 * Kept separate from sessionMemory.ts to avoid circular dependency through AgentHeadless.
 */

/** How long to wait for an in-progress extraction before giving up (ms). */
const EXTRACTION_WAIT_TIMEOUT_MS = 15_000;

/** An extraction older than this is considered stale and skipped (ms). */
const EXTRACTION_STALE_THRESHOLD_MS = 60_000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// SessionMemorySettings public interface lives in config.ts.
// We declare an identical internal type here to avoid importing from config.ts
// (which would create a circular dependency through AgentHeadless → Config).
interface SMSettings {
  enabled?: boolean;
  minimumTokensToInit?: number;
  minimumTokensBetweenUpdates?: number;
}

export const DEFAULT_SESSION_MEMORY_SETTINGS: Required<SMSettings> = {
  enabled: true,
  minimumTokensToInit: 10_000,
  minimumTokensBetweenUpdates: 5_000,
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let initialized = false;
let lastExtractionTokenCount = 0;
/** Index of the last history entry that was included in an extraction. -1 = never. */
let lastSummarizedCursorIndex = -1;
let extractionStartedAt: number | undefined;
/** Timestamp of the most recent timed-microcompact pass. undefined = not yet initialized. */
let lastTimedMicrocompactAt: number | undefined;

// Active config (starts with defaults, can be overridden via setSessionMemorySettings)
let settings: Required<SMSettings> = {
  ...DEFAULT_SESSION_MEMORY_SETTINGS,
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function setSessionMemorySettings(overrides: SMSettings): void {
  settings = {
    ...DEFAULT_SESSION_MEMORY_SETTINGS,
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([, v]) => v !== undefined && v !== null,
      ),
    ),
  } as Required<SMSettings>;
}

export function getSessionMemorySettings(): Required<SMSettings> {
  return { ...settings };
}

// ---------------------------------------------------------------------------
// Threshold checks
// ---------------------------------------------------------------------------

/**
 * Evaluate whether session memory extraction should fire now.
 *
 * Rules (mirrors cc-2.18 sessionMemory.ts):
 * 1. Token count must be above `minimumTokensToInit` (one-time gate).
 * 2. Token growth since last extraction must exceed `minimumTokensBetweenUpdates`.
 */
export function shouldExtractSessionMemory(tokenCount: number): boolean {
  if (!initialized) {
    if (tokenCount < settings.minimumTokensToInit) return false;
    initialized = true;
  }

  const growth = tokenCount - lastExtractionTokenCount;
  return growth >= settings.minimumTokensBetweenUpdates;
}

// ---------------------------------------------------------------------------
// Extraction lock
// ---------------------------------------------------------------------------

export function markExtractionStarted(): void {
  extractionStartedAt = Date.now();
}

export function markExtractionCompleted(): void {
  extractionStartedAt = undefined;
}

/** Returns true while a background extraction agent is running. */
export function isExtractionInProgress(): boolean {
  return extractionStartedAt !== undefined;
}

/**
 * Wait until any in-progress extraction finishes, or until the timeout/stale
 * guard kicks in — whichever comes first.
 */
export async function waitForExtraction(
  timeoutMs = EXTRACTION_WAIT_TIMEOUT_MS,
): Promise<void> {
  if (!extractionStartedAt) return;

  const deadline = Date.now() + timeoutMs;
  while (extractionStartedAt) {
    const age = Date.now() - extractionStartedAt;
    if (age > EXTRACTION_STALE_THRESHOLD_MS) return; // stale, give up
    if (Date.now() >= deadline) return; // timeout
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
}

// ---------------------------------------------------------------------------
// Cursor / compaction boundary
// ---------------------------------------------------------------------------

export function getLastSummarizedCursorIndex(): number {
  return lastSummarizedCursorIndex;
}

export function setLastSummarizedCursorIndex(index: number): void {
  lastSummarizedCursorIndex = index;
}

export function recordExtractionTokenCount(tokenCount: number): void {
  lastExtractionTokenCount = tokenCount;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Timed microcompact
// ---------------------------------------------------------------------------

/** Default interval between timed-microcompact passes (10 minutes). */
export const DEFAULT_TIMED_MICROCOMPACT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Call once per session to arm the timed-microcompact clock.
 * Until this is called, `shouldRunTimedMicrocompact()` always returns false
 * (prevents a pass from firing immediately on startup).
 */
export function initTimedMicrocompact(): void {
  lastTimedMicrocompactAt = Date.now();
}

/**
 * Returns true when the timed-microcompact interval has elapsed since the
 * last pass (or since `initTimedMicrocompact()` was called).
 */
export function shouldRunTimedMicrocompact(
  intervalMs: number = DEFAULT_TIMED_MICROCOMPACT_INTERVAL_MS,
): boolean {
  if (lastTimedMicrocompactAt === undefined) return false;
  return Date.now() - lastTimedMicrocompactAt >= intervalMs;
}

/** Record that a timed-microcompact pass has just completed. */
export function recordTimedMicrocompact(): void {
  lastTimedMicrocompactAt = Date.now();
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetSessionMemoryState(): void {
  initialized = false;
  lastExtractionTokenCount = 0;
  lastSummarizedCursorIndex = -1;
  extractionStartedAt = undefined;
  lastTimedMicrocompactAt = undefined;
  settings = { ...DEFAULT_SESSION_MEMORY_SETTINGS };
}
