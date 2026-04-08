/**
 * Example 01 — Basic single-turn query
 *
 * Runs a simple prompt and prints every message streamed back from the CLI.
 * This is the "hello world" of the proto SDK.
 *
 * Run:
 *   npx tsx examples/01-basic-query/index.ts
 */

import { query } from '@proto/sdk';

const session = query({
  prompt: 'List the top-level directories in the current working directory.',
  options: {
    cwd: process.cwd(),
    permissionMode: 'default',
  },
});

for await (const message of session) {
  switch (message.type) {
    case 'assistant':
      for (const block of message.message.content) {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        }
      }
      break;

    case 'result':
      console.log('\n\n--- session complete ---');
      console.log('exit code:', message.subtype);
      console.log('cost:     ', message.cost_usd ?? 'n/a');
      break;

    case 'system':
      // init / ping messages — ignore
      break;
  }
}
