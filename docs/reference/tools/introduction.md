# Tools Overview

proto's built-in tools are the functions the model calls to interact with your local environment. You do not call them directly — proto invokes them based on what you ask for.

## How tools work

1. You send a prompt.
2. proto sends the prompt plus tool schemas to the model API.
3. The model decides which tool to call and with what parameters.
4. proto validates the call, asks for confirmation if required (based on approval mode), and executes it.
5. The result is sent back to the model for the next step.

## Tool categories

| Category                           | Tools                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| [File System](./file-system)       | `read_file`, `write_file`, `edit`, `glob`, `grep_search`, `list_directory`                      |
| [Multi-File Read](./multi-file)    | `read_many_files`                                                                               |
| [Shell](./shell)                   | `run_shell_command`                                                                             |
| [Task management](./task)          | `task_create`, `task_update`, `task_list`, `task_get`, `task_ready`, `task_output`, `task_stop` |
| [Todo](./todo-write)               | `todo_write`                                                                                    |
| [Exit Plan Mode](./exit-plan-mode) | `exit_plan_mode`                                                                                |
| [Web Fetch](./web-fetch)           | `web_fetch`                                                                                     |
| [Web Search](./web-search)         | `web_search`                                                                                    |
| [Memory](./memory)                 | `save_memory`                                                                                   |
| [Browser](./browser)               | `browser` — Web browser automation (requires `agent-browser`)                                   |
| [MCP Servers](./mcp-server)        | Dynamic tools from connected MCP servers                                                        |
| [Sandbox](./sandbox)               | Isolation for shell and file tools                                                              |

## Confirmation and safety

- Tools that write files or run shell commands require explicit confirmation by default.
- Change the approval mode with `/approval-mode` or `Shift+Tab`.
- Configure per-tool policies with hooks. See [Guides → Use Hooks](../../guides/use-hooks).
- Sandboxing further restricts what tools can do. See [Guides → Sandboxing](../../guides/use-sandbox).

## MCP tools

Tools from MCP servers appear alongside built-in tools. Configure servers in `settings.json` or with `proto mcp add`. See [Guides → Connect via MCP](../../guides/use-mcp).
