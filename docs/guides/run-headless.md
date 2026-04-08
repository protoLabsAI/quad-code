# Run Headless (Non-Interactive)

Run proto from scripts, CI pipelines, and automation without any interactive UI.

## Basic usage

```bash
proto -p "What does this project do?"
```

## Pipe input

```bash
cat README.md | proto -p "Summarise this documentation"
echo "Explain this code" | proto
```

## Output formats

### Text (default)

```bash
proto -p "What is the capital of France?"
# → The capital of France is Paris.
```

### JSON

Returns a JSON array of all messages when the session completes:

```bash
proto -p "What is the capital of France?" --output-format json
```

```json
[
  { "type": "system", "subtype": "session_start", ... },
  { "type": "assistant", "message": { "content": [...] }, ... },
  { "type": "result", "subtype": "success", "result": "...", "duration_ms": 1234, ... }
]
```

### Stream-JSON

Emits JSON messages line by line as they occur — useful for real-time monitoring:

```bash
proto -p "Explain TypeScript" --output-format stream-json
```

Add `--include-partial-messages` for token-level streaming events.

## Resume a previous session

```bash
# Resume the most recent session for this project
proto --continue -p "Run the tests again"

# Resume a specific session ID
proto --resume 123e4567-... -p "Apply the follow-up refactor"
```

Sessions are stored per-project under `~/.proto/projects/`.

## Override the system prompt

```bash
# Replace the built-in system prompt
proto -p "Review this patch" --system-prompt "You are a terse release reviewer."

# Append extra instructions (keep built-in prompt)
proto -p "Review this patch" --append-system-prompt "Be terse and focus on blocking issues."
```

## Key flags

| Flag                         | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| `-p`, `--prompt`             | Run headless with this prompt                  |
| `-o`, `--output-format`      | `text` (default), `json`, `stream-json`        |
| `--include-partial-messages` | Stream token-level events (with `stream-json`) |
| `--system-prompt`            | Override the main session system prompt        |
| `--append-system-prompt`     | Append to the main session system prompt       |
| `--continue`                 | Resume the most recent session                 |
| `--resume [sessionId]`       | Resume a specific session                      |
| `-y`, `--yolo`               | Auto-approve all actions                       |
| `--approval-mode`            | `default`, `auto_edit`, `plan`, `yolo`         |
| `--all-files`, `-a`          | Include all files in context                   |
| `--include-directories`      | Include additional directories                 |
| `-d`, `--debug`              | Enable debug output                            |
| `--lsp`                      | Enable LSP code intelligence                   |

## Common automation patterns

### Code review

```bash
cat src/auth.py | proto -p "Review for security issues" > security-review.txt
```

### Generate a commit message

```bash
git diff --cached | proto -p "Write a concise commit message for these changes"
```

### PR review

```bash
git diff origin/main...HEAD | proto -p "Review for bugs, security, and code quality"
```

### Batch analysis

```bash
for file in src/*.py; do
  proto -p "Find potential bugs" < "$file" > "reports/$(basename $file).txt"
done
```

### Log triage

```bash
grep "ERROR" /var/log/app.log | tail -20 | proto -p "Identify root cause and suggest fixes"
```

### Extract JSON result

```bash
result=$(proto -p "Summarise this repo" --output-format json)
echo "$result" | jq -r '.[-1].result'
```

## CI/CD

For CI environments where OAuth browser login is not possible, use API key authentication:

```bash
export OPENAI_API_KEY="sk-..."
proto -p "Run a quick code quality check" --yolo
```

See [Guides → Configure Models & Auth](./configure-models) for API key setup.
