# Memory

proto's memory system persists facts across sessions using a file-per-memory architecture with YAML frontmatter.

## Memory types

| Type        | What it stores                                                      |
| ----------- | ------------------------------------------------------------------- |
| `user`      | Role, goals, preferences, knowledge level                           |
| `feedback`  | How proto should approach work — corrections and confirmed patterns |
| `project`   | Ongoing work, decisions, deadlines not derivable from code          |
| `reference` | Pointers to external systems (Linear, Grafana, Slack)               |

## Memory locations

| Scope   | Location           | Loaded when              |
| ------- | ------------------ | ------------------------ |
| Global  | `~/.proto/memory/` | Every session            |
| Project | `.proto/memory/`   | Sessions in this project |

## `MEMORY.md` index

A `MEMORY.md` index file is auto-generated in each memory directory and loaded into the system prompt at session start.

## Memory file format

```markdown
---
type: feedback
scope: project
createdAt: 2026-04-07T10:00:00Z
---

Always run `npm run preflight` before marking a task complete.
```

## Session commands

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `/memory show`          | Display all loaded memory content |
| `/memory list`          | List all memories with metadata   |
| `/memory add <fact>`    | Save a new memory                 |
| `/memory forget <name>` | Delete a memory by filename       |
| `/memory refresh`       | Reload memories from disk         |

## Auto-extraction

After each session turn, a background extraction agent reviews recent messages and automatically saves facts worth remembering. Review what was saved with `/memory list`.

## Context files (`PROTO.md`, `AGENTS.md`)

In addition to the memory system, proto loads static context files from the project root:

- `PROTO.md` — project context injected into every session
- `AGENTS.md` — additional agent guidelines (also loaded if present)

These files are for architectural context and conventions. Use `PROTO.md` for project-level instructions and the memory system for dynamic, evolving facts.

## What to save (and what not to)

**Save:**

- User preferences and working style
- Approach corrections ("always run X before committing")
- Project decisions not in the code ("we use pnpm, not npm")
- Pointers to external systems

**Do not save:**

- Code patterns or architecture (read the code)
- Git history (use `git log`)
- Debugging solutions (the fix is in the code)
- In-progress task details
