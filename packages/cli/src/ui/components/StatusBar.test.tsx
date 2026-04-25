/**
 * @license
 * Copyright 2025 protoLabs.studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import { StatusBar } from './StatusBar.js';

vi.mock('../hooks/useGitBranchName.js', () => ({
  useGitBranchName: vi.fn(() => null),
}));

vi.mock('../hooks/useGitDiffStat.js', () => ({
  useGitDiffStat: vi.fn(() => null),
}));

vi.mock('../hooks/useBackgroundAgentProgress.js', () => ({
  useBackgroundAgentProgress: vi.fn(() => ({ activeAgents: [] })),
}));

import { useGitBranchName } from '../hooks/useGitBranchName.js';
import { useGitDiffStat } from '../hooks/useGitDiffStat.js';
import { useBackgroundAgentProgress } from '../hooks/useBackgroundAgentProgress.js';

const mockBranch = vi.mocked(useGitBranchName);
const mockDiff = vi.mocked(useGitDiffStat);
const mockAgents = vi.mocked(useBackgroundAgentProgress);

const render$ = (props: Partial<React.ComponentProps<typeof StatusBar>> = {}) =>
  render(<StatusBar cwd="/home/user/project" terminalWidth={120} {...props} />);

describe('<StatusBar />', () => {
  beforeEach(() => {
    mockBranch.mockReturnValue(null);
    mockDiff.mockReturnValue(null);
    mockAgents.mockReturnValue({ activeAgents: [] });
  });

  it('renders the ⟡ logo mark', () => {
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('⟡');
  });

  it('displays the current hostname', () => {
    const { lastFrame } = render$();
    expect(lastFrame()).toContain(os.hostname());
  });

  it('displays the hostname icon ⬡', () => {
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('⬡');
  });

  it('displays the cwd with home collapsed to ~', () => {
    const home = os.homedir();
    const { lastFrame } = render$({ cwd: `${home}/projects/myapp` });
    expect(lastFrame()).toContain('~/projects/myapp');
  });

  it('displays the ⌂ icon for cwd', () => {
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('⌂');
  });

  it('shows git branch when available', () => {
    mockBranch.mockReturnValue('main');
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('⎇');
    expect(lastFrame()).toContain('main');
  });

  it('hides git branch section when no branch', () => {
    mockBranch.mockReturnValue(null);
    const { lastFrame } = render$();
    expect(lastFrame()).not.toContain('⎇');
  });

  it('shows diff stat when there are changed files', () => {
    mockDiff.mockReturnValue({
      filesChanged: 3,
      linesAdded: 10,
      linesRemoved: 2,
    });
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('3 files');
    expect(lastFrame()).toContain('+10');
    expect(lastFrame()).toContain('−2');
  });

  it('hides diff stat when there are no changes', () => {
    mockDiff.mockReturnValue({
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
    });
    const { lastFrame } = render$();
    expect(lastFrame()).not.toContain('files');
  });

  it('shows background agent indicator', () => {
    mockAgents.mockReturnValue({
      activeAgents: [
        {
          agentId: 'a1',
          agentName: 'test-agent',
          round: 2,
          toolName: undefined,
        },
      ],
    });
    const { lastFrame } = render$();
    expect(lastFrame()).toContain('⟳ test-agent: turn 2');
  });

  it('shows bg session badge when bgSessionActive is true', () => {
    const { lastFrame } = render$({ bgSessionActive: true });
    expect(lastFrame()).toContain('⟳ bg session');
  });
});
