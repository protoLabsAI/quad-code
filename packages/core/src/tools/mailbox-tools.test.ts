/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TeamMailbox } from '../agents/mailbox.js';
import { MailboxSendTool, MailboxReceiveTool } from './mailbox-tools.js';

const ABORT = new AbortController().signal;

describe('MailboxSendTool', () => {
  let mailbox: TeamMailbox;
  let sendTool: MailboxSendTool;

  beforeEach(() => {
    mailbox = new TeamMailbox();
    mailbox.register('agent-a');
    mailbox.register('agent-b');
    sendTool = new MailboxSendTool(mailbox, 'agent-a');
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(sendTool.name).toBe('mailbox_send');
      expect(MailboxSendTool.ToolName).toBe('mailbox_send');
    });

    it('has correct display name', () => {
      expect(sendTool.displayName).toBe('MailboxSend');
    });

    it('has correct kind', () => {
      expect(sendTool.kind).toBe('other');
    });
  });

  describe('execute', () => {
    it('sends a message to a registered recipient', async () => {
      const invocation = sendTool.build({ to: 'agent-b', content: 'hello' });
      const result = await invocation.execute(ABORT);
      expect(result.llmContent).toContain('Message sent');
      expect(result.llmContent).toContain('agent-b');
      expect(mailbox.getUnreadCount('agent-b')).toBe(1);
    });

    it('returns an error when recipient is not registered', async () => {
      const invocation = sendTool.build({ to: 'ghost', content: 'hi' });
      const result = await invocation.execute(ABORT);
      expect(result.llmContent).toContain('not registered');
      expect(result.llmContent).toContain('agent-a');
      expect(result.llmContent).toContain('agent-b');
    });

    it('enqueues in the correct inbox', async () => {
      const invocation = sendTool.build({
        to: 'agent-b',
        content: 'task: search for X',
      });
      await invocation.execute(ABORT);
      const msgs = mailbox.receive('agent-b');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.content).toBe('task: search for X');
      expect(msgs[0]!.from).toBe('agent-a');
    });
  });

  describe('validation', () => {
    it('rejects missing "to" parameter', () => {
      expect(() => sendTool.build({ content: 'hi' } as never)).toThrow();
    });

    it('rejects missing "content" parameter', () => {
      expect(() => sendTool.build({ to: 'agent-b' } as never)).toThrow();
    });
  });
});

describe('MailboxReceiveTool', () => {
  let mailbox: TeamMailbox;
  let receiveTool: MailboxReceiveTool;

  beforeEach(() => {
    mailbox = new TeamMailbox();
    mailbox.register('agent-a');
    mailbox.register('agent-b');
    receiveTool = new MailboxReceiveTool(mailbox, 'agent-a');
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(receiveTool.name).toBe('mailbox_receive');
      expect(MailboxReceiveTool.ToolName).toBe('mailbox_receive');
    });

    it('has correct display name', () => {
      expect(receiveTool.displayName).toBe('MailboxReceive');
    });

    it('has correct kind', () => {
      expect(receiveTool.kind).toBe('read');
    });
  });

  describe('execute', () => {
    it('returns unread messages', async () => {
      mailbox.send('agent-b', 'agent-a', 'task complete');
      const invocation = receiveTool.build({});
      const result = await invocation.execute(ABORT);
      expect(result.llmContent).toContain('task complete');
      expect(result.llmContent).toContain('agent-b');
    });

    it('drains messages on receive — second call returns empty', async () => {
      mailbox.send('agent-b', 'agent-a', 'first message');
      const invocation1 = receiveTool.build({});
      await invocation1.execute(ABORT);

      const invocation2 = receiveTool.build({});
      const result2 = await invocation2.execute(ABORT);
      expect(result2.llmContent).toContain('No new messages');
    });

    it('returns empty message when inbox has nothing', async () => {
      const invocation = receiveTool.build({});
      const result = await invocation.execute(ABORT);
      expect(result.llmContent).toContain('No new messages');
    });

    it('includes timestamp in output', async () => {
      mailbox.send('agent-b', 'agent-a', 'ping');
      const invocation = receiveTool.build({});
      const result = await invocation.execute(ABORT);
      // ISO timestamp pattern
      expect(result.llmContent).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });
});
