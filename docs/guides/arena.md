# Agent Arena

> [!warning]
> Agent Arena is experimental with [known limitations](#limitations).

Dispatch multiple AI models simultaneously on the same task, compare their solutions side-by-side, and select the best result to apply to your workspace.

## When to use Arena

- **Model benchmarking** — evaluate different models on real tasks in your codebase
- **Best-of-N selection** — get multiple independent solutions, pick the best
- **Risk reduction** — validate that multiple models converge on the same approach before committing to a critical change
- **Exploring approaches** — see how different models reason about the same problem

Arena uses significantly more tokens than a single session (each agent has its own context window). Use it when the value of comparison justifies the cost.

## Start a session

```
/arena --models gpt-4o,claude-sonnet-4,gemini-2.5-pro "Refactor the authentication module to use JWT tokens"
```

Omit `--models` to get an interactive model selection dialog.

## What happens

1. proto creates isolated Git worktrees for each agent (one per model)
2. Each agent starts with full tool access and works independently — no shared state, no communication
3. You can monitor progress and send messages to individual agents via tab switching
4. When all agents finish, you compare results and select a winner

## Navigate between agents

Use keyboard shortcuts to switch between agent tabs:

| Shortcut  | Action             |
| --------- | ------------------ |
| `→` Right | Next agent tab     |
| `←` Left  | Previous agent tab |
| `↑` Up    | Focus input box    |
| `↓` Down  | Focus tab bar      |

Tab status indicators: `●` running, `✓` done, `✗` failed, `○` cancelled.

## Select a winner

When all agents complete, choose one to apply its changes to your main workspace. The winning agent's diff is applied and all worktrees are cleaned up automatically.

## Configuration

```json
{
  "arena": {
    "worktreeBaseDir": "~/.proto/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

## Best practices

- **2–3 agents** give the best balance of insight vs. cost. Max is 5.
- **Choose complementary models** — comparing models with different strengths gives more signal than comparing versions of the same model.
- **Keep tasks self-contained** — Arena agents cannot communicate, so the task must be fully describable in the prompt.
- **Use for high-impact decisions** — architecture choices, critical refactors, not routine changes.

## Troubleshooting

| Symptom                 | Fix                                                                           |
| ----------------------- | ----------------------------------------------------------------------------- |
| Agent fails to start    | Verify model API credentials; check Git repo and write access to worktree dir |
| Worktree creation fails | Run `git worktree prune` to clean up stale worktrees; requires Git 2.5+       |
| Agent timeout           | Increase `arena.timeoutSeconds` in settings                                   |
| Winner apply fails      | Check for conflicting uncommitted changes in your main working directory      |

## Limitations

- **In-process mode only** — split-pane display (tmux/iTerm2) is not yet available
- **No diff preview** before selecting a winner
- **No worktree retention** after selection
- **No session resumption** — if you close the terminal mid-session, clean up manually with `git worktree prune`
- **Maximum 5 agents**
- **Git repository required**
