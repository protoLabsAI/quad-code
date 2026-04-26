# Stop Background Shell (`bg_stop`)

Stops a long-running background shell task spawned by [`run_shell_command`](./shell) with `is_background: true`. Sends SIGTERM to the process group, escalating to SIGKILL after a 3-second grace.

## Parameters

| Parameter | Required | Description                                                            |
| --------- | -------- | ---------------------------------------------------------------------- |
| `task_id` | Yes      | The opaque ID returned by the original shell tool result               |
| `reason`  | No       | Free-form reason; recorded for audit and surfaced in the result string |

## Behavior

1. Looks up the task in the in-session registry.
2. If the task already finished, returns its current status without signaling — no-op.
3. Sends `SIGTERM` to the process group (negative pid). Falls back to signaling the leader directly on `EPERM`.
4. Schedules a `SIGKILL` to the process group after **3 seconds** if the leader is still alive.
5. Optimistically marks the task `killed` in the registry. The watcher sees the same exit and is a no-op once the status flipped.
6. The next user prompt is prefixed with a `<task_notification>` block carrying `status: killed`.

## Output

```
Background task "7f9c…" stopped (SIGTERM: <reason if provided>).
```

If the task was not found:

```
No background task with ID "<task_id>".
```

## Finding `task_id`

The shell tool's return value for a backgrounded command lists the task ID and output path:

```
Background command started.
Task ID: 7f9c…
Output file: /tmp/proto/<project-hash>/<session>/tasks/7f9c…output
PID: 54322
```

You can also list current background tasks from the TUI with the `/bg` slash command.

## Confirmation

`bg_stop` is classified as a `think`-kind tool — no user confirmation is required for the tool call itself. The signal still goes to the process group with the user's permissions.

## See Also

- [`run_shell_command`](./shell) — the `is_background: true` parameter
- `/bg` slash command — list current background tasks
