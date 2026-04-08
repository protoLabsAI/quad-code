# Create Your First Skill

Skills package reusable expertise into discoverable capabilities. In this tutorial you will write a skill that enforces your team's commit message convention, then share it via git.

## Prerequisites

- proto installed ([Getting Started](./getting-started))
- A project with a git repository

## Step 1: Create the skill directory

Skills live in a directory containing a `SKILL.md` file.

**Personal skill** (available in all your projects):

```bash
mkdir -p ~/.proto/skills/commit-message
```

**Project skill** (shared with teammates via git):

```bash
mkdir -p .proto/skills/commit-message
```

Use the project location for this tutorial so you can commit and share it.

## Step 2: Write `SKILL.md`

Create `.proto/skills/commit-message/SKILL.md`:

```markdown
---
name: commit-message
description: Writes conventional commit messages. Use when committing changes, writing a commit, or asked to summarise what changed.
---

# Commit Message Skill

Write commit messages using the Conventional Commits format:
```

<type>(<scope>): <short summary>

[optional body]

[optional footer]

```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `chore` | Build, tooling, or config changes |

## Rules

- Summary line ≤ 72 characters
- Use imperative mood: "add" not "added" or "adds"
- Do not end the summary with a period
- Reference issue numbers in the footer: `Closes #123`

## Example

```

feat(auth): add OAuth2 PKCE flow for CLI clients

Replaces the implicit grant flow which is deprecated.
The PKCE verifier is generated per-session and never persisted.

Closes #456

```

```

The `description` field is what proto uses to decide when to invoke this skill — make it specific.

## Step 3: Test the skill

Start a session and make some changes, then ask:

```
commit my changes
```

proto will recognise the commit intent, load the skill, and produce a properly formatted message.

You can also invoke it explicitly:

```
/skills commit-message
```

Use autocomplete (`Tab`) to browse available skills.

## Step 4: Share with your team

```bash
git add .proto/skills/commit-message/
git commit -m "chore: add commit-message skill for team conventions"
git push
```

Teammates automatically get the skill the next time they pull.

## Debugging

If proto does not pick up the skill automatically:

- **Check the description** — it should mention keywords users will naturally say ("commit", "commit message", "summarise changes")
- **Check the file path** — must be `SKILL.md` (not `skill.md`) inside a named directory
- **Check YAML syntax** — the frontmatter must open on line 1 with `---` and close with `---`

```bash
head -5 .proto/skills/commit-message/SKILL.md
```

## What to try next

**Add a reference file** — put detailed examples in a `reference.md` alongside `SKILL.md` and link to it from the instructions.

**Add a script** — drop a helper script in `scripts/` and call it from the skill instructions.

**Compose skills** — proto can load multiple skills per session. Build a library of focused skills that combine naturally.

## Reference

- [Guides → Use Skills](../guides/use-skills) — full how-to with debugging and sharing patterns
- [Explanation → Skills](../explanation/skills-design) — how skill discovery and loading works under the hood
