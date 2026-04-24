/**
 * Post-turn evolve pipeline.
 *
 * Every SKILL_REVIEW_INTERVAL turns, a lightweight background agent analyzes
 * recent conversation history to detect reusable workflow patterns. When found,
 * it drafts a SKILL.md candidate in .proto/evolve/skills/ and queues it as a
 * pending memory proposal for user review.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import {
  AgentHeadless,
  ContextState,
} from '../agents/runtime/agent-headless.js';
import type {
  PromptConfig,
  RunConfig,
  ToolConfig,
} from '../agents/runtime/agent-types.js';
import { ToolNames } from '../tools/tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { getProposalsDir } from '../memory/proposalStore.js';
import { QWEN_DIR } from '../config/storage.js';

const logger = createDebugLogger('EVOLVE_SERVICE');

const SKILL_REVIEW_INTERVAL = 3;
const MAX_EVOLVE_TURNS = 2;
const MAX_EVOLVE_MINUTES = 2;
const MIN_CONFIDENCE_WORDS = 30;
const EVOLVE_DIR_NAME = 'evolve';

export const EVOLVE_SKILLS_DIR = path.join(QWEN_DIR, EVOLVE_DIR_NAME, 'skills');

let turnsSinceLastReview = 0;

/**
 * Call after each agent turn completes. Runs skill candidate detection every
 * SKILL_REVIEW_INTERVAL turns. Fire-and-forget; errors are logged only.
 */
export async function runEvolvePass(
  config: Config,
  recentMessages: Array<{ role: string; text: string }>,
): Promise<void> {
  turnsSinceLastReview++;
  if (turnsSinceLastReview < SKILL_REVIEW_INTERVAL) return;
  turnsSinceLastReview = 0;

  if (recentMessages.length < 4) return;

  const projectRoot = config.getProjectRoot();
  const evolveSkilsDir = path.join(
    projectRoot,
    QWEN_DIR,
    EVOLVE_DIR_NAME,
    'skills',
  );
  const proposalsDir = getProposalsDir('project', projectRoot);

  await fs.mkdir(evolveSkilsDir, { recursive: true }).catch(() => {});
  await fs.mkdir(proposalsDir, { recursive: true }).catch(() => {});

  const recentText = recentMessages
    .slice(-10)
    .map((m) => `[${m.role}]: ${m.text.slice(0, 300)}`)
    .join('\n\n');

  const existingSkills = await getExistingSkillNames(projectRoot);

  const systemPrompt = buildEvolvePrompt(
    recentText,
    existingSkills,
    evolveSkilsDir,
    proposalsDir,
  );

  const promptConfig: PromptConfig = { systemPrompt };
  const runConfig: RunConfig = {
    max_turns: MAX_EVOLVE_TURNS,
    max_time_minutes: MAX_EVOLVE_MINUTES,
  };
  const toolConfig: ToolConfig = {
    tools: [ToolNames.WRITE_FILE, ToolNames.READ_FILE],
  };

  try {
    const agent = await AgentHeadless.create(
      'evolve-skill-detector',
      config,
      promptConfig,
      { model: config.getModel() },
      runConfig,
      toolConfig,
    );

    const context = new ContextState();
    context.set('evolveSkilsDir', evolveSkilsDir);
    context.set('proposalsDir', proposalsDir);

    await agent.execute(context);
    logger.debug('Evolve pass complete');
  } catch (err) {
    logger.debug('Evolve pass skipped:', err);
  }
}

async function getExistingSkillNames(projectRoot: string): Promise<string[]> {
  const skillsDir = path.join(projectRoot, QWEN_DIR, 'skills');
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function buildEvolvePrompt(
  recentText: string,
  existingSkills: string[],
  evolveSkilsDir: string,
  proposalsDir: string,
): string {
  const skillList =
    existingSkills.length > 0 ? existingSkills.join(', ') : '(none yet)';

  return `You are a skill evolution agent. Analyze the recent conversation and decide whether a reusable workflow pattern was demonstrated.

## Task (2 turns max)

Turn 1: Analyze the conversation below. Decide: was there a multi-step workflow the user or agent repeated, or a pattern worth encoding as a reusable /skill?

**Criteria for YES:**
- A workflow requiring 3+ steps that could be templatized
- Something the user explicitly asked for by name ("run the usual deploy sequence", "do the PR review")
- A sequence that would save time if it had a name and could be re-invoked

**Criteria for NO:**
- One-off tasks with no generalization value
- Work that's already covered by an existing skill: ${skillList}
- Pure code changes with no reusable process pattern

If NO: output only the word "SKIP" and stop. Do NOT write any files.

If YES (confidence: you can write at least ${MIN_CONFIDENCE_WORDS} words describing the skill):

Turn 2: Write TWO files:

**File 1** — Draft skill at ${evolveSkilsDir}/<slug>/SKILL.md
Use kebab-case slug from the skill name.
Format:
\`\`\`markdown
---
name: <slug>
description: <one-line description — this is what shows in /skills>
---

# /<slug>

## When to use
<1-2 sentences>

## Steps
<numbered steps>

## Examples
<1-2 concrete examples>
\`\`\`

**File 2** — Proposal at ${proposalsDir}/feedback_skill-candidate-<slug>.md
\`\`\`markdown
---
name: skill-candidate-<slug>
description: Skill candidate detected from recent work — review and promote if useful
type: feedback
---

A skill candidate was detected from recent conversation turns.

**Skill name:** /<slug>
**Draft location:** ${evolveSkilsDir}/<slug>/SKILL.md

To promote: copy the SKILL.md to .proto/skills/<slug>/SKILL.md
To dismiss: delete the draft file and reject this proposal.
\`\`\`

## Recent conversation
${recentText}`;
}
