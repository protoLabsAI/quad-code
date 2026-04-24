/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAvailableModels } from './modelDiscovery.js';

describe('fetchAvailableModels', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should parse standard OpenAI /models response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4', created: 1000, owned_by: 'openai' },
          { id: 'gpt-3.5-turbo', created: 900, owned_by: 'openai' },
        ],
      }),
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.error).toBeUndefined();
    expect(result.models).toHaveLength(2);
    // Sorted alphabetically
    expect(result.models[0].id).toBe('gpt-3.5-turbo');
    expect(result.models[1].id).toBe('gpt-4');
    expect(result.models[1].ownedBy).toBe('openai');
  });

  it('should handle plain array response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'model-a' }, { id: 'model-b' }],
    });

    const result = await fetchAvailableModels(
      'https://custom.api.com/v1',
      'key-123',
    );

    expect(result.error).toBeUndefined();
    expect(result.models).toHaveLength(2);
  });

  it('should return auth error on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'bad-key',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('Authentication failed');
  });

  it('should return auth error on 403', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'bad-key',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('Authentication failed');
  });

  it('should return server error on 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('500');
  });

  it('should handle network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchAvailableModels(
      'https://bad-host.example.com/v1',
      'sk-test',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('Could not connect');
  });

  it('should handle unexpected response format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ something: 'unexpected' }),
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('Unexpected response format');
  });

  it('should handle empty model list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('No models found');
  });

  it('should filter out entries without id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'valid-model' },
          { name: 'no-id-model' },
          null,
          { id: 123 }, // id is not a string
        ],
      }),
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.models).toHaveLength(1);
    expect(result.models[0].id).toBe('valid-model');
  });

  it('should append /v1/models to bare base URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'test-model' }] }),
    });

    await fetchAvailableModels('https://api.openai.com', 'sk-test');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.any(Object),
    );
  });

  it('should append /models to URL already ending with /v1', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'test-model' }] }),
    });

    await fetchAvailableModels('https://api.openai.com/v1', 'sk-test');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.any(Object),
    );
  });

  it('should strip trailing slashes from base URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'test-model' }] }),
    });

    await fetchAvailableModels('https://api.openai.com/v1/', 'sk-test');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.any(Object),
    );
  });

  it('should send Authorization header with Bearer token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'test-model' }] }),
    });

    await fetchAvailableModels('https://api.openai.com/v1', 'sk-my-key');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-my-key',
        }),
      }),
    );
  });

  it('should handle models with optional fields missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'bare-model' }],
      }),
    });

    const result = await fetchAvailableModels(
      'https://api.openai.com/v1',
      'sk-test',
    );

    expect(result.models[0].created).toBeUndefined();
    expect(result.models[0].ownedBy).toBeUndefined();
  });
});
