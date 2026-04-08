/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview MailboxSendTool and MailboxReceiveTool — tool wrappers around
 * TeamMailbox that allow spawned agents to communicate with each other.
 *
 * These tools are instantiated per-agent with a shared TeamMailbox reference
 * and injected into each agent's ToolConfig at spawn time by TeamOrchestrator.
 */

import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { TeamMailbox } from '../agents/mailbox.js';

// ─── MailboxSend ──────────────────────────────────────────────

export interface MailboxSendParams {
  to: string;
  content: string;
}

class MailboxSendInvocation extends BaseToolInvocation<
  MailboxSendParams,
  ToolResult
> {
  constructor(
    private readonly mailbox: TeamMailbox,
    private readonly agentId: string,
    params: MailboxSendParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Send message to "${this.params.to}"`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const registered = this.mailbox.getRegisteredAgents();
    if (!registered.includes(this.params.to)) {
      const errText = `Error: agent "${this.params.to}" is not registered in the team mailbox. Registered agents: ${registered.join(', ')}.`;
      return { llmContent: errText, returnDisplay: errText };
    }
    const msg = this.mailbox.send(
      this.agentId,
      this.params.to,
      this.params.content,
    );
    const text = `Message sent to "${this.params.to}" (id: ${msg.id}).`;
    return { llmContent: text, returnDisplay: text };
  }
}

/**
 * Sends a message from this agent to another team member's inbox.
 * The `agentId` of this agent is bound at construction time.
 */
export class MailboxSendTool extends BaseDeclarativeTool<
  MailboxSendParams,
  ToolResult
> {
  static readonly ToolName = 'mailbox_send';

  constructor(
    private readonly mailbox: TeamMailbox,
    private readonly agentId: string,
  ) {
    super(
      MailboxSendTool.ToolName,
      'MailboxSend',
      'Send a message to another agent in the team. Use this to delegate tasks, share results, or coordinate with teammates.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'The agentId of the recipient agent.',
          },
          content: {
            type: 'string',
            description: 'The message body. Be concise and actionable.',
          },
        },
        required: ['to', 'content'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(params: MailboxSendParams) {
    return new MailboxSendInvocation(this.mailbox, this.agentId, params);
  }
}

// ─── MailboxReceive ───────────────────────────────────────────

export type MailboxReceiveParams = Record<string, never>;

class MailboxReceiveInvocation extends BaseToolInvocation<
  MailboxReceiveParams,
  ToolResult
> {
  constructor(
    private readonly mailbox: TeamMailbox,
    private readonly agentId: string,
    params: MailboxReceiveParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return 'Check mailbox inbox';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const messages = this.mailbox.receive(this.agentId);
    if (messages.length === 0) {
      const text = 'No new messages in your inbox.';
      return { llmContent: text, returnDisplay: text };
    }
    const lines = messages.map(
      (m) =>
        `[${new Date(m.timestamp).toISOString()}] From ${m.from}: ${m.content}`,
    );
    const text = lines.join('\n');
    return { llmContent: text, returnDisplay: text };
  }
}

/**
 * Drains unread messages from this agent's inbox and returns them as text.
 */
export class MailboxReceiveTool extends BaseDeclarativeTool<
  MailboxReceiveParams,
  ToolResult
> {
  static readonly ToolName = 'mailbox_receive';

  constructor(
    private readonly mailbox: TeamMailbox,
    private readonly agentId: string,
  ) {
    super(
      MailboxReceiveTool.ToolName,
      'MailboxReceive',
      'Check your inbox for new messages from teammates. Returns all unread messages and clears them.',
      Kind.Read,
      {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(params: MailboxReceiveParams) {
    return new MailboxReceiveInvocation(this.mailbox, this.agentId, params);
  }
}
