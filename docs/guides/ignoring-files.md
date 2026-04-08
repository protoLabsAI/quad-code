# Ignore Files

Use `.protoignore` to exclude files and directories from proto's file tools.

## How it works

Create a `.protoignore` file in your project root. Files matching the rules are excluded from tools that support it (e.g. `read_many_files`, glob searches). They remain visible to git and other tools.

Changes take effect on the next session start.

## Syntax

`.protoignore` follows `.gitignore` conventions:

- Blank lines and `#` comments are ignored
- Standard glob patterns (`*`, `?`, `[]`)
- Trailing `/` matches directories only
- Leading `/` anchors the pattern to the file's location
- `!` negates a pattern

## Examples

```
# Exclude a directory
/archive/

# Exclude a specific file
apikeys.txt

# Exclude all markdown files
*.md

# Exclude all markdown except README.md
*.md
!README.md

# Exclude node_modules everywhere
node_modules/

# Exclude build artifacts
/dist/
/build/
*.min.js
```

## Common use cases

- Exclude `node_modules/`, `dist/`, and other generated directories to keep proto focused on source files
- Exclude large binary or data files that aren't useful in context
- Exclude files with sensitive content (secrets files, local config overrides)
