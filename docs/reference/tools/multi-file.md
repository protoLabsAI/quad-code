# Multi-File Read (`read_many_files`)

Reads content from multiple files or directories in a single call. Often used internally when you use the `@directory` syntax.

## Parameters

| Parameter              | Required | Description                                       |
| ---------------------- | -------- | ------------------------------------------------- |
| `paths`                | Yes      | Array of absolute file paths or directory paths   |
| `pattern`              | No       | Glob pattern to filter files in directories       |
| `respect_proto_ignore` | No       | Respect `.protoignore` patterns (default: `true`) |
| `respect_git_ignore`   | No       | Respect `.gitignore` patterns (default: `true`)   |

## Behaviour

- Files matching `.protoignore` patterns are excluded.
- Binary files that cannot be decoded as text are skipped.
- Content from each file is returned with the file path as a header.
- If a directory is given, all text files in the directory are included recursively.

## No confirmation required

`read_many_files` is a read-only tool — it never requires confirmation.

## Usage

In a session, use the `@` syntax to trigger this tool:

```
@src/ Summarise the module structure
```

```
@README.md @CHANGELOG.md What changed in the latest release?
```
