/**
 * Example 03 — Multi-agent pipeline: architect → implementer
 *
 * Two cooperating subagents handle distinct phases of a feature request:
 *
 *   architect   — read-only, produces a bullet-point implementation plan
 *   implementer — write-capable, follows the architect's plan to edit files
 *
 * The main session orchestrates by first calling the architect, then passing
 * its plan to the implementer.  This pattern prevents the implementer from
 * making architectural decisions and makes the overall process auditable.
 *
 * Run:
 *   npx tsx examples/03-multi-agent-pipeline/index.ts "add input validation to the login handler"
 */

import { query } from '@proto/sdk';
import type { SubagentConfig, SDKUserMessage } from '@proto/sdk';
import { randomUUID } from 'node:crypto';

const featureRequest =
  process.argv[2] ?? 'add basic input validation to user-facing forms';

// Pre-define the session ID so we can reference it inside the message generator.
const sessionId = randomUUID();

// ─── Subagent definitions ─────────────────────────────────────────────────────

const architect: SubagentConfig = {
  name: 'architect',
  description:
    'Plans how to implement a feature. Returns a numbered, step-by-step implementation plan with file paths and specific changes needed. Does NOT write any code.',
  systemPrompt: `You are a senior software architect.

Given a feature request, produce a concise numbered implementation plan:
- List every file that needs to change
- For each file, describe exactly what to add / modify / delete
- Keep each step to 1-2 sentences
- Do not write any code — the implementer will do that

Return ONLY the plan, no preamble.`,
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const implementer: SubagentConfig = {
  name: 'implementer',
  description:
    'Implements a feature by following a provided step-by-step plan. Reads and edits files. Does not make architectural decisions.',
  systemPrompt: `You are a skilled software engineer focused on execution.

You will receive a numbered implementation plan from the architect.
Your job is to execute each step precisely:
- Read the relevant files before editing them
- Make the smallest change that satisfies the step
- Do not refactor or improve code beyond what the plan specifies
- After completing all steps, output a brief summary of what you changed`,
  level: 'session',
  tools: ['read_file', 'write_file', 'edit_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

// ─── Multi-turn conversation generator ───────────────────────────────────────

function makeUserMessage(content: string): SDKUserMessage {
  return {
    type: 'user',
    session_id: sessionId,
    parent_tool_use_id: null,
    message: { role: 'user', content },
  };
}

async function* pipeline(): AsyncIterable<SDKUserMessage> {
  // Turn 1: get the plan from the architect
  yield makeUserMessage(
    `Use the architect agent to create an implementation plan for this feature request:\n\n"${featureRequest}"\n\nReturn the plan verbatim.`,
  );

  // Turn 2: hand the plan to the implementer.
  // The main session holds the architect's output in its context from turn 1.
  yield makeUserMessage(
    'Now use the implementer agent to execute the plan the architect just produced. Pass the full plan text to the implementer.',
  );
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`Feature request: "${featureRequest}"\n`);
console.log('─'.repeat(60));

const session = query({
  prompt: pipeline(),
  options: {
    cwd: process.cwd(),
    sessionId,
    agents: [architect, implementer],
    permissionMode: 'auto-edit',
  },
});

let turn = 0;
for await (const message of session) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        if (block.text.length > 0 && turn === 0) {
          console.log('\n[Architect plan]\n');
          turn = 1;
        }
        process.stdout.write(block.text);
      }
    }
  } else if (message.type === 'result') {
    console.log('\n\n[Pipeline complete]');
    console.log('exit:', message.subtype);
  }
}
