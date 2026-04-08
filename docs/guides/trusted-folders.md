# Trusted Folders

Trusted Folders controls which project directories can load project-specific settings, environment files, and extensions. Untrusted folders run in a restricted "safe mode."

## Enable the feature

Trusted Folders is **disabled by default**. Enable it in `~/.proto/settings.json`:

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## Trust a folder

The first time proto opens a new directory (with Trusted Folders enabled), a dialog appears:

- **Trust folder** — grants trust to the current directory (e.g. `my-project`)
- **Trust parent folder** — grants trust to the parent directory and all subdirectories (e.g. trust `~/dev/` to trust all projects inside)
- **Don't trust** — restricted safe mode

Your choice is saved to `~/.proto/trustedFolders.json` — you are only asked once per folder.

Change the trust level for the current folder at any time:

```
/permissions
```

## What "untrusted" means

When a folder is untrusted, the following are disabled:

- `.proto/settings.json` from the project is not loaded
- `.env` files from the project are not loaded
- Extension install/update/uninstall is blocked
- Tool auto-acceptance is disabled (you are always prompted)
- Automatic memory loading from local settings is disabled

Full proto functionality is restored when you grant trust.

## Trust check order

1. **IDE trust signal** — if using an IDE integration, the IDE's trust decision takes highest priority
2. **Local trust file** — `~/.proto/trustedFolders.json`

## Review trust rules

Inspect or edit your trust rules directly:

```bash
cat ~/.proto/trustedFolders.json
```
