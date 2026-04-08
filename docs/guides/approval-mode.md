# Approval Mode

Control what proto is allowed to do automatically versus what requires your explicit approval.

## Modes

| Mode          | File edits           | Shell commands       | Best for                           |
| ------------- | -------------------- | -------------------- | ---------------------------------- |
| **Plan**      | ❌ Read-only         | ❌ Not executed      | Exploration, planning, safe review |
| **Default**   | ✅ Approval required | ✅ Approval required | Most development work              |
| **Auto-Edit** | ✅ Auto-approved     | ✅ Approval required | Daily coding tasks                 |
| **YOLO**      | ✅ Auto-approved     | ✅ Auto-approved     | CI/CD, trusted automation          |

> [!tip]
> Press **Shift+Tab** (or **Tab** on Windows) during a session to cycle through modes. The current mode is shown in the status bar.

## Switch modes

### During a session

```
/approval-mode plan
/approval-mode default
/approval-mode auto-edit
/approval-mode yolo
```

Or use **Shift+Tab** to cycle: `Default → Auto-Edit → YOLO → Plan → Default`.

### Set a persistent default

```json
// .proto/settings.json (project) or ~/.proto/settings.json (global)
{
  "permissions": {
    "defaultMode": "auto-edit"
  }
}
```

### From the CLI

```bash
proto --approval-mode auto-edit -p "Refactor the auth module"
proto --yolo -p "Run tests and fix failures"
```

## Plan mode

Use for understanding a codebase before making changes, or when you want to discuss an approach without any risk of edits.

```
/approval-mode plan
```

```
What files would need to change if I added OAuth2 support?
```

proto reads files, analyzes the codebase, and answers — but writes nothing.

## Default mode

The standard mode. proto proposes each file edit and shell command individually; you approve or reject each one.

```
/approval-mode default
```

## Auto-Edit mode

File edits happen automatically; shell commands still require approval. Good for refactoring tasks where you trust the edits but want to review commands.

```
/approval-mode auto-edit
```

## YOLO mode

Everything auto-approved. Use in CI pipelines or for trusted automation in controlled environments.

> [!warning]
> YOLO mode runs shell commands with your full user permissions without confirmation. Only use in environments you fully trust and control.

```bash
proto --yolo -p "Run the tests and fix all failures, then commit"
```

## Configuration reference

```json
{
  "permissions": {
    "defaultMode": "auto-edit",
    "confirmShellCommands": true,
    "confirmFileEdits": false
  }
}
```
