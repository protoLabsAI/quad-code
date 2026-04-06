/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

/**
 * Posts an audio file to an OpenAI-compatible STT endpoint and returns the transcript.
 * Uses Node's built-in fetch (Node 18+) with FormData/Blob — no extra dependencies.
 */
export async function transcribe(
  audioPath: string,
  endpoint: string,
  model = 'whisper-1',
  apiKey?: string,
): Promise<string> {
  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });

  const form = new FormData();
  form.append('file', blob, 'audio.wav');
  form.append('model', model);

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `STT endpoint returned ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { text: string };
  return data.text.trim();
}
