# Build Your First Sub-Agent

Sub-agents are specialized AI agents with their own system prompts, restricted tool sets, and optional model selection. In this tutorial you will create a code-review agent and delegate a task to it.

## Prerequisites

- proto installed and connected to a model ([Getting Started](./getting-started))
- A project with at least one source file

## Step 1: Create the agent file

Sub-agents are Markdown files with YAML frontmatter. Create the directory and file:

```bash
mkdir -p .proto/agents
```

Create `.proto/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Reviews code for quality, security, and maintainability issues. Use proactively when changes are ready for review.
tools:
  - read_file
  - grep_search
  - glob
---

You are an experienced code reviewer. For each file you review:

1. Check for security vulnerabilities (injection, hardcoded secrets, missing validation)
2. Identify performance issues (unnecessary loops, missing indexes, redundant work)
3. Note maintainability concerns (naming, complexity, missing tests)

Always cite the exact file path and line number for each finding. Group findings by severity: **Critical**, **Warning**, **Suggestion**.
```

The `tools` allowlist restricts this agent to read-only operations — it can inspect code but cannot modify anything.

## Step 2: Use the agent

Start a proto session in your project:

```bash
proto
```

proto discovers your agent automatically. Ask it to delegate:

```
Review the authentication module for security issues
```

Or invoke it explicitly:

```
Use the code-reviewer agent to check my recent changes
```

proto will spawn the agent, run it against the relevant files, and return structured feedback.

## Step 3: Verify it is working

Run `/agents manage` inside a proto session to see your agent listed. You can also ask:

```
What agents do you have available?
```

## What to try next

**Add a model override** — run the reviewer on a more powerful model:

```yaml
---
name: code-reviewer
description: Reviews code for quality, security, and maintainability issues.
tools:
  - read_file
  - grep_search
  - glob
modelConfig:
  model: opus
---
```

**Add a `verify` step** — chain the reviewer after implementation by adding `.proto/verify-scenarios.json`:

```json
[{ "name": "Tests pass", "command": "npm test -- --run", "timeoutMs": 60000 }]
```

**Build a team** — pair a reviewer with an implementer:

```
/team start dev implementer:general-purpose reviewer:code-reviewer
```

## Reference

- [Guides → Use Sub-Agents](../guides/use-sub-agents) — full configuration reference, built-in agents, teams
- [Explanation → Sub-Agents](../explanation/sub-agents-design) — how tool inheritance and storage hierarchy work
