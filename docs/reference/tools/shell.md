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

## Output

Returns `Command`, `Directory`, `Stdout`, `Stderr`, `Error`, `Exit Code`, `Signal`, and `Background PIDs`.

## Confirmation

**Requires confirmation** by default. Auto-approved in `auto-edit` mode (shell commands still need approval) unless `yolo` mode.

## Security

Shell commands run with your user permissions. Use [Sandboxing](../../guides/use-sandbox) to restrict what commands can do, and [Hooks](../../guides/use-hooks) to enforce policies on specific commands.
