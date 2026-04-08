# File System Tools

Tools for reading, writing, editing, listing, and searching files.

All file tools operate within the project root (the directory where proto was started). Paths must be absolute.

## `list_directory`

Lists the contents of a directory.

| Parameter            | Required | Description                            |
| -------------------- | -------- | -------------------------------------- |
| `path`               | Yes      | Absolute path to the directory         |
| `ignore`             | No       | Glob patterns to exclude               |
| `respect_git_ignore` | No       | Respect `.gitignore` (default: `true`) |

Returns directories first, then files, alphabetically. No confirmation required.

## `read_file`

Reads a file and returns its content. Supports text, images, PDFs, audio, and video (modality must be supported by the active model).

| Parameter | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `path`    | Yes      | Absolute path to the file                                    |
| `offset`  | No       | 0-based line number to start reading from (requires `limit`) |
| `limit`   | No       | Maximum lines to read                                        |

For large files, content is truncated and the response indicates how to paginate. No confirmation required.

## `write_file`

Writes content to a file. Creates the file (and parent directories) if they don't exist; overwrites if it does.

| Parameter   | Required | Description               |
| ----------- | -------- | ------------------------- |
| `file_path` | Yes      | Absolute path to write to |
| `content`   | Yes      | Content to write          |

**Requires confirmation** (unless approval mode is `auto-edit` or `yolo`).

## `edit`

Replaces a specific string within a file. Requires the old string to match exactly (including whitespace and indentation).

| Parameter     | Required | Description                                                 |
| ------------- | -------- | ----------------------------------------------------------- |
| `file_path`   | Yes      | Absolute path to the file                                   |
| `old_string`  | Yes      | Exact literal text to replace (include 3+ lines of context) |
| `new_string`  | Yes      | Replacement text                                            |
| `replace_all` | No       | Replace all occurrences (default: `false`)                  |

**Requires confirmation** (unless `auto-edit` or `yolo`).

## `glob`

Finds files matching a glob pattern, sorted by modification time (most recent first).

| Parameter | Required | Description                                    |
| --------- | -------- | ---------------------------------------------- |
| `pattern` | Yes      | Glob pattern (e.g. `**/*.ts`, `src/**/*.tsx`)  |
| `path`    | No       | Directory to search in (default: project root) |

No confirmation required.

## `grep_search`

Searches file contents using ripgrep. Supports full regex syntax.

| Parameter | Required | Description                         |
| --------- | -------- | ----------------------------------- |
| `pattern` | Yes      | Regex pattern to search for         |
| `path`    | No       | File or directory to search in      |
| `glob`    | No       | Glob filter for files (e.g. `*.ts`) |
| `limit`   | No       | Limit output to first N lines       |

No confirmation required.
