/**
 * @license
 * Copyright 2025 protoLabs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview TeamOrchestrator — runtime session for a live agent team.
 *
 * Holds the Backend, TeamMailbox, and live per-member state. Responsible for:
 * - Resolving agentType strings to SubagentConfig via SubagentManager
 * - Registering each member in the shared TeamMailbox
 * - Injecting MailboxSendTool + MailboxReceiveTool into each agent's ToolConfig
 * - Spawning agents via the InProcessBackend
 * - Stopping all agents and cleaning up on stop()
 */

import * as path from 'node:path';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import { detectBackend } from './backends/detect.js';
import type { Backend, AgentSpawnConfig } from './backends/types.js';
import { TeamMailbox } from './mailbox.js';
import {
  type TeamConfigData,
  type TeamMember,
  readTeamConfig,
  writeTeamConfig,
  updateMemberStatus,
} from './team-config.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import { MailboxSendTool, MailboxReceiveTool } from '../tools/mailbox-tools.js';

const debugLogger = createDebugLogger('TEAM_ORCHESTRATOR');

export class TeamOrchestrator {
  private readonly mailbox: TeamMailbox;
  private readonly subagentManager: SubagentManager;
  private started = false;
  private stopped = false;

  private constructor(
    private readonly projectDir: string,
    private readonly coreConfig: Config,
    private readonly teamConfig: TeamConfigData,
    private readonly backend: Backend,
  ) {
    this.mailbox = new TeamMailbox();
    this.subagentManager = new SubagentManager(coreConfig);
  }

  /**
   * Create a TeamOrchestrator with a detected backend.
   */
  static async create(
    projectDir: string,
    coreConfig: Config,
    teamConfig: TeamConfigData,
  ): Promise<TeamOrchestrator> {
    const { backend } = await detectBackend(undefined, coreConfig);
    return new TeamOrchestrator(projectDir, coreConfig, teamConfig, backend);
  }

  getTeamName(): string {
    return this.teamConfig.name;
  }

  getMailbox(): TeamMailbox {
    return this.mailbox;
  }

  /**
   * Spawn all team members. Idempotent — calling start() twice is a no-op.
   */
  async start(): Promise<void> {
    if (this.started) {
      debugLogger.warn(`Team "${this.teamConfig.name}" is already started.`);
      return;
    }
    this.started = true;

    await this.backend.init();

    // Register all members in the mailbox before spawning so agents can
    // send messages to each other from the very first turn.
    for (const member of this.teamConfig.members) {
      this.mailbox.register(member.agentId);
      debugLogger.debug(`Registered mailbox inbox for: ${member.agentId}`);
    }

    // Update config file when a member finishes
    this.backend.setOnAgentExit((agentId, exitCode) => {
      const member = this.teamConfig.members.find((m) => m.agentId === agentId);
      if (member) {
        const status = exitCode === 0 ? 'completed' : 'failed';
        void updateMemberStatus(
          this.projectDir,
          this.teamConfig.name,
          member.name,
          status,
        );
        debugLogger.info(`Member "${member.name}" exited — status: ${status}`);
      }
    });

    // Spawn each member sequentially so config file writes don't race
    for (const member of this.teamConfig.members) {
      await this.spawnMember(member);
    }

    debugLogger.info(
      `Team "${this.teamConfig.name}" started with ${this.teamConfig.members.length} members.`,
    );
  }

  /**
   * Stop all running agents, update config file, and release resources.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    this.backend.stopAll();
    await this.backend.cleanup();
    this.mailbox.clear();

    // Update persisted config
    const config = await readTeamConfig(this.projectDir, this.teamConfig.name);
    if (config) {
      config.status = 'stopped';
      for (const member of config.members) {
        if (member.status === 'running') member.status = 'idle';
      }
      await writeTeamConfig(this.projectDir, this.teamConfig.name, config);
    }

    debugLogger.info(`Team "${this.teamConfig.name}" stopped.`);
  }

  // ─── Private ────────────────────────────────────────────────

  private async spawnMember(member: TeamMember): Promise<void> {
    // 1. Resolve agentType string → SubagentConfig
    const subagentConfig = await this.subagentManager.loadSubagent(
      member.agentType,
    );

    if (!subagentConfig) {
      debugLogger.error(
        `Unknown agentType "${member.agentType}" for member "${member.name}". Skipping.`,
      );
      await updateMemberStatus(
        this.projectDir,
        this.teamConfig.name,
        member.name,
        'failed',
      );
      return;
    }

    // 2. Convert to runtime config
    const runtimeConfig =
      this.subagentManager.convertToRuntimeConfig(subagentConfig);

    // 3. Inject mailbox tools into the agent's tool config
    const sendTool = new MailboxSendTool(this.mailbox, member.agentId);
    const receiveTool = new MailboxReceiveTool(this.mailbox, member.agentId);
    const mailboxToolNames = [sendTool.name, receiveTool.name];

    const toolConfig = runtimeConfig.toolConfig
      ? {
          ...runtimeConfig.toolConfig,
          tools: [
            ...(runtimeConfig.toolConfig.tools ?? []),
            ...mailboxToolNames,
          ],
        }
      : { tools: mailboxToolNames };

    // 4. Build spawn config
    const spawnConfig: AgentSpawnConfig = {
      agentId: member.agentId,
      command: process.execPath,
      args: [path.resolve(process.argv[1]!)],
      cwd: this.coreConfig.getWorkingDir(),
      inProcess: {
        agentName: member.name,
        runtimeConfig: {
          ...runtimeConfig,
          toolConfig,
        },
      },
    };

    // 5. Mark member as running in config file
    await updateMemberStatus(
      this.projectDir,
      this.teamConfig.name,
      member.name,
      'running',
    );

    // 6. Spawn via backend
    try {
      await this.backend.spawnAgent(spawnConfig);
      debugLogger.info(
        `Spawned member "${member.name}" (${member.agentType}) as ${member.agentId}`,
      );
    } catch (error) {
      debugLogger.error(`Failed to spawn member "${member.name}":`, error);
      await updateMemberStatus(
        this.projectDir,
        this.teamConfig.name,
        member.name,
        'failed',
      );
    }
  }
}
