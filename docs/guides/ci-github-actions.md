# GitHub Actions

Run proto autonomously in CI — review pull requests, triage issues, analyze code, or respond to `@proto` comments in GitHub issues and PRs.

## Quick start

### 1. Get an API key

Configure a model provider (see [Guides → Configure Models & Auth](./configure-models)) and obtain an API key.

### 2. Add it as a GitHub secret

Go to **Settings → Secrets and variables → Actions → New repository secret**:

- Name: `OPENAI_API_KEY` (or whichever env key your model uses)
- Value: your API key

### 3. Add a workflow

```yaml
# .github/workflows/proto-review.yml
name: proto PR review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install proto
        run: npm install -g proto
      - name: Run proto review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git diff origin/main...HEAD | proto -p "Review these changes for bugs, security issues, and code quality. Post your findings as a PR comment." --yolo
```

## Common workflow patterns

### Automatic PR review

Triggered on every PR open or push:

```yaml
on:
  pull_request:
    types: [opened, synchronize]
```

### On-demand via comment

Use `repository_dispatch` or `issue_comment` events to trigger when someone comments `@proto /review`:

```yaml
on:
  issue_comment:
    types: [created]
```

Then filter in the job: `if: contains(github.event.comment.body, '@proto')`.

### Scheduled analysis

```yaml
on:
  schedule:
    - cron: '0 9 * * 1' # every Monday at 9am UTC
```

### Issue triage

```yaml
on:
  issues:
    types: [opened]
```

## Configuration

### Settings file

Pass a `settings.json` via environment or a file before running proto:

```yaml
- name: Configure proto
  run: |
    mkdir -p .proto
    echo '{"model":{"name":"gpt-4o"}}' > .proto/settings.json
```

### Update `.gitignore`

```gitignore
.proto/settings.json   # if it contains secrets
```

### Best practices

- **Never commit API keys** — always use GitHub Secrets.
- **Use `--yolo`** in CI to auto-approve file edits (proto has no interactive terminal to confirm).
- **Pin the proto version** with `npm install -g proto@<version>` for reproducible CI.
- **Monitor costs** — set `runConfig.max_turns` limits or use a smaller model for routine CI tasks.
- **Review action logs** regularly and enable observability (see [Contributing → Telemetry](../contributing/telemetry)).

## Customization

Create a `PROTO.md` (or `AGENTS.md`) file in your repo root to provide project-specific context — coding conventions, architectural patterns, review criteria — that proto uses in every CI run.
