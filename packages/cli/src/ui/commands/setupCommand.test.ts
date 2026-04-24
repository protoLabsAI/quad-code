/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupCommand } from './setupCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('setupCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have the correct name and description', () => {
    expect(setupCommand.name).toBe('setup');
    expect(setupCommand.description).toContain('model provider');
  });

  it('should return a message action pointing to proto setup', () => {
    if (!setupCommand.action) {
      throw new Error('The setup command must have an action.');
    }
    const result = setupCommand.action(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('proto setup'),
    });
  });
});
