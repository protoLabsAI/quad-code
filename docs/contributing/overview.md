# Contributing Guide

Contributions are welcome! This guide covers the process for submitting patches and the standards we expect.

## Before you start

1. **Open an issue first.** All PRs should be linked to an existing issue. For bug fixes, link to the bug report. For features, wait for a maintainer to approve the proposal before writing code.
2. **Keep PRs small and focused.** One issue per PR. Large changes should be broken into a series of logical, independently-mergeable PRs.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your changes following the [Development Workflow](./development) guide.
3. Ensure all checks pass: `npm run preflight`.
4. Update documentation in `/docs` for any user-facing changes.
5. Submit the PR with a clear title and description. Link the issue with `Fixes #123`.
6. Request review. All submissions (including from maintainers) require review.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cli): add --json flag to 'config get' command
fix(core): handle missing envKey in modelProviders gracefully
docs: update MCP configuration reference
chore: upgrade esbuild to 0.21
```

Format: `<type>(<scope>): <short summary>`

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`.

## Code standards

- Run `npm run preflight` before submitting (lint, format, build, test).
- Write tests for new functionality. See [Development Workflow → Testing](./development#testing).
- Follow existing code style — TypeScript strict mode, Prettier formatting.
- Comments should explain _why_, not _what_.

## Documentation

If your change affects user-facing behavior, update the relevant docs under `/docs/`. See [Architecture](../explanation/architecture) for which package owns what.

## Use of Draft PRs

Use GitHub Draft PRs for work in progress that you want early feedback on. Draft PRs signal that the change is not yet ready for formal review.

## Code of conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
