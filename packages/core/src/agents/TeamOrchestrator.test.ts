/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamOrchestrator } from './TeamOrchestrator.js';
import type { TeamConfigData } from './team-config.js';
import type { Backend } from './backends/types.js';
import { DISPLAY_MODE } from './backends/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBackend(): Backend {
  return {
    type: DISPLAY_MODE.IN_PROCESS,
    init: vi.fn().mockResolvedValue(undefined),
    spawnAgent: vi.fn().mockResolvedValue(undefined),
    stopAgent: vi.fn(),
    stopAll: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
    setOnAgentExit: vi.fn(),
    waitForAll: vi.fn().mockResolvedValue(true),
    switchTo: vi.fn(),
    switchToNext: vi.fn(),
    switchToPrevious: vi.fn(),
    getActiveAgentId: vi.fn().mockReturnValue(null),
    getActiveSnapshot: vi.fn().mockReturnValue(null),
    getAgentSnapshot: vi.fn().mockReturnValue(null),
    getAgentScrollbackLength: vi.fn().mockReturnValue(0),
    forwardInput: vi.fn().mockReturnValue(false),
    writeToAgent: vi.fn().mockReturnValue(false),
    resizeAll: vi.fn(),
    getAttachHint: vi.fn().mockReturnValue(null),
  };
}

function makeConfig() {
  const toolRegistry = {
    getAllTools: vi.fn().mockReturnValue([]),
    stop: vi.fn().mockResolvedValue(undefined),
    copyDiscoveredToolsFrom: vi.fn(),
  };
  return {
    getProjectRoot: vi.fn().mockReturnValue('/tmp/test-project'),
    getWorkingDir: vi.fn().mockReturnValue('/tmp/test-project'),
    getTargetDir: vi.fn().mockReturnValue('/tmp/test-project'),
    getWorkspaceContext: vi.fn(),
    getFileService: vi.fn(),
    getToolRegistry: vi.fn().mockReturnValue(toolRegistry),
    createToolRegistry: vi.fn().mockResolvedValue(toolRegistry),
    getSdkMode: vi.fn().mockReturnValue(false),
    getContentGenerator: vi.fn(),
    getContentGeneratorConfig: vi
      .fn()
      .mockReturnValue({ authType: 'apiKey', model: 'test' }),
    getAuthType: vi.fn(),
    getModel: vi.fn().mockReturnValue('test-model'),
    getActiveExtensions: vi.fn().mockReturnValue([]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeTeamConfig(
  members: Array<{ name: string; agentType: string }> = [
    { name: 'scout', agentType: 'Explore' },
  ],
): TeamConfigData {
  return {
    name: 'test-team',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    members: members.map((m, i) => ({
      name: m.name,
      agentId: `${m.name}-${i}`,
      agentType: m.agentType,
      status: 'idle' as const,
    })),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// Mock detectBackend so tests don't need a real Config
vi.mock('./backends/detect.js', () => ({
  detectBackend: vi.fn(),
}));

// Mock team-config file I/O
vi.mock('./team-config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./team-config.js')>();
  return {
    ...actual,
    readTeamConfig: vi.fn().mockResolvedValue(null),
    writeTeamConfig: vi.fn().mockResolvedValue(undefined),
    updateMemberStatus: vi.fn().mockResolvedValue(null),
  };
});

describe('TeamOrchestrator', () => {
  let backend: Backend;
  let config: ReturnType<typeof makeConfig>;

  beforeEach(async () => {
    vi.clearAllMocks();
    backend = makeBackend();
    config = makeConfig();

    const { detectBackend } = await import('./backends/detect.js');
    vi.mocked(detectBackend).mockResolvedValue({ backend });
  });

  describe('create()', () => {
    it('creates an orchestrator via the static factory', async () => {
      const teamConfig = makeTeamConfig();
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        teamConfig,
      );
      expect(orch).toBeDefined();
      expect(orch.getTeamName()).toBe('test-team');
    });

    it('exposes the team mailbox', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      const mailbox = orch.getMailbox();
      expect(mailbox).toBeDefined();
      expect(typeof mailbox.send).toBe('function');
    });
  });

  describe('start()', () => {
    it('calls backend.init()', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      expect(backend.init).toHaveBeenCalledOnce();
    });

    it('registers all members in the mailbox before spawning', async () => {
      const teamConfig = makeTeamConfig([
        { name: 'alpha', agentType: 'Explore' },
        { name: 'beta', agentType: 'general-purpose' },
      ]);
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        teamConfig,
      );
      await orch.start();

      const registered = orch.getMailbox().getRegisteredAgents();
      expect(registered).toContain('alpha-0');
      expect(registered).toContain('beta-1');
    });

    it('calls backend.spawnAgent once per member', async () => {
      const teamConfig = makeTeamConfig([
        { name: 'alpha', agentType: 'Explore' },
        { name: 'beta', agentType: 'general-purpose' },
      ]);
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        teamConfig,
      );
      await orch.start();
      expect(backend.spawnAgent).toHaveBeenCalledTimes(2);
    });

    it('passes the correct agentId to spawnAgent', async () => {
      const teamConfig = makeTeamConfig([
        { name: 'scout', agentType: 'Explore' },
      ]);
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        teamConfig,
      );
      await orch.start();

      const spawnCall = vi.mocked(backend.spawnAgent).mock.calls[0]![0];
      expect(spawnCall.agentId).toBe('scout-0');
    });

    it('is idempotent — second start() is a no-op', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      await orch.start();
      expect(backend.init).toHaveBeenCalledOnce();
      expect(backend.spawnAgent).toHaveBeenCalledOnce();
    });

    it('registers an exit callback on the backend', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      expect(backend.setOnAgentExit).toHaveBeenCalledOnce();
    });
  });

  describe('stop()', () => {
    it('calls backend.stopAll() and cleanup()', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      await orch.stop();

      expect(backend.stopAll).toHaveBeenCalledOnce();
      expect(backend.cleanup).toHaveBeenCalledOnce();
    });

    it('clears the mailbox on stop', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      // Send a message so mailbox is non-empty
      orch.getMailbox().send('scout-0', 'scout-0', 'test');
      await orch.stop();

      // After stop the mailbox should be cleared
      expect(orch.getMailbox().getRegisteredAgents()).toHaveLength(0);
    });

    it('is idempotent — second stop() is a no-op', async () => {
      const orch = await TeamOrchestrator.create(
        '/tmp/test-project',
        config,
        makeTeamConfig(),
      );
      await orch.start();
      await orch.stop();
      await orch.stop();

      expect(backend.stopAll).toHaveBeenCalledOnce();
      expect(backend.cleanup).toHaveBeenCalledOnce();
    });
  });
});
