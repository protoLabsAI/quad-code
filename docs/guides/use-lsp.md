# Language Server Protocol (LSP)

proto integrates with LSP language servers to give the model accurate code intelligence: go-to-definition, find-references, hover info, diagnostics, and code actions.

## Enable LSP

**Auto-enable** — place a `.lsp.json` in your project root.

**CLI flag:**

```bash
proto --lsp
```

**Settings:**

```json
{
  "general": { "lsp": true }
}
```

## Install a language server

| Language              | Server                     | Install                                                                                 |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm i -g typescript-language-server typescript`                                        |
| Python                | pylsp                      | `pip install python-lsp-server`                                                         |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                            |
| Rust                  | rust-analyzer              | See [rust-analyzer.github.io](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Install LLVM/clangd via your package manager                                            |
| Java                  | jdtls                      | Install JDTLS + JDK                                                                     |

## Configure `.lsp.json`

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript"
    }
  }
}
```

### Configuration options

| Option                  | Type     | Default | Description                                 |
| ----------------------- | -------- | ------- | ------------------------------------------- |
| `command`               | string   | —       | LSP server executable (required)            |
| `args`                  | string[] | `[]`    | Command-line arguments                      |
| `transport`             | string   | `stdio` | `stdio`, `tcp`, or `socket`                 |
| `env`                   | object   | —       | Environment variables                       |
| `initializationOptions` | object   | —       | LSP initialization options                  |
| `settings`              | object   | —       | Sent via `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | —       | Maps file extensions to language IDs        |
| `startupTimeout`        | number   | `10000` | Startup timeout (ms)                        |
| `restartOnCrash`        | boolean  | `false` | Auto-restart on crash                       |
| `maxRestarts`           | number   | `3`     | Max restart attempts                        |
| `trustRequired`         | boolean  | `true`  | Require trusted workspace                   |

### TCP/socket transport

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": { "host": "127.0.0.1", "port": 9999 },
    "extensionToLanguage": { ".custom": "custom" }
  }
}
```

## Available operations (via the `lsp` tool)

| Operation              | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `goToDefinition`       | Find where a symbol is defined                       |
| `findReferences`       | Find all references to a symbol                      |
| `goToImplementation`   | Find implementations of an interface/abstract method |
| `hover`                | Get documentation and type info                      |
| `documentSymbol`       | List all symbols in a file                           |
| `workspaceSymbol`      | Search for symbols across the workspace              |
| `prepareCallHierarchy` | Get call hierarchy at a position                     |
| `incomingCalls`        | Functions that call the given function               |
| `outgoingCalls`        | Functions called by the given function               |
| `diagnostics`          | Errors/warnings for a file                           |
| `workspaceDiagnostics` | All diagnostics across the workspace                 |
| `codeActions`          | Quick fixes and refactorings at a location           |

All operations take `filePath`, `line` (1-based), and `character` (1-based) parameters.

## Security

LSP servers run with your user permissions and can execute code. By default, they only start in trusted workspaces. Override per server:

```json
{
  "safe-server": {
    "command": "my-server",
    "trustRequired": false,
    "extensionToLanguage": { ".x": "x" }
  }
}
```

Trust a workspace with `/trust` or by configuring trusted folders in settings.

## Check server status

```
/lsp status
```

Lists all configured servers and whether they are running.

## Troubleshooting

| Symptom                      | Fix                                                  |
| ---------------------------- | ---------------------------------------------------- |
| Server not starting          | Verify binary is in PATH; check workspace is trusted |
| Slow performance             | Exclude `node_modules`; increase `startupTimeout`    |
| No results                   | Wait for indexing; save the file first               |
| Multiple servers, no results | First server to return results wins                  |

Debug logging:

```bash
DEBUG=lsp* proto --lsp
```

## SDK usage

```typescript
import { query } from '@proto/sdk';

const conversation = query({
  prompt: 'Fix all type errors in the auth module',
  options: { lsp: true, permissionMode: 'auto-edit' },
});
```
