# Web Fetch (`web_fetch`)

Fetches content from a URL, converts HTML to Markdown, and processes it with a focused AI call.

## Parameters

| Parameter | Required | Description                                |
| --------- | -------- | ------------------------------------------ |
| `url`     | Yes      | Fully-formed URL (`http://` or `https://`) |
| `prompt`  | Yes      | Describe what to extract from the page     |

## Behaviour

- HTML is converted to readable text before processing.
- GitHub blob URLs are automatically converted to raw URLs.
- HTTP URLs are upgraded to HTTPS.
- Processes one URL per call.

## Confirmation

Requires confirmation before fetching.

## Examples

```
web_fetch(url="https://example.com/blog/post", prompt="Summarise the main points")
web_fetch(url="https://github.com/org/repo/blob/main/README.md", prompt="What are the installation steps?")
```

## MCP alternative

If an MCP-provided web fetch tool is available (any tool starting with `mcp__`), prefer it — it may have fewer restrictions than the built-in tool.
