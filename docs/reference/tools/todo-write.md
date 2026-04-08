# Todo Write (`todo_write`)

Creates and manages a structured task list for the current coding session. Provides visibility into planned and in-progress work.

## Parameters

| Parameter | Required | Description         |
| --------- | -------- | ------------------- |
| `todos`   | Yes      | Array of todo items |

Each item in `todos`:

| Field        | Required | Description                                           |
| ------------ | -------- | ----------------------------------------------------- |
| `content`    | Yes      | Description of the task                               |
| `status`     | Yes      | `pending`, `in_progress`, or `completed`              |
| `activeForm` | Yes      | Present continuous description (e.g. "Running tests") |

## When proto uses this tool

proto automatically uses `todo_write` for complex, multi-step work:

- Feature implementations with several components
- Refactoring across multiple files
- Any work requiring 3 or more distinct actions

It is not used for simple single-step tasks or informational requests.

## Storage

Todo lists are stored per-session in `~/.proto/todos/`. Each session has its own file.

## No confirmation required

`todo_write` never requires confirmation — it is a metadata operation.
