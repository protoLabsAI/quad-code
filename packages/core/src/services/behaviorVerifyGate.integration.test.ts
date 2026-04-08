/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for BehaviorVerifyGate and RepoMapService file-path resolution.
 *
 * These tests use the real filesystem to verify:
 *   1. `BehaviorVerifyGate.loadScenarios` resolves `.proto/verify-scenarios.json`
 *      relative to the projectRoot argument (which should be `Config.getTargetDir()`,
 *      not `Config.getWorkingDir()` in edge cases where they differ).
 *   2. `BehaviorVerifyGate.runScenarios` correctly passes `cwd` to scenario commands.
 *   3. `RepoMapService.getRelevantFiles` uses the correct project root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorVerifyGate } from './behaviorVerifyGate.js';
import { RepoMapService } from './repoMapService.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'proto-harness-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── BehaviorVerifyGate file path resolution ─────────────────────────────────

describe('BehaviorVerifyGate.loadScenarios — file path resolution', () => {
  it('returns [] when .proto/verify-scenarios.json does not exist', async () => {
    const scenarios = await BehaviorVerifyGate.loadScenarios(tmpDir);
    expect(scenarios).toEqual([]);
  });

  it('loads scenarios from <projectRoot>/.proto/verify-scenarios.json', async () => {
    await mkdir(path.join(tmpDir, '.proto'));
    await writeFile(
      path.join(tmpDir, '.proto', 'verify-scenarios.json'),
      JSON.stringify([
        { name: 'echo test', command: 'echo hello' },
        { name: 'build', command: 'npm run build', timeoutMs: 30000 },
      ]),
      'utf8',
    );

    const scenarios = await BehaviorVerifyGate.loadScenarios(tmpDir);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0]).toMatchObject({
      name: 'echo test',
      command: 'echo hello',
    });
    expect(scenarios[1]).toMatchObject({
      name: 'build',
      command: 'npm run build',
      timeoutMs: 30000,
    });
  });

  it('returns [] gracefully on malformed JSON', async () => {
    await mkdir(path.join(tmpDir, '.proto'));
    await writeFile(
      path.join(tmpDir, '.proto', 'verify-scenarios.json'),
      'NOT VALID JSON',
      'utf8',
    );
    const scenarios = await BehaviorVerifyGate.loadScenarios(tmpDir);
    expect(scenarios).toEqual([]);
  });

  it('returns [] gracefully on non-array JSON', async () => {
    await mkdir(path.join(tmpDir, '.proto'));
    await writeFile(
      path.join(tmpDir, '.proto', 'verify-scenarios.json'),
      JSON.stringify({ not: 'an array' }),
      'utf8',
    );
    const scenarios = await BehaviorVerifyGate.loadScenarios(tmpDir);
    expect(scenarios).toEqual([]);
  });

  it('resolves from projectRoot regardless of process.cwd()', async () => {
    // The key invariant: loadScenarios(projectRoot) must use the provided path,
    // not process.cwd() — this catches bugs where getWorkingDir() was used
    // instead of getTargetDir().
    const subdir = path.join(tmpDir, 'subdir');
    await mkdir(subdir);
    await mkdir(path.join(tmpDir, '.proto'));
    await writeFile(
      path.join(tmpDir, '.proto', 'verify-scenarios.json'),
      JSON.stringify([{ name: 'test', command: 'echo ok' }]),
      'utf8',
    );

    // Load from the parent (projectRoot) — should find the file
    const fromParent = await BehaviorVerifyGate.loadScenarios(tmpDir);
    expect(fromParent).toHaveLength(1);

    // Load from the subdir — should NOT find the file (no .proto/ there)
    const fromSubdir = await BehaviorVerifyGate.loadScenarios(subdir);
    expect(fromSubdir).toEqual([]);
  });
});

describe('BehaviorVerifyGate.runScenarios — cwd resolution', () => {
  it('runs commands in the provided cwd', async () => {
    // Write a sentinel file in tmpDir and check it via a scenario
    await writeFile(path.join(tmpDir, 'sentinel.txt'), 'ok', 'utf8');

    const results = await BehaviorVerifyGate.runScenarios(
      [
        {
          name: 'check sentinel',
          command:
            process.platform === 'win32'
              ? 'type sentinel.txt'
              : 'cat sentinel.txt',
        },
      ],
      tmpDir, // cwd
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.output).toContain('ok');
  });

  it('scenario fails when run from wrong cwd', async () => {
    // sentinel.txt exists in tmpDir but NOT in os.tmpdir() itself
    await writeFile(path.join(tmpDir, 'sentinel.txt'), 'ok', 'utf8');

    const results = await BehaviorVerifyGate.runScenarios(
      [
        {
          name: 'check sentinel from wrong dir',
          command:
            process.platform === 'win32'
              ? 'type sentinel.txt'
              : 'cat sentinel.txt',
        },
      ],
      os.tmpdir(), // wrong cwd — sentinel.txt is not here
    );

    expect(results[0]!.passed).toBe(false);
  });
});

// ─── RepoMapService file path resolution ─────────────────────────────────────

describe('RepoMapService — project root resolution', () => {
  it('returns empty map for a directory with no source files', async () => {
    const service = new RepoMapService(tmpDir);
    const result = await service.getRelevantFiles([], 10);
    expect(result.totalFiles).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('discovers source files under projectRoot', async () => {
    // Create a minimal TS file structure
    const srcDir = path.join(tmpDir, 'src');
    await mkdir(srcDir);
    await writeFile(
      path.join(srcDir, 'index.ts'),
      `export const foo = 1;\nexport function bar() {}\n`,
      'utf8',
    );
    await writeFile(
      path.join(srcDir, 'utils.ts'),
      `import { foo } from './index.js';\nexport const baz = foo + 1;\n`,
      'utf8',
    );

    const service = new RepoMapService(tmpDir);
    const result = await service.getRelevantFiles([], 10);

    expect(result.totalFiles).toBe(2);
    const fileNames = result.entries.map((e) => path.basename(e.file));
    expect(fileNames).toContain('index.ts');
    expect(fileNames).toContain('utils.ts');
  });

  it('writes cache to <projectRoot>/.proto/repo-map-cache.json', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await mkdir(srcDir);
    await writeFile(path.join(srcDir, 'a.ts'), 'export const x = 1;\n', 'utf8');

    const service = new RepoMapService(tmpDir);
    await service.getRelevantFiles([], 5);

    // Cache should be written to .proto/ relative to projectRoot
    const { existsSync } = await import('node:fs');
    expect(existsSync(path.join(tmpDir, '.proto', 'repo-map-cache.json'))).toBe(
      true,
    );
  });

  it('personalizes ranking from seed files', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await mkdir(srcDir);

    // hub.ts is imported by both other files → should rank higher without seed
    // leaf.ts only imports hub → should rank higher when seeded from hub
    await writeFile(
      path.join(srcDir, 'hub.ts'),
      'export const hub = 1;\n',
      'utf8',
    );
    await writeFile(
      path.join(srcDir, 'a.ts'),
      `import { hub } from './hub.js';\nexport const a = hub;\n`,
      'utf8',
    );
    await writeFile(
      path.join(srcDir, 'b.ts'),
      `import { hub } from './hub.js';\nexport const b = hub;\n`,
      'utf8',
    );

    const service = new RepoMapService(tmpDir);

    // Without seed: hub.ts should appear in results (it's the most-imported file)
    const unseeded = await service.getRelevantFiles([], 5);
    const unseededExports = unseeded.entries.flatMap((e) => e.exports);
    expect(unseededExports).toContain('hub');

    // With seed = hub.ts: a.ts and b.ts (which import hub) should appear
    service.invalidate();
    const seeded = await service.getRelevantFiles(
      [path.join(srcDir, 'hub.ts')],
      5,
    );
    expect(seeded.seedFiles).toContain(path.join(srcDir, 'hub.ts'));
    const names = seeded.entries.map((e) => path.basename(e.file));
    expect(names).toContain('hub.ts');
  });
});
