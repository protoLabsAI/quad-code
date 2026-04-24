/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugLogger } from '@qwen-code/qwen-code-core';

const debugLogger = createDebugLogger('setup:modelDiscovery');

export interface DiscoveredModel {
  id: string;
  created?: number;
  ownedBy?: string;
}

export interface ModelDiscoveryResult {
  models: DiscoveredModel[];
  error?: string;
}

/**
 * Fetch available models from an OpenAI-compatible `/models` endpoint.
 *
 * Works with any provider that implements the OpenAI `/v1/models` standard
 * (OpenAI, Anthropic via proxy, Ollama, LiteLLM, vLLM, OpenRouter, etc.).
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string,
): Promise<ModelDiscoveryResult> {
  const url = buildModelsUrl(baseUrl);

  debugLogger.info(`Fetching models from ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return {
          models: [],
          error: `Authentication failed (${status}). Check your API key.`,
        };
      }
      return {
        models: [],
        error: `Server returned ${status}: ${response.statusText}`,
      };
    }

    const body = (await response.json()) as unknown;
    return parseModelsResponse(body);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { models: [], error: 'Request timed out after 15s.' };
    }
    if (err instanceof TypeError && (err as Error).message.includes('fetch')) {
      return {
        models: [],
        error: `Could not connect to ${url}. Check the base URL.`,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    debugLogger.error(`Model discovery failed: ${message}`);
    return { models: [], error: message };
  }
}

/**
 * Normalise the base URL and append `/models`.
 */
function buildModelsUrl(baseUrl: string): string {
  let normalised = baseUrl.replace(/\/+$/, '');

  // If the URL already ends with /models, use it as-is
  if (normalised.endsWith('/models')) {
    return normalised;
  }

  // If missing /v1 suffix and doesn't look like it has a versioned path, add /v1
  if (
    !normalised.match(/\/v\d+$/) &&
    !normalised.endsWith('/api') &&
    !normalised.endsWith('/openai')
  ) {
    // Don't add /v1 if the URL already includes a version path segment
    if (!normalised.match(/\/v\d+\//)) {
      normalised += '/v1';
    }
  }

  return `${normalised}/models`;
}

/**
 * Parse the response body from a `/models` endpoint.
 * Handles both the standard `{ data: [...] }` shape and plain arrays.
 */
function parseModelsResponse(body: unknown): ModelDiscoveryResult {
  if (!body || typeof body !== 'object') {
    return { models: [], error: 'Unexpected response format.' };
  }

  const obj = body as Record<string, unknown>;
  let rawModels: unknown[];

  if (Array.isArray(obj['data'])) {
    rawModels = obj['data'] as unknown[];
  } else if (Array.isArray(body)) {
    rawModels = body;
  } else {
    return {
      models: [],
      error: 'Unexpected response format — no model list found.',
    };
  }

  const models: DiscoveredModel[] = rawModels
    .filter(
      (m): m is Record<string, unknown> =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as Record<string, unknown>)['id'] === 'string',
    )
    .map((m) => ({
      id: m['id'] as string,
      created:
        typeof m['created'] === 'number' ? (m['created'] as number) : undefined,
      ownedBy:
        typeof m['owned_by'] === 'string'
          ? (m['owned_by'] as string)
          : undefined,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (models.length === 0) {
    return { models: [], error: 'No models found at this endpoint.' };
  }

  return { models };
}
