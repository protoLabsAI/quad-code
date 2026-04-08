/**
 * Example 02 — Code reviewer subagent
 *
 * Defines a custom subagent that is scoped to read-only tools and has a
 * specialised system prompt for code review.  The main session receives the
 * user prompt and delegates the review work to the subagent.
 *
 * Key concepts:
 *   - SubagentConfig — declares the agent name, tools, model, and prompt
 *   - `level: 'session'` — the agent is available for the whole session
 *   - Restricting `tools` keeps the agent from writing or running commands
 *
 * Run:
 *   npx tsx examples/02-code-reviewer/index.ts [path-to-file]
 */

import { query } from '@proto/sdk';
import type { SubagentConfig } from '@proto/sdk';

const targetFile = process.argv[2] ?? 'src/index.ts';

const codeReviewer: SubagentConfig = {
  name: 'code-reviewer',
  description:
    'A senior code reviewer.  Reads the target file and returns concise, actionable feedback on correctness, style, and potential security issues.',
  systemPrompt: `You are a meticulous code reviewer with deep TypeScript and Node.js expertise.

When reviewing code:
1. Check for correctness — logic errors, off-by-one bugs, unhandled promises
2. Flag security issues — injection risks, unsafe deserialization, exposed secrets
3. Note style violations — naming, dead code, overly complex expressions
4. Keep feedback concise: one line per finding, grouped by severity (critical / warning / suggestion)

Return ONLY the review. Do not greet the user or add pleasantries.`,
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: {
    model: 'claude-sonnet-4-6',
  },
};

console.log(`Reviewing: ${targetFile}\n`);

const session = query({
  prompt: `Use the code-reviewer agent to review the file at "${targetFile}". Return its output verbatim.`,
  options: {
    cwd: process.cwd(),
    agents: [codeReviewer],
    permissionMode: 'default',
  },
});

for await (const message of session) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        process.stdout.write(block.text);
      }
    }
  } else if (message.type === 'result') {
    console.log('\n');
  }
}
