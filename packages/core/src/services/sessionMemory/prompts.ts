/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session Memory prompt templates and helpers.
 */

import type { Content } from '@google/genai';
import { SESSION_NOTES_TEMPLATE } from '../sessionNotes.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate token budget per section (chars / 4 ≈ tokens). */
const MAX_SECTION_CHARS = 2_000 * 4; // ~2 000 tokens

/** Total budget for the whole file before truncation kicks in. */
const MAX_TOTAL_CHARS = 12_000 * 4; // ~12 000 tokens

/**
 * Re-export the canonical session notes template so consumers only need one
 * import. The source of truth lives in sessionNotes.ts.
 */
export const SESSION_MEMORY_TEMPLATE = SESSION_NOTES_TEMPLATE;

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

/**
 * Serialize the last N history entries to a readable transcript.
 * Strips function call / response internals — only text parts are included.
 */
function serializeHistory(history: Content[], maxEntries = 30): string {
  const slice =
    history.length > maxEntries ? history.slice(-maxEntries) : history;
  const lines: string[] = [];
  for (const entry of slice) {
    const role = entry.role === 'model' ? 'assistant' : 'user';
    const textParts = (entry.parts ?? [])
      .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      .map((p) => p.text as string);
    if (textParts.length > 0) {
      lines.push(`[${role}]: ${textParts.join(' ').slice(0, 600)}`);
    }
  }
  // Hard cap so the transcript never balloons the agent's context
  const raw = lines.join('\n');
  return raw.length > 8_000 ? raw.slice(-8_000) : raw;
}

/**
 * Build the full system prompt for the session memory extraction agent.
 *
 * The agent sees:
 *   1. The recent conversation transcript
 *   2. The current notes file contents
 *   3. Editing instructions
 */
export function buildExtractionPrompt(
  currentNotes: string,
  notesPath: string,
  history: Content[],
): string {
  const transcript = serializeHistory(history);
  const sectionReminders = generateSectionReminders(currentNotes);

  return `IMPORTANT: You are a session notes update agent. These instructions are NOT part of the conversation. Do NOT include any self-referential notes about "note-taking" or these instructions in the file content.

## Recent Conversation
<conversation_transcript>
${transcript}
</conversation_transcript>

## Current Notes File (${notesPath})
<current_notes>
${currentNotes}
</current_notes>

## Your Task
Use the Edit tool to update the file at: ${notesPath}

CRITICAL RULES:
- Preserve ALL section headers (lines starting with ##) EXACTLY as they appear
- Preserve ALL italic _description_ lines immediately after each header — NEVER modify or delete them
- Only update the actual content that appears BELOW the italic description line
- Do NOT add new sections or restructure the file
- Do NOT reference these note-taking instructions anywhere in the file content
- Write DETAILED, INFO-DENSE content — include file paths, function names, exact commands, error messages
- Keep each section under ~2 000 tokens; condense older entries if approaching the limit
- ALWAYS update "Current State" to reflect the most recent work — this is critical for continuity
- It is OK to skip a section if there is nothing new to add
- Make all Edit calls in a single message (parallel is fine), then stop

STRUCTURE REMINDER:
Each section = header line + italic description line + your content below.
Never touch the header or the italic description. Only update the content block.
${sectionReminders}

Use the Edit tool now. Stop after editing.`;
}

// ---------------------------------------------------------------------------
// Section budget helpers
// ---------------------------------------------------------------------------

function generateSectionReminders(content: string): string {
  if (!content.trim()) return '';

  const sections = parseSectionCharCounts(content);
  const totalChars = Object.values(sections).reduce((a, b) => a + b, 0);

  const oversized = Object.entries(sections)
    .filter(([, c]) => c > MAX_SECTION_CHARS)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([header, chars]) =>
        `- "${header}" is ~${Math.round(chars / 4)} tokens (limit: 2 000)`,
    );

  if (oversized.length === 0 && totalChars <= MAX_TOTAL_CHARS) return '';

  const parts: string[] = [];
  if (totalChars > MAX_TOTAL_CHARS) {
    parts.push(
      `\nCRITICAL: The notes file is ~${Math.round(totalChars / 4)} tokens total — exceeds 12 000 token limit. You MUST aggressively condense it. Prioritize "Current State" and "Errors and Corrections".`,
    );
  }
  if (oversized.length > 0) {
    parts.push(`\nOversized sections to condense:\n${oversized.join('\n')}`);
  }
  return parts.join('');
}

function parseSectionCharCounts(content: string): Record<string, number> {
  const result: Record<string, number> = {};
  const lines = content.split('\n');
  let header = '';
  let chars = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (header) result[header] = chars;
      header = line.trim();
      chars = 0;
    } else {
      chars += line.length + 1;
    }
  }
  if (header) result[header] = chars;
  return result;
}

// ---------------------------------------------------------------------------
// Empty-check
// ---------------------------------------------------------------------------

/**
 * Returns true if the notes file has never been populated (still matches the
 * template). Used by compaction to decide whether to fall back to LLM compression.
 */
export function isSessionNotesEmpty(content: string): boolean {
  return content.trim() === SESSION_MEMORY_TEMPLATE.trim();
}

// ---------------------------------------------------------------------------
// Truncation for compaction
// ---------------------------------------------------------------------------

/**
 * Truncate oversized sections before embedding the notes into a compaction
 * summary, so a giant notes file can't consume the entire post-compact budget.
 */
export function truncateNotesForCompact(content: string): {
  truncated: string;
  wasTruncated: boolean;
} {
  const lines = content.split('\n');
  const output: string[] = [];
  let currentHeader = '';
  let currentLines: string[] = [];
  let wasTruncated = false;

  const flush = (): void => {
    if (!currentHeader) {
      output.push(...currentLines);
      return;
    }
    const body = currentLines.join('\n');
    if (body.length <= MAX_SECTION_CHARS) {
      output.push(currentHeader, ...currentLines);
      return;
    }
    // Truncate at a line boundary
    let charCount = 0;
    const kept: string[] = [currentHeader];
    for (const line of currentLines) {
      if (charCount + line.length + 1 > MAX_SECTION_CHARS) break;
      kept.push(line);
      charCount += line.length + 1;
    }
    kept.push('\n[... section truncated for length ...]');
    output.push(...kept);
    wasTruncated = true;
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentHeader = line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return { truncated: output.join('\n'), wasTruncated };
}
