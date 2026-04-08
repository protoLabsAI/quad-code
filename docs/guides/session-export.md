# Export Sessions

Save the current session to a file for sharing, archiving, or programmatic processing.

## Usage

```
/export <format>
```

| Command         | Output                                             |
| --------------- | -------------------------------------------------- |
| `/export html`  | Self-contained HTML file with a rendered viewer    |
| `/export md`    | Markdown — plain text, readable anywhere           |
| `/export json`  | Structured JSON — one array of message objects     |
| `/export jsonl` | JSONL — one JSON object per line (stream-friendly) |

Files are written to the current working directory with a timestamped name, e.g. `export-2026-04-07T16-30-00-000Z.html`.

## HTML format

Opens directly in any browser — no server or internet connection required. Includes:

- Full conversation history with role labels
- Rendered markdown (code blocks, headings, lists)
- Tool call inputs and outputs (collapsed by default)
- Minimal, readable stylesheet baked in

Good for sharing sessions with teammates or archiving debugging sessions.

## JSON / JSONL formats

Raw message structure for programmatic use:

```bash
/export json
cat export-*.json | jq '.[-1].result'
```

`json` produces a single array. `jsonl` produces one object per line — better for streaming or large sessions.

## Markdown format

Plain text, suitable for pasting into notes, wikis, or GitHub issues.

## Notes

- Export captures the session state at the moment the command runs — messages added after export are not included.
- Files are written locally only — no data is sent anywhere.
