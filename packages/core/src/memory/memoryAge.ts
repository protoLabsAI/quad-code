/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MemoryType } from './types.js';

const DAY_MS = 86_400_000;

/**
 * Staleness thresholds (in days) per memory type.
 * null = never stale (stable across time).
 */
export const STALENESS_THRESHOLDS: Record<MemoryType, number | null> = {
  user: null,
  feedback: null,
  project: 21,
  reference: 7,
};

/**
 * Verification guidance per memory type shown when stale.
 */
const VERIFICATION_GUIDANCE: Record<MemoryType, string> = {
  user: '',
  feedback: '',
  project: 'verify this is still current before acting',
  reference: 're-confirm this reference before using it',
};

/**
 * Format a timestamp as a human-readable age string.
 */
export function formatAge(mtimeMs: number): string {
  const ageMs = Date.now() - mtimeMs;
  const days = Math.floor(ageMs / DAY_MS);

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * Check if a memory is stale based on its type's threshold.
 * Returns false for types with no staleness threshold.
 */
export function isStale(
  mtimeMs: number,
  type?: MemoryType,
  thresholdDays?: number,
): boolean {
  let threshold = thresholdDays;
  if (threshold === undefined) {
    if (type) {
      const typedThreshold = STALENESS_THRESHOLDS[type];
      if (typedThreshold === null) return false;
      threshold = typedThreshold;
    } else {
      threshold = 30;
    }
  }
  return Date.now() - mtimeMs > threshold * DAY_MS;
}

/**
 * Get a staleness warning for a memory entry.
 * Returns null when the memory is fresh or has no staleness threshold.
 */
export function getStaleWarning(
  mtimeMs: number,
  type?: MemoryType,
): string | null {
  if (!isStale(mtimeMs, type)) return null;
  const age = formatAge(mtimeMs);
  const guidance = type ? VERIFICATION_GUIDANCE[type] : '';
  return guidance
    ? `(last updated ${age} — ${guidance})`
    : `(last updated ${age} — may be outdated)`;
}
