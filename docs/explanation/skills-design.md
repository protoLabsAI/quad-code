# Skills — How They Work

Skills are discoverable, modular instruction sets that extend proto's behavior. This page explains how skill discovery, loading, and invocation work under the hood.

## What a skill is

A skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) and Markdown instructions. The directory may also contain supporting files: scripts, templates, reference documents.

The `description` field is the most important part — it is what proto uses to decide whether to invoke the skill for a given user request.

## Discovery

proto discovers skills at session start from these locations, in priority order:

1. Project: `.proto/skills/`
2. User: `~/.proto/skills/`
3. Extension: installed extension's `skills/` directory
4. Bundled: skills shipped with proto (`packages/core/src/tools/skill/`)

If two skills share the same `name`, the higher-priority location wins.

## How skills are invoked

Skills are **model-invoked** — proto presents the list of available skill descriptions to the model alongside other tools. The model autonomously decides when to load a skill based on the user's request and the skill's description.

When the model chooses to use a skill, it calls the `SkillTool`. The tool:

1. Reads `SKILL.md` from the skill's directory
2. Resolves any relative file references (scripts, templates) to absolute paths
3. Injects the skill's instructions into the agent's context as a tool result
4. The agent then follows the instructions, calling any referenced scripts or files

The key design choice: skills do not execute code themselves. They inject instructions, and the agent decides how to follow them. This keeps skills portable and composable.

## Explicit invocation

Users can also invoke skills directly with `/skills <skill-name>`. This bypasses the model's autonomy and forces the skill to load immediately.

## Path resolution

When a skill references a file (e.g. `python scripts/helper.py`), the path must be resolved relative to the skill's base directory, not the current working directory. proto resolves paths to absolute before injecting them:

```
python scripts/helper.py → python /abs/path/to/skill/scripts/helper.py
```

This is a common source of bugs in user-written skills — always use absolute paths or explicit `cd` commands in skill instructions.

## SkillTool and sub-agents

`SkillTool` is itself a tool in proto's registry. When a sub-agent is created:

- If no `tools` allowlist is defined, the sub-agent inherits all tools including `SkillTool`.
- If an explicit allowlist is defined (like for `Explore`), `SkillTool` is only included if it appears in the list.
- The `verify` and `plan` built-in agents do not have `SkillTool` — they are read-only and reasoning-focused.

## Bundled skills

proto ships with 18+ bundled skills covering common agentic workflows: `adversarial-verification`, `brainstorming`, `coding-agent-standards`, `sprint-contract`, `test-driven-development`, and more. These are always available regardless of project or user configuration.

## Why this design

- **Markdown files** are easy to write, review, diff, and share via git — no code required.
- **Description-based discovery** means skills activate naturally without explicit user invocation, reducing friction.
- **Model-driven execution** keeps the skill system flexible — instructions can reference any tool the agent has access to.
- **Directory structure** allows skills to bundle related scripts, templates, and reference docs alongside instructions.
