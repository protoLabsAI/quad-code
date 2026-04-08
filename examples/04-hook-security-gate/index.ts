/**
 * Example 04 — Hook-based security gate
 *
 * Uses `hookCallbacks` to intercept every tool call before it runs.
 * The gate blocks shell commands that contain dangerous patterns and
 * prevents the agent from writing outside a declared safe directory.
 *
 * Key concepts:
 *   - PreToolUse hook — runs synchronously before the CLI executes a tool
 *   - Returning `{ shouldSkip: true, message }` blocks the tool
 *   - Returning `{}` allows the tool through
 *
 * Run:
 *   SAFE_DIR=/tmp/sandbox npx tsx examples/04-hook-security-gate/index.ts
 */

import { query } from '@proto/sdk';
import type { HookCallback } from '@proto/sdk';
import * as path from 'node:path';

// Directory the agent is allowed to write to.
const SAFE_DIR = process.env.SAFE_DIR ?? path.join(process.cwd(), '.sandbox');

// Shell command patterns we never want to execute.
const BLOCKED_SHELL_PATTERNS = [
  /rm\s+-rf/,
  /sudo/,
  /curl\s+.*\|\s*(bash|sh)/,
  /wget\s+.*\|\s*(bash|sh)/,
  />\s*\/etc\//,
  /chmod\s+[0-7]*7[0-7]*/, // world-writable
];

// ─── Gate implementation ──────────────────────────────────────────────────────

const securityGate: HookCallback = async (rawInput) => {
  const input = rawInput as {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };

  const tool = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};

  // Block dangerous shell commands
  if (tool === 'Bash' || tool === 'run_shell_command') {
    const cmd = String(toolInput.command ?? '');
    for (const pattern of BLOCKED_SHELL_PATTERNS) {
      if (pattern.test(cmd)) {
        console.error(`[security-gate] BLOCKED shell command: ${cmd}`);
        return {
          shouldSkip: true,
          message: `Security gate: command matches blocked pattern "${pattern.source}".`,
        };
      }
    }
  }

  // Restrict writes to SAFE_DIR
  if (
    tool === 'Write' ||
    tool === 'write_file' ||
    tool === 'Edit' ||
    tool === 'edit_file'
  ) {
    const filePath = String(toolInput.file_path ?? toolInput.path ?? '');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(SAFE_DIR)) {
      console.error(
        `[security-gate] BLOCKED write outside safe dir: ${resolved}`,
      );
      return {
        shouldSkip: true,
        message: `Security gate: writes are restricted to ${SAFE_DIR}. Attempted path: ${resolved}`,
      };
    }
  }

  // All other tools are allowed through
  return {};
};

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`[security-gate] Safe write directory: ${SAFE_DIR}`);
console.log(
  '[security-gate] Blocked shell patterns:',
  BLOCKED_SHELL_PATTERNS.map((p) => p.source).join(', '),
);
console.log('─'.repeat(60) + '\n');

const session = query({
  prompt: `
    1. Run: echo "hello from sandbox"
    2. Create a file at ${SAFE_DIR}/hello.txt with the content "hello world"
    3. Try (but expect to be blocked): rm -rf /tmp/test
    4. Summarise what you were and were not able to do.
  `.trim(),
  options: {
    cwd: process.cwd(),
    permissionMode: 'auto-edit',
    hookCallbacks: {
      PreToolUse: [securityGate],
    },
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
    console.log('\n\n[Session complete]', message.subtype);
  }
}
