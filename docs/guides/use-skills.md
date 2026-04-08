# Use Skills

Skills package reusable expertise into discoverable capabilities. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter and instructions, plus optional supporting scripts and templates.

## Create a skill

### Personal skills (all projects)

```bash
mkdir -p ~/.proto/skills/my-skill
```

### Project skills (shared via git)

```bash
mkdir -p .proto/skills/my-skill
```

## Write `SKILL.md`

```yaml
---
name: my-skill
description: What this skill does and when to use it. Include specific trigger keywords.
---

# My Skill

## Instructions

Step-by-step guidance for proto.

## Examples

Concrete examples.
```

Required fields: `name` (non-empty string), `description` (non-empty string).

**Write specific descriptions.** The description is how proto decides when to invoke the skill autonomously. Include the exact keywords users will naturally say:

```yaml
# Good
description: Writes conventional commit messages following the Conventional Commits spec. Use when committing changes, preparing a commit, or asked to summarise what changed.

# Too vague
description: Helps with commits
```

## Add supporting files

```
my-skill/
├── SKILL.md          (required)
├── reference.md      (optional — detailed docs)
├── scripts/
│   └── helper.py     (optional — called from SKILL.md instructions)
└── templates/
    └── template.txt  (optional)
```

Reference these from `SKILL.md`:

```markdown
See [reference.md](reference.md) for edge cases.

Run the helper: `python scripts/helper.py input.txt`
```

> [!important]
> When proto executes a skill, resolve paths from the skill's base directory. For example, `python scripts/helper.py` → `python /absolute/path/to/skill/scripts/helper.py`.

## Invoke a skill

**Autonomously** — proto loads the skill when your request matches the description.

**Explicitly** — use the slash command with Tab autocomplete:

```
/skills my-skill
```

## Share with your team

```bash
git add .proto/skills/my-skill/
git commit -m "chore: add my-skill"
git push
```

Teammates get the skill on next pull.

## Discovery order

proto discovers skills from these locations, in priority order:

1. Project: `.proto/skills/`
2. User: `~/.proto/skills/`
3. Extension: installed extension's `skills/` directory
4. Bundled: skills shipped with proto

## Debugging

**Skill not activating automatically?**

- Check the description includes keywords the user will say
- Verify the file is at `<skill-name>/SKILL.md` (case-sensitive)
- Check YAML frontmatter syntax — `---` must be on line 1

```bash
# Verify the frontmatter
head -10 .proto/skills/my-skill/SKILL.md
```

**List discovered skills:**

```bash
ls ~/.proto/skills/
ls .proto/skills/
```

## Update or remove

Edit `SKILL.md` directly — changes take effect on the next session start.

```bash
# Remove
rm -rf .proto/skills/my-skill
```

## Best practices

- One skill per capability ("PDF extraction", not "document processing")
- Keep `SKILL.md` focused on instructions; put detailed reference in a separate `reference.md`
- Test with your team: does the skill activate when expected? Are the instructions clear?
