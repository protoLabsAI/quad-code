/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  BrowserTool,
  BrowserToolInvocation,
  type BrowserToolParams,
} from './browser-tool.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
  },
}));

const mockSpawn = vi.mocked(spawn);
const mockExistsSync = vi.mocked(fs.existsSync);

const mockConfig = {
  getTargetDir: () => '/test/dir',
  getDebugMode: () => false,
  getToolTruncationLimits: () => ({
    browser: { threshold: 50000, lines: 1000 },
  }),
} as unknown as import('../config/config.js').Config;

describe('BrowserTool', () => {
  let browserTool: BrowserTool;

  beforeEach(() => {
    browserTool = new BrowserTool(mockConfig);
  });

  describe('constructor', () => {
    it('should create a BrowserTool with correct name', () => {
      expect(browserTool.name).toBe('browser');
    });

    it('should have correct display name', () => {
      expect(browserTool.displayName).toBe('Browser');
    });

    it('should have a valid schema', () => {
      expect(browserTool.schema).toBeDefined();
      expect(browserTool.schema.parametersJsonSchema).toBeDefined();
    });
  });

  describe('build', () => {
    it('should build invocation for open action with url', () => {
      const params: BrowserToolParams = {
        action: 'open',
        url: 'https://example.com',
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for close action without additional params', () => {
      const params: BrowserToolParams = {
        action: 'close',
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for snapshot action', () => {
      const params: BrowserToolParams = {
        action: 'snapshot',
        flags: JSON.stringify({ interactive: true, urls: true }),
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for batch action with commands', () => {
      const params: BrowserToolParams = {
        action: 'batch',
        commands: ['open https://example.com', 'snapshot -i'],
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for screenshot action', () => {
      const params: BrowserToolParams = {
        action: 'screenshot',
        outputPath: '/tmp/screenshot.png',
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for get action', () => {
      const params: BrowserToolParams = {
        action: 'get',
        text: 'title',
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for find action', () => {
      const params: BrowserToolParams = {
        action: 'find',
        selector: 'role button',
        text: 'click',
      };
      const invocation = browserTool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should build invocation for all action types', () => {
      const actions = [
        'open',
        'close',
        'snapshot',
        'click',
        'dblclick',
        'fill',
        'type',
        'press',
        'screenshot',
        'get',
        'is',
        'find',
        'wait',
        'batch',
        'scroll',
        'hover',
        'select',
        'check',
        'uncheck',
        'upload',
        'clipboard',
        'mouse',
        'keyboard',
        'tab',
        'window',
        'cookies',
        'storage',
        'network',
        'diff',
        'chat',
        'install',
        'profiles',
        'dashboard',
        'console',
        'errors',
        'trace',
        'profiler',
        'inspect',
        'eval',
      ];

      for (const action of actions) {
        const params: BrowserToolParams = {
          action: action as BrowserToolParams['action'],
        };
        // Only actions with required params will fail validation
        if (action === 'open') {
          params.url = 'https://example.com';
        } else if (
          [
            'click',
            'dblclick',
            'fill',
            'type',
            'hover',
            'check',
            'uncheck',
            'select',
            'upload',
          ].includes(action)
        ) {
          params.selector = '#test';
        }
        if (action === 'fill') {
          params.text = 'test';
        }

        const invocation = browserTool.build(params);
        expect(invocation).toBeDefined();
      }
    });
  });

  describe('invocation description', () => {
    it('should generate description for open action', () => {
      const params: BrowserToolParams = {
        action: 'open',
        url: 'https://example.com',
      };
      const invocation = browserTool.build(params);
      expect(invocation.getDescription()).toContain('Browser open');
      expect(invocation.getDescription()).toContain('example.com');
    });

    it('should generate description for click action', () => {
      const params: BrowserToolParams = {
        action: 'click',
        selector: '#button',
      };
      const invocation = browserTool.build(params);
      expect(invocation.getDescription()).toContain('Browser click');
      expect(invocation.getDescription()).toContain('#button');
    });

    it('should generate summary label', () => {
      const params: BrowserToolParams = {
        action: 'snapshot',
      };
      const invocation = browserTool.build(params);
      expect(invocation.getSummaryLabel()).toBe('Browser snapshot');
    });
  });

  describe('permission handling', () => {
    it('should require confirmation by default', async () => {
      const params: BrowserToolParams = {
        action: 'open',
        url: 'https://example.com',
      };
      const invocation = browserTool.build(params);
      const permission = await invocation.getDefaultPermission();
      expect(permission).toBe('ask');
    });

    it('should return info type confirmation details', async () => {
      const params: BrowserToolParams = {
        action: 'open',
        url: 'https://example.com',
      };
      const invocation = browserTool.build(params);
      const details = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );
      expect(details.type).toBe('info');
      expect(details.title).toBe('Confirm Browser Automation');
    });
  });

  describe('schema', () => {
    it('should have correct required fields', () => {
      const schema = browserTool.schema.parametersJsonSchema as {
        required: string[];
        properties: Record<string, unknown>;
      };
      expect(schema.required).toContain('action');
      expect(schema.properties['action']).toBeDefined();
    });

    it('should have enum for action field', () => {
      const schema = browserTool.schema.parametersJsonSchema as {
        properties: { action: { enum: string[] } };
      };
      expect(schema.properties['action'].enum).toContain('open');
      expect(schema.properties['action'].enum).toContain('close');
      expect(schema.properties['action'].enum).toContain('snapshot');
      expect(schema.properties['action'].enum).toContain('click');
    });
  });

  // ─── execute() tests ────────────────────────────────────────────────────────
  //
  // vi.mock('node:child_process') is hoisted to the top of the module so the
  // real spawn is never called.  makeChild() configures mockSpawn and returns
  // a fake ChildProcess that we drive by emitting events.

  describe('execute()', () => {
    function makeChild() {
      const child = new EventEmitter();
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      (child as unknown as Record<string, unknown>).stdout = stdout;
      (child as unknown as Record<string, unknown>).stderr = stderr;
      mockSpawn.mockReturnValueOnce(
        child as unknown as ReturnType<typeof spawn>,
      );
      return { child, stdout, stderr };
    }

    beforeEach(() => {
      mockSpawn.mockReset();
      mockExistsSync.mockReset();
      // Reset the static binary path cache so each test re-runs discovery.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (BrowserToolInvocation as any).agentBrowserPath = null;
    });

    it('returns "not installed" error when binary is absent', async () => {
      mockExistsSync.mockReturnValue(false);

      const invocation = browserTool.build({
        action: 'open',
        url: 'https://example.com',
      });
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error).toBeDefined();
      expect(result.llmContent).toMatch(/not installed/i);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('resolves with stdout content on exit code 0', async () => {
      // existsSync returns true for the first PATH entry → findAgentBrowser succeeds.
      mockExistsSync.mockReturnValue(true);
      const { child, stdout } = makeChild();

      const invocation = browserTool.build({ action: 'snapshot' });
      const resultPromise = invocation.execute(new AbortController().signal);

      stdout.emit('data', Buffer.from('accessibility tree output'));
      child.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('accessibility tree output');
    });

    it('resolves with error result on non-zero exit code', async () => {
      mockExistsSync.mockReturnValue(true);
      const { child, stderr } = makeChild();

      const invocation = browserTool.build({
        action: 'open',
        url: 'https://example.com',
      });
      const resultPromise = invocation.execute(new AbortController().signal);

      stderr.emit('data', Buffer.from('browser launch failed'));
      child.emit('close', 1, null);

      const result = await resultPromise;
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('browser_tool_error');
    });

    it('resolves cancelled when AbortError fires; close does not double-resolve', async () => {
      mockExistsSync.mockReturnValue(true);
      const { child } = makeChild();

      const controller = new AbortController();
      const invocation = browserTool.build({
        action: 'open',
        url: 'https://example.com',
      });
      const resultPromise = invocation.execute(controller.signal);

      // error fires first (AbortError from spawn's abort signal)
      child.emit(
        'error',
        Object.assign(new Error('spawn aborted'), { name: 'AbortError' }),
      );

      // close fires immediately after (normal Node behaviour)
      controller.abort();
      child.emit('close', null, 'SIGTERM');

      const result = await resultPromise;
      // settle() guard: only the first resolve wins
      expect(result.llmContent).toMatch(/cancelled/i);
    });

    it('resolves with error for non-abort spawn failure', async () => {
      mockExistsSync.mockReturnValue(true);
      const { child } = makeChild();

      const invocation = browserTool.build({
        action: 'open',
        url: 'https://example.com',
      });
      const resultPromise = invocation.execute(new AbortController().signal);

      child.emit('error', new Error('ENOENT: spawn failed'));

      const result = await resultPromise;
      expect(result.error).toBeDefined();
      expect(result.llmContent).toMatch(/Failed to execute agent-browser/i);
    });
  });
});
