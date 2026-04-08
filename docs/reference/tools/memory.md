# Memory (`save_memory`)

Saves a specific fact to proto's persistent memory system so it is recalled in future sessions.

## Parameters

| Parameter | Required | Description                                              |
| --------- | -------- | -------------------------------------------------------- |
| `fact`    | Yes      | The fact to remember — a clear, self-contained statement |
| `type`    | No       | Memory type: `user`, `feedback`, `project`, `reference`  |
| `scope`   | No       | `global` (all projects) or `project` (current project)   |

## How it works

Each memory is saved as a Markdown file with YAML frontmatter in:

- `~/.proto/memory/` (global scope)
- `.proto/memory/` (project scope)

A `MEMORY.md` index is regenerated and loaded into the system prompt at the start of each session.

## When proto uses this tool

proto calls `save_memory` when:

- You explicitly ask it to "remember" something
- You state a clear, durable preference or decision
- A background auto-extraction agent identifies a fact worth preserving

## When NOT to use it

- Code patterns or architecture (read the code)
- Git history or recent changes
- In-progress task details
- Anything already in `PROTO.md`

## Session commands

```
/memory add <fact>      # save a memory
/memory list            # list all memories
/memory show            # display memory content
/memory forget <name>   # delete a memory
/memory refresh         # reload from disk
```

See [Guides → Manage Memory](../../guides/manage-memory) for the full how-to.
