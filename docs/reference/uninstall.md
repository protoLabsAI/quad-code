# Uninstall

## npm global install

If you installed proto with `npm install -g proto`:

```bash
npm uninstall -g proto
```

## npx cache

If you ran proto via `npx` without a global install, clear the npx cache:

**macOS / Linux:**

```bash
rm -rf "$(npm config get cache)/_npx"
```

**Windows (Command Prompt):**

```cmd
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

**Windows (PowerShell):**

```powershell
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Remove configuration and data

```bash
rm -rf ~/.proto/          # global settings, memory, agents, skills
rm -rf ~/.proto/memory/   # just global memory
```

For project-scoped data, delete the `.proto/` directory in the project root.

Remove beads task data:

```bash
rm -rf .beads/            # task database for this project
```
