/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { stdin, stdout } from 'node:process';
import {
  AuthType,
  getErrorMessage,
  type ProviderModelConfig as ModelConfig,
} from '@qwen-code/qwen-code-core';
import { writeStdoutLine, writeStderrLine } from '../../utils/stdioHelpers.js';
import { loadSettings } from '../../config/settings.js';
import { getPersistScopeForModelSelection } from '../../config/modelProvidersScope.js';
import { backupSettingsFile } from '../../utils/settingsUtils.js';
import { InteractiveSelector } from '../auth/interactiveSelector.js';
import {
  fetchAvailableModels,
  type DiscoveredModel,
} from './modelDiscovery.js';

/** Provider presets with sensible defaults. */
const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    authType: AuthType.USE_OPENAI,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultEnvKey: 'OPENAI_API_KEY',
  },
  'openai-compatible': {
    label: 'OpenAI-compatible (custom endpoint)',
    authType: AuthType.USE_OPENAI,
    defaultBaseUrl: '',
    defaultEnvKey: 'OPENAI_API_KEY',
  },
  anthropic: {
    label: 'Anthropic',
    authType: AuthType.USE_ANTHROPIC,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultEnvKey: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    label: 'Google Gemini',
    authType: AuthType.USE_GEMINI,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultEnvKey: 'GEMINI_API_KEY',
  },
} as const;

type ProviderPresetKey = keyof typeof PROVIDER_PRESETS;

/**
 * Run the interactive setup wizard.
 * Can be invoked from `proto setup` CLI command or `/setup` slash command.
 */
export async function runSetupWizard(): Promise<void> {
  try {
    writeStdoutLine('\n🔧 proto setup\n');
    writeStdoutLine('Configure a model provider to get started.\n');

    // Step 1: Select provider
    const providerKey = await selectProvider();
    const preset = PROVIDER_PRESETS[providerKey];

    // Step 2: Base URL
    const baseUrl = await promptBaseUrl(preset);

    // Step 3: API key
    const { key: apiKey, fromEnv: apiKeyFromEnv } = await promptApiKey(preset);

    // Step 4: Discover models
    writeStdoutLine('\n⏳ Discovering models...\n');
    const { models, error } = await fetchAvailableModels(baseUrl, apiKey);

    if (error) {
      writeStderrLine(`\n⚠️  ${error}\n`);
      if (models.length === 0) {
        writeStderrLine(
          'Could not discover models. You can still configure a model manually.\n',
        );
        const manualModelId = await promptText('Enter a model ID to use: ');
        if (manualModelId.trim()) {
          await persistSetup(
            preset,
            baseUrl,
            apiKey,
            apiKeyFromEnv,
            manualModelId.trim(),
            [],
          );
          return;
        }
        writeStderrLine('Setup cancelled — no model selected.\n');
        process.exit(1);
      }
    }

    writeStdoutLine(`Found ${models.length} model(s).\n`);

    // Step 5: Select default model
    const selectedModel = await selectModel(models);

    // Step 6: Voice / STT configuration
    const sttConfig = await promptSttSetup(baseUrl, preset);

    // Step 7: Provider label (optional)
    const providerLabel = await promptText(
      `Provider label (default: ${preset.label}): `,
    );

    // Step 8: Persist
    const label = providerLabel.trim() || preset.label;
    await persistSetup(
      preset,
      baseUrl,
      apiKey,
      apiKeyFromEnv,
      selectedModel.id,
      models,
      label,
      sttConfig,
    );

    writeStdoutLine(`\n✅ Setup complete!\n`);
    writeStdoutLine(`   Provider:  ${label}`);
    writeStdoutLine(`   Endpoint:  ${baseUrl}`);
    writeStdoutLine(`   Model:     ${selectedModel.id}`);
    if (sttConfig) {
      writeStdoutLine(
        `   STT:       ${sttConfig.endpoint} (${sttConfig.enabled ? 'enabled' : 'disabled'})`,
      );
    }
    writeStdoutLine(`\nRun \`proto\` to start chatting.\n`);

    process.exit(0);
  } catch (err) {
    if ((err as Error).message === 'Interrupted') {
      writeStdoutLine('\nSetup cancelled.\n');
      process.exit(0);
    }
    writeStderrLine(`\nSetup failed: ${getErrorMessage(err)}\n`);
    process.exit(1);
  }
}

// ─── Interactive prompts ────────────────────────────────────────────

async function selectProvider(): Promise<ProviderPresetKey> {
  const selector = new InteractiveSelector(
    [
      {
        value: 'openai' as ProviderPresetKey,
        label: 'OpenAI',
        description: 'api.openai.com',
      },
      {
        value: 'openai-compatible' as ProviderPresetKey,
        label: 'OpenAI-compatible',
        description:
          'Custom endpoint (Ollama, LiteLLM, vLLM, OpenRouter, etc.)',
      },
      {
        value: 'anthropic' as ProviderPresetKey,
        label: 'Anthropic',
        description: 'api.anthropic.com',
      },
      {
        value: 'gemini' as ProviderPresetKey,
        label: 'Google Gemini',
        description: 'generativelanguage.googleapis.com',
      },
    ],
    'Select a provider:',
  );

  return selector.select();
}

async function promptBaseUrl(
  preset: (typeof PROVIDER_PRESETS)[ProviderPresetKey],
): Promise<string> {
  if (preset.defaultBaseUrl) {
    const label = `Base URL (default: ${preset.defaultBaseUrl}): `;
    const input = await promptText(label);
    return input.trim() || preset.defaultBaseUrl;
  }
  // No default — require input
  let url = '';
  while (!url) {
    url = (await promptText('Base URL: ')).trim();
    if (!url) {
      writeStderrLine('A base URL is required for custom endpoints.\n');
    }
  }
  return url;
}

interface ApiKeyResult {
  key: string;
  /** True when the key came from an existing env var — don't persist to disk. */
  fromEnv: boolean;
}

async function promptApiKey(
  preset: (typeof PROVIDER_PRESETS)[ProviderPresetKey],
): Promise<ApiKeyResult> {
  // Check if already in env
  const envValue = process.env[preset.defaultEnvKey];
  if (envValue) {
    const masked = envValue.slice(0, 4) + '...' + envValue.slice(-4);
    writeStdoutLine(
      `\nFound ${preset.defaultEnvKey} in environment (${masked}).`,
    );
    const useExisting = await promptText('Use this key? (Y/n): ');
    if (!useExisting.trim() || useExisting.trim().toLowerCase() === 'y') {
      // Key stays in env — don't write it back to disk
      return { key: envValue, fromEnv: true };
    }
  }

  let key = '';
  while (!key) {
    key = await promptMaskedText(`\nAPI key: `);
    if (!key) {
      writeStderrLine('An API key is required.\n');
    }
  }
  return { key, fromEnv: false };
}

async function selectModel(
  models: DiscoveredModel[],
): Promise<DiscoveredModel> {
  // If only 1 model, auto-select it
  if (models.length === 1) {
    writeStdoutLine(`Auto-selecting only available model: ${models[0].id}\n`);
    return models[0];
  }

  // For large lists, paginate with the interactive selector in batches
  const PAGE_SIZE = 15;
  if (models.length <= PAGE_SIZE) {
    const selector = new InteractiveSelector(
      models.map((m) => ({
        value: m,
        label: m.id,
        description: m.ownedBy || undefined,
      })),
      'Select a default model:',
    );
    return selector.select();
  }

  // Paginated selection for large model lists
  return selectModelPaginated(models, PAGE_SIZE);
}

type PaginatedOption =
  | { type: 'model'; model: DiscoveredModel }
  | { type: 'prev' }
  | { type: 'next' };

async function selectModelPaginated(
  models: DiscoveredModel[],
  pageSize: number,
): Promise<DiscoveredModel> {
  let page = 0;
  const totalPages = Math.ceil(models.length / pageSize);

  while (true) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, models.length);
    const pageModels = models.slice(start, end);

    const options: Array<{
      value: PaginatedOption;
      label: string;
      description?: string;
    }> = pageModels.map((m) => ({
      value: { type: 'model' as const, model: m },
      label: m.id,
      description: m.ownedBy || undefined,
    }));

    // Add navigation options
    if (page > 0) {
      options.unshift({
        value: { type: 'prev' as const },
        label: '← Previous page',
        description: undefined,
      });
    }
    if (end < models.length) {
      options.push({
        value: { type: 'next' as const },
        label: '→ Next page',
        description: `Page ${page + 1}/${totalPages}`,
      });
    }

    const selector = new InteractiveSelector(
      options,
      `Select a default model (page ${page + 1}/${totalPages}, ${models.length} total):`,
    );

    const result = await selector.select();

    if (result.type === 'prev') {
      page--;
      continue;
    }
    if (result.type === 'next') {
      page++;
      continue;
    }
    return result.model;
  }
}

// ─── STT setup ──────────────────────────────────────────────────────

interface SttConfig {
  endpoint: string;
  envKey: string;
  enabled: boolean;
}

/**
 * Build the default STT endpoint from the provider base URL.
 * Normalises to `{baseUrl}/audio/transcriptions` (OpenAI standard).
 */
function buildDefaultSttEndpoint(baseUrl: string): string {
  let normalised = baseUrl.replace(/\/+$/, '');

  // Add /v1 only if no version segment exists (e.g. /v1, /v1beta, /v2alpha1)
  if (!/\/v\d+[A-Za-z0-9._-]*(\/|$)/.test(normalised)) {
    normalised += '/v1';
  }

  return `${normalised}/audio/transcriptions`;
}

async function promptSttSetup(
  baseUrl: string,
  preset: (typeof PROVIDER_PRESETS)[ProviderPresetKey],
): Promise<SttConfig | null> {
  writeStdoutLine('\n🎤 Voice Input (Speech-to-Text)\n');

  const selector = new InteractiveSelector(
    [
      {
        value: 'yes',
        label: 'Yes, configure STT',
        description:
          'Set up voice input using an OpenAI-compatible transcription endpoint',
      },
      {
        value: 'skip',
        label: 'Skip for now',
        description: 'You can enable later via /voice or settings.json',
      },
    ],
    'Enable voice input (push-to-talk)?',
  );

  const choice = await selector.select();
  if (choice === 'skip') {
    return null;
  }

  // Default STT endpoint derived from the provider base URL
  const defaultEndpoint = buildDefaultSttEndpoint(baseUrl);
  writeStdoutLine(`\nDefault STT endpoint: ${defaultEndpoint}`);
  const endpointInput = await promptText(
    `STT endpoint (press Enter to use default): `,
  );
  const endpoint = endpointInput.trim() || defaultEndpoint;

  // STT API key env var — default to the same env key as the provider
  const defaultEnvKey = preset.defaultEnvKey;
  const envKeyInput = await promptText(
    `API key env var for STT (default: ${defaultEnvKey}): `,
  );
  const envKey = envKeyInput.trim() || defaultEnvKey;

  return { endpoint, envKey, enabled: true };
}

// ─── Text input helpers ─────────────────────────────────────────────

function promptText(label: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    stdout.write(label);

    if (!stdin.setRawMode) {
      reject(
        new Error(
          'Raw mode not available. Please run in an interactive terminal.',
        ),
      );
      return;
    }

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (chunk: string) => {
      for (const char of chunk) {
        switch (char) {
          case '\r':
          case '\n':
            stdin.removeListener('data', onData);
            stdin.setRawMode(wasRaw);
            stdout.write('\n');
            resolve(input);
            return;
          case '\x03': // Ctrl+C
            stdin.removeListener('data', onData);
            stdin.setRawMode(wasRaw);
            stdout.write('\n');
            reject(new Error('Interrupted'));
            return;
          case '\x08': // Backspace
          case '\x7F': // Delete
            if (input.length > 0) {
              input = input.slice(0, -1);
              stdout.write('\x1B[D \x1B[D');
            }
            break;
          default:
            if (char.charCodeAt(0) >= 32) {
              input += char;
              stdout.write(char);
            }
            break;
        }
      }
    };

    stdin.on('data', onData);
  });
}

function promptMaskedText(label: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    stdout.write(label);

    if (!stdin.setRawMode) {
      reject(
        new Error(
          'Raw mode not available. Please run in an interactive terminal.',
        ),
      );
      return;
    }

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (chunk: string) => {
      for (const char of chunk) {
        switch (char) {
          case '\r':
          case '\n':
            stdin.removeListener('data', onData);
            stdin.setRawMode(wasRaw);
            stdout.write('\n');
            resolve(input);
            return;
          case '\x03': // Ctrl+C
            stdin.removeListener('data', onData);
            stdin.setRawMode(wasRaw);
            stdout.write('\n');
            reject(new Error('Interrupted'));
            return;
          case '\x08':
          case '\x7F':
            if (input.length > 0) {
              input = input.slice(0, -1);
              stdout.write('\x1B[D \x1B[D');
            }
            break;
          default:
            if (char.charCodeAt(0) >= 32) {
              input += char;
              stdout.write('*');
            }
            break;
        }
      }
    };

    stdin.on('data', onData);
  });
}

// ─── Persistence ────────────────────────────────────────────────────

async function persistSetup(
  preset: (typeof PROVIDER_PRESETS)[ProviderPresetKey],
  baseUrl: string,
  apiKey: string,
  apiKeyFromEnv: boolean,
  defaultModelId: string,
  discoveredModels: DiscoveredModel[],
  label?: string,
  sttConfig?: SttConfig | null,
): Promise<void> {
  const settings = loadSettings();
  const scope = getPersistScopeForModelSelection(settings);

  // Backup before mutation
  const settingsFile = settings.forScope(scope);
  backupSettingsFile(settingsFile.path);

  // Build model configs from discovered models (or just the default)
  const envKey = preset.defaultEnvKey;
  const modelConfigs: ModelConfig[] =
    discoveredModels.length > 0
      ? discoveredModels.map((m) => ({
          id: m.id,
          name: label ? `${label} — ${m.id}` : m.id,
          envKey,
          baseUrl,
        }))
      : [
          {
            id: defaultModelId,
            name: label ? `${label} — ${defaultModelId}` : defaultModelId,
            envKey,
            baseUrl,
          },
        ];

  // Merge with existing configs, removing duplicates by baseUrl+id
  const existing =
    (settings.merged.modelProviders as Record<string, ModelConfig[]>)?.[
      preset.authType
    ] || [];

  const existingNonOverlapping = existing.filter(
    (e) => !modelConfigs.some((n) => n.id === e.id && n.baseUrl === e.baseUrl),
  );

  const merged = [...modelConfigs, ...existingNonOverlapping];

  // Persist model providers
  settings.setValue(scope, `modelProviders.${preset.authType}`, merged);

  // Only write the API key to disk if the user explicitly typed it.
  // Keys already present in the environment stay there — no silent promotion
  // of env-only secrets to plaintext on disk.
  if (!apiKeyFromEnv) {
    settings.setValue(scope, `env.${envKey}`, apiKey);
  }

  // Set auth type
  settings.setValue(scope, 'security.auth.selectedType', preset.authType);

  // Set default model
  settings.setValue(scope, 'model.name', defaultModelId);

  // Persist voice / STT settings
  if (sttConfig) {
    settings.setValue(scope, 'voice.enabled', sttConfig.enabled);
    settings.setValue(scope, 'voice.sttEndpoint', sttConfig.endpoint);
    settings.setValue(scope, 'voice.sttEnvKey', sttConfig.envKey);
  }
}
