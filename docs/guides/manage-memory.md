# Manage Memory

proto's memory system persists facts about you, your projects, and your preferences across sessions so you don't have to repeat context every time.

## Memory types

| Type        | What it stores                                                           | Scope             |
| ----------- | ------------------------------------------------------------------------ | ----------------- |
| `user`      | Your role, goals, knowledge level, preferences                           | Global or project |
| `feedback`  | How you want proto to approach work — corrections and confirmed patterns | Global or project |
| `project`   | Ongoing work, decisions, deadlines not in the codebase                   | Project           |
| `reference` | Pointers to external systems (Linear, Grafana, Slack channels)           | Project           |

## Memory scopes

| Scope   | Location           | Used for                               |
| ------- | ------------------ | -------------------------------------- |
| Global  | `~/.proto/memory/` | Preferences shared across all projects |
| Project | `.proto/memory/`   | Project-specific context               |

## Session commands

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `/memory show`          | Display all loaded memory content |
| `/memory list`          | List all memories with metadata   |
| `/memory add <fact>`    | Save a memory                     |
| `/memory forget <name>` | Delete a memory by filename       |
| `/memory refresh`       | Reload memories from disk         |

## Save a memory

Ask proto directly:

```
Remember that I prefer TypeScript strict mode for all new files.
```

Or use the command:

```
/memory add I use pnpm, not npm, for this project.
```

proto will ask whether to save it globally or to the current project.

## Auto-extraction

After each session turn, a background agent reviews the conversation and automatically extracts facts worth remembering. You can review what was saved with `/memory list`.

## Memory files

Each memory is a Markdown file with YAML frontmatter:

```markdown
---
type: feedback
scope: project
createdAt: 2026-04-07T10:00:00Z
---

Always run `npm run preflight` before marking a task complete.
```

Files live in `.proto/memory/` (project) or `~/.proto/memory/` (global). A `MEMORY.md` index is auto-generated and loaded into every session.

## What NOT to save

Memory is for durable, cross-session facts. Do not save:

- Code patterns or architecture (readable from code)
- Git history or recent changes (use `git log`)
- Debugging solutions (the fix is in the code)
- In-progress task details

## Ignore memory for a session

If you want proto to ignore loaded memories, say so at the start of the session:

```
Ignore your memory for this session.
```

## Commit project memories to git

Project memories under `.proto/memory/` can be committed to share context with teammates:

```bash
git add .proto/memory/
git commit -m "chore: add project memory for proto"
```
