# SDK Sub-Agent Examples

Examples of configuring sub-agents via the `agents` option in `QueryOptions`.

## Code reviewer

```typescript
import { query, type SubagentConfig } from '@proto/sdk';

const codeReviewer: SubagentConfig = {
  name: 'code-reviewer',
  description:
    'Reviews code for bugs, security issues, and performance problems',
  systemPrompt: `You are a code reviewer. Review diffs for:
- Logic errors and edge cases
- Security vulnerabilities (injection, auth bypass, data leaks)
- Performance regressions (N+1 queries, unbounded loops)
Output a structured review with severity levels: critical, warning, info.`,
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const session = query({
  prompt: 'Review the changes in the current branch against dev',
  options: { agents: [codeReviewer] },
});

for await (const message of session) {
  if (message.type === 'assistant') {
    console.log(message.message.content);
  }
}
```

## Multiple sub-agents

Pass multiple configs — the primary agent chooses which to invoke based on descriptions:

```typescript
const securityAuditor: SubagentConfig = {
  name: 'security-auditor',
  description: 'Audits code for security vulnerabilities and OWASP Top 10',
  systemPrompt: 'You are a security auditor...',
  level: 'session',
  tools: ['read_file', 'glob', 'grep_search'],
  modelConfig: { model: 'claude-opus-4-6' },
};

const testWriter: SubagentConfig = {
  name: 'test-writer',
  description: 'Writes comprehensive test suites for code changes',
  systemPrompt: 'You write tests. Use the project testing framework...',
  level: 'session',
  tools: [
    'read_file',
    'write_file',
    'edit',
    'glob',
    'grep_search',
    'run_shell_command',
  ],
};

const session = query({
  prompt:
    'Audit the payment module for security issues, then write tests for any vulnerabilities you find',
  options: { agents: [securityAuditor, testWriter] },
});
```

## Different models per agent

```typescript
const architect: SubagentConfig = {
  name: 'architect',
  description: 'Designs system architecture and makes high-level decisions',
  systemPrompt: 'You are a senior architect...',
  level: 'session',
  modelConfig: { model: 'claude-opus-4-6' },
};

const implementer: SubagentConfig = {
  name: 'implementer',
  description: 'Implements code changes based on specifications',
  systemPrompt: 'You implement code changes precisely...',
  level: 'session',
  tools: [
    'read_file',
    'write_file',
    'edit',
    'glob',
    'grep_search',
    'run_shell_command',
  ],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const session = query({
  prompt: 'Design and implement a caching layer for the API',
  options: { agents: [architect, implementer] },
});
```

## SDK agents vs file-based agents

SDK-configured agents (passed via `options.agents`) have the highest priority in the storage hierarchy. They override project or user agents with the same name.

See [Guides → Use Sub-Agents](../../guides/use-sub-agents) for file-based agent configuration.
