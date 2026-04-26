# Shell (`run_shell_command`)

Executes a shell command. On macOS/Linux, runs with `bash -c`. On Windows, runs with `cmd.exe /c`.

## Parameters

| Parameter       | Required | Description                                                           |
| --------------- | -------- | --------------------------------------------------------------------- |
| `command`       | Yes      | The exact shell command to execute                                    |
| `description`   | No       | Brief description shown to the user                                   |
| `directory`     | No       | Directory to run in (relative to project root; default: project root) |
| `is_background` | Yes      | `true` for long-running processes; `false` for one-time commands      |
| `timeout`       | No       | Timeout in ms (max 600,000)                                           |

`is_background` is required — all shell commands must explicitly declare whether they are background processes.

## Foreground vs background

**Use `is_background: false` for:**

- Build commands (`npm run build`, `make`)
- Install commands (`npm install`)
- Git operations (`git commit`, `git push`)
- Test runs (`npm test`)
- One-time queries (`ls`, `cat`)

**Use `is_background: true` for:**

- Development servers (`npm run dev`, `python -m http.server`)
- Build watchers (`webpack --watch`)
- Database servers (`mongod`, `redis-server`)
- Any process that runs indefinitely
- Long batch jobs whose stdout you want to inspect later (evals, data processing)

## Output

For **foreground** commands, the tool returns `Command`, `Directory`, `Stdout`, `Stderr`, `Error`, `Exit Code`, `Signal`, and `Process Group PGID`.

For **background** commands on non-Windows, the tool returns:

- `Task ID` — opaque stable ID used to refer to the task later
- `Output file` — absolute path where stdout+stderr is captured (writes continue after the wrapper exits)
- `PID` — actual subprocess PID

Read the output file at any time with the [`read_file`](./read-file) tool to inspect progress or final results — there is no need to poll. When the process exits, the **next user prompt** is prefixed with a `<task_notification>` block carrying `task_id`, `output_file`, `status` (`completed`/`failed`/`killed`), `exit_code`, and a human summary.

## Background tasks

Output files live at `<projectTempDir>/<sessionId>/tasks/<taskId>.output` and are written via shell-level redirection (`( cmd ) > file 2>&1 &`). The OS keeps writing even after the parent shell exits, so detached processes never silently lose output.

To stop a runaway background task, use the [`bg_stop`](./bg-stop) tool with the `task_id`. It SIGTERMs the process group and escalates to SIGKILL after a 3-second grace.

To list running and recently-completed background tasks from the TUI, run `/bg`.

> **Windows.** Background tasks rely on POSIX shell redirection and process-group signaling. On Windows, `is_background: true` falls back to the simpler "fire and return" path used in earlier versions; output is not captured to disk.

## Confirmation

**Requires confirmation** by default. Auto-approved in `auto-edit` mode (shell commands still need approval) unless `yolo` mode.

## Security

Shell commands run with your user permissions. Use [Sandboxing](../../guides/use-sandbox) to restrict what commands can do, and [Hooks](../../guides/use-hooks) to enforce policies on specific commands.
