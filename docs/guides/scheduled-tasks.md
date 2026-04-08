# Schedule Prompts

Run prompts on a recurring schedule or set one-time reminders within a proto session.

> [!note]
> Scheduled tasks are session-scoped — they live only while proto is running. Nothing is written to disk.

> [!note]
> This is an experimental feature. Enable with `experimental.cron: true` in settings, or set `PROTO_ENABLE_CRON=1` in your environment.

## Schedule a recurring prompt with /loop

```
/loop 5m check if the deployment finished and tell me what happened
```

proto schedules the job, confirms the cadence and job ID, then executes the prompt immediately. After that it fires on the interval.

### Interval syntax

| Form                    | Example                               | Interval                   |
| ----------------------- | ------------------------------------- | -------------------------- |
| Leading token           | `/loop 30m check the build`           | every 30 minutes           |
| Trailing `every` clause | `/loop check the build every 2 hours` | every 2 hours              |
| No interval             | `/loop check the build`               | every 10 minutes (default) |

Units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days). Seconds round up to the nearest minute.

### Loop over a command

```
/loop 20m /review-pr 1234
```

Each time the job fires, proto runs `/review-pr 1234` as if you had typed it.

### Manage loops

```
/loop list     # list all scheduled jobs
/loop clear    # cancel all jobs
```

## Set a one-time reminder

```
remind me at 3pm to push the release branch
```

```
in 45 minutes, check whether the integration tests passed
```

proto schedules a single-fire task that deletes itself after running.

## Manage scheduled tasks

Natural language management:

```
what scheduled tasks do I have?
```

```
cancel the deploy check job
```

## How scheduling works

- The scheduler checks every second and enqueues due tasks when proto is **idle**.
- If proto is busy when a task fires, the prompt waits until the current turn ends.
- All times use **local timezone**.
- **Recurring tasks expire after 3 days** and fire one final time before deleting themselves.
- **One-shot tasks** delete themselves after firing once.
- Limit: 50 scheduled tasks per session.

### Jitter

To avoid thundering-herd at the API, the scheduler adds a small deterministic offset per task:

- **Recurring**: fires up to 10% of its period late (capped at 15 minutes).
- **One-shot at `:00` or `:30`**: fires up to 90 seconds early.

The offset is derived from the task ID — the same task always gets the same offset. Use a minute other than `:00` or `:30` (e.g. `7 9 * * *`) to avoid one-shot jitter.

## Cron expression reference

`CronCreate` accepts standard 5-field cron: `minute hour day-of-month month day-of-week`.

| Expression     | Meaning                |
| -------------- | ---------------------- |
| `*/5 * * * *`  | Every 5 minutes        |
| `0 * * * *`    | Every hour on the hour |
| `0 9 * * *`    | Every day at 9am local |
| `0 9 * * 1-5`  | Weekdays at 9am        |
| `30 14 15 3 *` | March 15 at 2:30pm     |

Supports wildcards (`*`), single values, steps (`*/15`), ranges (`1-5`), and comma-separated lists. Does **not** support `L`, `W`, `?`, or name aliases (`MON`, `JAN`).

## Underlying tools

| Tool         | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `CronCreate` | Schedule a task (cron expression + prompt + one-shot flag) |
| `CronList`   | List all tasks with IDs, schedules, and prompts            |
| `CronDelete` | Cancel a task by ID                                        |

## Limitations

- Tasks only fire while proto is **running and idle**. Closing the session cancels everything.
- No catch-up for missed fires — if a task is missed while proto is busy, it fires once when proto becomes idle.
- No persistence across restarts.
