/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os, { EOL } from 'node:os';
import crypto from 'node:crypto';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import type {
  ToolInvocation,
  ToolResult,
  ToolResultDisplay,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationPayload,
  ToolConfirmationOutcome,
} from './tools.js';
import type { PermissionDecision } from '../permissions/types.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { truncateToolOutput } from '../utils/truncation.js';
import type {
  ShellExecutionConfig,
  ShellOutputEvent,
} from '../services/shellExecutionService.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { isSubpaths } from '../utils/paths.js';
import {
  getCommandRoot,
  getCommandRoots,
  splitCommands,
  stripShellWrapper,
} from '../utils/shell-utils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  isShellCommandReadOnlyAST,
  extractCommandRules,
} from '../utils/shellAstParser.js';
import {
  getBackgroundTaskExitPath,
  getBackgroundTaskOutputPath,
  getBackgroundTaskPidPath,
  readBackgroundTaskPid,
} from '../backgroundShells/diskOutput.js';
import { startBackgroundShellWatcher } from '../backgroundShells/watcher.js';

const debugLogger = createDebugLogger('SHELL');

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const DEFAULT_FOREGROUND_TIMEOUT_MS = 120000;

export interface ShellToolParams {
  command: string;
  is_background: boolean;
  timeout?: number;
  description?: string;
  directory?: string;
}

export class ShellToolInvocation extends BaseToolInvocation<
  ShellToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ShellToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    let description = `${this.params.command}`;
    // append optional [in directory]
    // note description is needed even if validation fails due to absolute path
    if (this.params.directory) {
      description += ` [in ${this.params.directory}]`;
    }
    // append background indicator
    if (this.params.is_background) {
      description += ` [background]`;
    } else if (this.params.timeout) {
      // append timeout for foreground commands
      description += ` [timeout: ${this.params.timeout}ms]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (this.params.description) {
      description += ` (${this.params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  override getSummaryLabel(): string {
    const cmd = this.params.command.split(/\s+/)[0] ?? 'shell';
    const desc = this.params.description;
    if (desc) return desc.slice(0, 30);
    return `Ran ${cmd}`;
  }

  /**
   * AST-based permission check for the shell command.
   * - Read-only commands (via AST analysis) → 'allow'
   * - All other commands → 'ask'
   */
  override async getDefaultPermission(): Promise<PermissionDecision> {
    const command = stripShellWrapper(this.params.command);

    // AST-based read-only detection
    try {
      const isReadOnly = await isShellCommandReadOnlyAST(command);
      if (isReadOnly) {
        return 'allow';
      }
    } catch (e) {
      debugLogger.warn('AST read-only check failed, falling back to ask:', e);
    }

    return 'ask';
  }

  /**
   * Constructs confirmation dialog details for a shell command that needs
   * user approval.  For compound commands (e.g. `cd foo && npm run build`),
   * sub-commands that are already allowed (read-only) are excluded from both
   * the displayed root-command list and the suggested permission rules.
   */
  override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails> {
    const command = stripShellWrapper(this.params.command);
    const pm = this.config.getPermissionManager?.();

    // Split compound command and filter out already-allowed (read-only) sub-commands
    const subCommands = splitCommands(command);
    const confirmableSubCommands: string[] = [];
    for (const sub of subCommands) {
      let isReadOnly = false;
      try {
        isReadOnly = await isShellCommandReadOnlyAST(sub);
      } catch {
        // conservative: treat unknown commands as requiring confirmation
      }

      if (isReadOnly) {
        continue;
      }

      if (pm) {
        try {
          if ((await pm.isCommandAllowed(sub)) === 'allow') {
            continue;
          }
        } catch (e) {
          debugLogger.warn('PermissionManager command check failed:', e);
        }
      }

      confirmableSubCommands.push(sub);
    }

    // Fallback to all sub-commands if everything was filtered out (shouldn't
    // normally happen since getDefaultPermission already returned 'ask').
    const effectiveSubCommands =
      confirmableSubCommands.length > 0 ? confirmableSubCommands : subCommands;

    const rootCommands = [
      ...new Set(
        effectiveSubCommands
          .map((c) => getCommandRoot(c))
          .filter((c): c is string => !!c),
      ),
    ];

    // Extract minimum-scope permission rules only for sub-commands that
    // actually need confirmation.
    let permissionRules: string[] = [];
    try {
      const allRules: string[] = [];
      for (const sub of effectiveSubCommands) {
        const rules = await extractCommandRules(sub);
        allRules.push(...rules);
      }
      permissionRules = [...new Set(allRules)].map((rule) => `Bash(${rule})`);
    } catch (e) {
      debugLogger.warn('Failed to extract command rules:', e);
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: this.params.command,
      rootCommand: rootCommands.join(', '),
      permissionRules,
      onConfirm: async (
        _outcome: ToolConfirmationOutcome,
        _payload?: ToolConfirmationPayload,
      ) => {
        // No-op: persistence is handled by coreToolScheduler via PM rules
      },
    };
    return confirmationDetails;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
    shellExecutionConfig?: ShellExecutionConfig,
    setPidCallback?: (pid: number) => void,
  ): Promise<ToolResult> {
    const strippedCommand = stripShellWrapper(this.params.command);

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const effectiveTimeout = this.params.is_background
      ? undefined
      : (this.params.timeout ?? DEFAULT_FOREGROUND_TIMEOUT_MS);

    // Create combined signal with timeout for foreground execution
    let combinedSignal = signal;
    if (effectiveTimeout) {
      const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
      combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    // Background-task disk capture (non-Windows only). When is_background
    // is true we redirect stdout/stderr at the shell level into a per-task
    // file so the OS keeps writing even after the wrapper exits — the
    // detached process can no longer drop output on the floor.
    const shouldRunInBackground = this.params.is_background;
    const useDiskCapture = shouldRunInBackground && !isWindows;
    const backgroundTaskId = useDiskCapture ? crypto.randomUUID() : undefined;
    let backgroundOutputPath: string | undefined;
    let backgroundExitPath: string | undefined;
    let backgroundPidPath: string | undefined;
    if (backgroundTaskId) {
      backgroundOutputPath = getBackgroundTaskOutputPath(
        this.config,
        backgroundTaskId,
      );
      backgroundExitPath = getBackgroundTaskExitPath(
        this.config,
        backgroundTaskId,
      );
      backgroundPidPath = getBackgroundTaskPidPath(
        this.config,
        backgroundTaskId,
      );
      // Synchronous mkdir so the directory exists by the time the shell
      // wrapper tries to redirect into it. The async ensureBackgroundTasksDir
      // helper would put a microtask between us and ShellExecutionService.
      fs.mkdirSync(path.dirname(backgroundOutputPath), { recursive: true });
    }

    try {
      // Add co-author to git commit commands
      const processedCommand = this.addCoAuthorToGitCommit(strippedCommand);

      let finalCommand = processedCommand;

      // On non-Windows, use & to run in background.
      // On Windows, we don't use start /B because it creates a detached process that
      // doesn't die when the parent dies. Instead, we rely on the race logic below
      // to return early while keeping the process attached (detached: false).
      if (
        !isWindows &&
        shouldRunInBackground &&
        !finalCommand.trim().endsWith('&')
      ) {
        finalCommand = finalCommand.trim() + ' &';
      }

      // On Windows, we rely on the race logic below to handle background tasks.
      // We just ensure the command string is clean.
      if (isWindows && shouldRunInBackground) {
        // Strip any trailing & without a regex — `&+$` looked benign but
        // tripped CodeQL's polynomial-redos rule. A simple loop has no
        // backtracking risk and the same intent.
        let s = finalCommand.trim();
        while (s.endsWith('&')) s = s.slice(0, -1);
        finalCommand = s.trimEnd();
      }

      // Build the shell wrapper.
      // - For backgrounded commands with disk capture (non-Windows): redirect
      //   stdout+stderr to <tasks>/<id>.output, capture the bg PID and exit
      //   code via sentinel files so a Node-side watcher can detect exit.
      // - For backgrounded commands on Windows: pass through unchanged
      //   (relies on the race-return logic below; no & or pgrep wrapper).
      // - For foreground commands: pass through unchanged.
      const commandToExecute = (() => {
        if (!shouldRunInBackground || !useDiskCapture) return finalCommand;
        // Strip trailing & (and any preceding whitespace) — we'll re-add it
        // on the subshell wrapper. Plain string ops instead of `\s*&\s*$`
        // because the regex tripped CodeQL's polynomial-redos rule.
        let inner = finalCommand.trim();
        if (inner.endsWith('&')) inner = inner.slice(0, -1).trimEnd();
        return [
          // (<cmd>) >output 2>&1; echo $? >exit  — runs in its own subshell
          // detached with `&`, so the OS keeps writing even after our
          // wrapper exits. Sentinel files let the Node watcher detect
          // completion without re-reading stdout.
          `{ ( ${inner} ) > "${backgroundOutputPath}" 2>&1; echo $? > "${backgroundExitPath}"; } &`,
          // capture the spawned subshell's PID
          `__bgpid=$!`,
          `echo $__bgpid > "${backgroundPidPath}"`,
          // pgrep for legacy "child PIDs" reporting
          `pgrep -g 0 > ${tempFilePath} 2>&1`,
          `exit 0`,
        ].join('\n');
      })();

      const cwd = this.params.directory || this.config.getTargetDir();

      let cumulativeOutput: string | AnsiOutput = '';
      let lastUpdateTime = Date.now();
      let isBinaryStream = false;

      const { result: resultPromise, pid } =
        await ShellExecutionService.execute(
          commandToExecute,
          cwd,
          (event: ShellOutputEvent) => {
            let shouldUpdate = false;

            switch (event.type) {
              case 'data':
                if (isBinaryStream) break;
                cumulativeOutput = event.chunk;
                shouldUpdate = true;
                break;
              case 'binary_detected':
                isBinaryStream = true;
                cumulativeOutput =
                  '[Binary output detected. Halting stream...]';
                shouldUpdate = true;
                break;
              case 'binary_progress':
                isBinaryStream = true;
                cumulativeOutput = `[Receiving binary output... ${formatMemoryUsage(
                  event.bytesReceived,
                )} received]`;
                if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                  shouldUpdate = true;
                }
                break;
              default: {
                throw new Error('An unhandled ShellOutputEvent was found.');
              }
            }

            if (shouldUpdate && updateOutput) {
              updateOutput(
                typeof cumulativeOutput === 'string'
                  ? cumulativeOutput
                  : { ansiOutput: cumulativeOutput },
              );
              lastUpdateTime = Date.now();
            }
          },
          combinedSignal,
          shouldRunInBackground
            ? false
            : this.config.getShouldUseNodePtyShell(),
          shellExecutionConfig ?? {},
        );

      if (pid && setPidCallback) {
        setPidCallback(pid);
      }

      // On Windows, background commands rely on early return since there's
      // no & backgrounding or pgrep. Awaiting would block until completion.
      if (shouldRunInBackground && isWindows) {
        const pidMsg = pid ? ` PID: ${pid}` : '';
        const killHint = ' (Use taskkill /F /T /PID <pid> to stop)';

        return {
          llmContent: `Background command started.${pidMsg}${killHint}`,
          returnDisplay: `Background command started.${pidMsg}${killHint}`,
        };
      }

      const result = await resultPromise;

      if (shouldRunInBackground) {
        // Read subprocess PIDs captured by the pgrep wrapper (non-Windows only)
        const backgroundPIDs: number[] = [];
        if (!isWindows) {
          if (fs.existsSync(tempFilePath)) {
            const pgrepLines = fs
              .readFileSync(tempFilePath, 'utf8')
              .split(EOL)
              .filter(Boolean);
            for (const line of pgrepLines) {
              if (!/^\d+$/.test(line)) {
                debugLogger.warn(`pgrep: ${line}`);
                continue;
              }
              const bgPid = Number(line);
              if (bgPid !== result.pid) {
                backgroundPIDs.push(bgPid);
              }
            }
          } else if (!signal.aborted) {
            debugLogger.warn('missing pgrep output');
          }
        }

        const bgPidMsg =
          backgroundPIDs.length > 0
            ? ` PIDs: ${backgroundPIDs.join(', ')}`
            : pid
              ? ` PID: ${pid}`
              : '';
        const killHint = ' (Use kill <pid> to stop)';

        // For non-Windows background tasks: register with the registry,
        // start the watcher, and return the disk-capture file path so the
        // model can Read it later.
        if (backgroundTaskId && backgroundOutputPath) {
          const realPid = await readBackgroundTaskPid(
            this.config,
            backgroundTaskId,
          );
          const registry = this.config.getBackgroundShellRegistry();
          registry.register({
            id: backgroundTaskId,
            command: this.params.command,
            description: this.params.description ?? this.params.command,
            cwd,
            outputPath: backgroundOutputPath,
            pid: realPid ?? undefined,
          });
          startBackgroundShellWatcher(this.config, backgroundTaskId);

          const lines = [
            `Background command started.`,
            `Task ID: ${backgroundTaskId}`,
            `Output file: ${backgroundOutputPath}`,
            `PID: ${realPid ?? '(unknown)'}${bgPidMsg ? ` Children${bgPidMsg.replace(/^ PIDs:/, ':')}` : ''}`,
            `Read the output file at any time to check progress. You will`,
            `be notified via <task_notification> when the task completes.`,
            `Stop early with the bg_stop tool (task_id="${backgroundTaskId}").`,
          ];
          const message = lines.join('\n');
          return {
            llmContent: message,
            returnDisplay: message,
          };
        }

        return {
          llmContent: `Background command started.${bgPidMsg}${killHint}`,
          returnDisplay: `Background command started.${bgPidMsg}${killHint}`,
        };
      }

      let llmContent = '';
      if (result.aborted) {
        // Check if it was a timeout or user cancellation
        const wasTimeout =
          !this.params.is_background &&
          effectiveTimeout &&
          combinedSignal.aborted &&
          !signal.aborted;

        if (wasTimeout) {
          llmContent = `Command timed out after ${effectiveTimeout}ms before it could complete.`;
          if (result.output.trim()) {
            llmContent += ` Below is the output before it timed out:\n${result.output}`;
          } else {
            llmContent += ' There was no output before it timed out.';
          }
        } else {
          llmContent =
            'Command was cancelled by user before it could complete.';
          if (result.output.trim()) {
            llmContent += ` Below is the output before it was cancelled:\n${result.output}`;
          } else {
            llmContent += ' There was no output before it was cancelled.';
          }
        }
      } else {
        // Create a formatted error string for display, replacing the wrapper command
        // with the user-facing command.
        const finalError = result.error
          ? result.error.message.replace(commandToExecute, this.params.command)
          : '(none)';

        llmContent = [
          `Command: ${this.params.command}`,
          `Directory: ${this.params.directory || '(root)'}`,
          `Output: ${result.output || '(empty)'}`,
          `Error: ${finalError}`, // Use the cleaned error string.
          `Exit Code: ${result.exitCode ?? '(none)'}`,
          `Signal: ${result.signal ?? '(none)'}`,
          `Process Group PGID: ${result.pid ?? '(none)'}`,
        ].join('\n');
      }

      let returnDisplayMessage = '';
      if (this.config.getDebugMode()) {
        returnDisplayMessage = llmContent;
      } else {
        if (result.output.trim()) {
          returnDisplayMessage = result.output;
        } else {
          if (result.aborted) {
            // Check if it was a timeout or user cancellation
            const wasTimeout =
              !this.params.is_background &&
              effectiveTimeout &&
              combinedSignal.aborted &&
              !signal.aborted;

            returnDisplayMessage = wasTimeout
              ? `Command timed out after ${effectiveTimeout}ms.`
              : 'Command cancelled by user.';
          } else if (result.signal) {
            returnDisplayMessage = `Command terminated by signal: ${result.signal}`;
          } else if (result.error) {
            returnDisplayMessage = `Command failed: ${getErrorMessage(
              result.error,
            )}`;
          } else if (result.exitCode !== null && result.exitCode !== 0) {
            returnDisplayMessage = `Command exited with code: ${result.exitCode}`;
          }
          // If output is empty and command succeeded (code 0, no error/signal/abort),
          // returnDisplayMessage will remain empty, which is fine.
        }
      }

      // Truncate large output and save full content to a temp file.
      if (typeof llmContent === 'string') {
        const truncatedResult = await truncateToolOutput(
          this.config,
          ShellTool.Name,
          llmContent,
        );

        if (truncatedResult.outputFile) {
          llmContent = truncatedResult.content;
          returnDisplayMessage +=
            (returnDisplayMessage ? '\n' : '') +
            `Output too long and was saved to: ${truncatedResult.outputFile}`;
        }
      }

      const executionError = result.error
        ? {
            error: {
              message: result.error.message,
              type: ToolErrorType.SHELL_EXECUTE_ERROR,
            },
          }
        : {};

      return {
        llmContent,
        returnDisplay: returnDisplayMessage,
        ...executionError,
      };
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  private addCoAuthorToGitCommit(command: string): string {
    // Check if co-author feature is enabled
    const gitCoAuthorSettings = this.config.getGitCoAuthor();

    if (!gitCoAuthorSettings.enabled) {
      return command;
    }

    // Check if this is a git commit command (anywhere in the command, e.g., after "cd /path &&")
    const gitCommitPattern = /\bgit\s+commit\b/;
    if (!gitCommitPattern.test(command)) {
      return command;
    }

    // Define the co-author line using configuration
    const coAuthor = `

Co-authored-by: ${gitCoAuthorSettings.name} <${gitCoAuthorSettings.email}>`;

    // Handle different git commit patterns:
    // Match -m "message" or -m 'message', including combined flags like -am
    // Use separate patterns to avoid ReDoS (catastrophic backtracking)
    //
    // Pattern breakdown:
    //   -[a-zA-Z]*m  matches -m, -am, -nm, etc. (combined short flags)
    //   \s+          matches whitespace after the flag
    //   [^"\\]       matches any char except double-quote and backslash
    //   \\.          matches escape sequences like \" or \\
    //   (?:...|...)* matches normal chars or escapes, repeated
    const doubleQuotePattern = /(-[a-zA-Z]*m\s+)"((?:[^"\\]|\\.)*)"/;
    const singleQuotePattern = /(-[a-zA-Z]*m\s+)'((?:[^'\\]|\\.)*)'/;
    const doubleMatch = command.match(doubleQuotePattern);
    const singleMatch = command.match(singleQuotePattern);
    const match = doubleMatch ?? singleMatch;
    const quote = doubleMatch ? '"' : "'";

    if (match) {
      const [fullMatch, prefix, existingMessage] = match;
      const newMessage = existingMessage + coAuthor;
      const replacement = prefix + quote + newMessage + quote;

      return command.replace(fullMatch, replacement);
    }

    // If no -m flag found, the command might open an editor
    // In this case, we can't easily modify it, so return as-is
    return command;
  }
}

function getShellToolDescription(): string {
  const isWindows = os.platform() === 'win32';
  const executionWrapper = isWindows
    ? 'cmd.exe /c <command>'
    : 'bash -c <command>';
  const processGroupNote = isWindows
    ? ''
    : '\n  - Command is executed as a subprocess that leads its own process group. Command process group can be terminated as `kill -- -PGID` or signaled as `kill -s SIGNAL -- -PGID`.';

  return `Executes a given shell command (as \`${executionWrapper}\`) in a persistent shell session with optional timeout, ensuring proper handling and security measures.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

**Usage notes**:
- The command argument is required.
- You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
- It is very helpful if you write a clear, concise description of what this command does in 5-10 words.

- Avoid using run_shell_command with the \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
  - File search: Use ${ToolNames.GLOB} (NOT find or ls)
  - Content search: Use ${ToolNames.GREP} (NOT grep or rg)
  - Read files: Use ${ToolNames.READ_FILE} (NOT cat/head/tail)
  - Edit files: Use ${ToolNames.EDIT} (NOT sed/awk)
  - Write files: Use ${ToolNames.WRITE_FILE} (NOT echo >/cat <<EOF)
  - Communication: Output text directly (NOT echo/printf)
- When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple run_shell_command tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two run_shell_command tool calls in parallel.
  - If the commands depend on each other and must run sequentially, use a single run_shell_command call with '&&' to chain them together (e.g., \`git add . && git commit -m "message" && git push\`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before run_shell_command for git operations, or git add before git commit), run these operations sequentially instead.
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
- Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
  <good-example>
  pytest /foo/bar/tests
  </good-example>
  <bad-example>
  cd /foo/bar && pytest tests
  </bad-example>

**Background vs Foreground Execution:**
- You should decide whether commands should run in background or foreground based on their nature:
- Use background execution (is_background: true) for:
  - Long-running development servers: \`npm run start\`, \`npm run dev\`, \`yarn dev\`, \`bun run start\`
  - Build watchers: \`npm run watch\`, \`webpack --watch\`
  - Database servers: \`mongod\`, \`mysql\`, \`redis-server\`
  - Web servers: \`python -m http.server\`, \`php -S localhost:8000\`
  - Any command expected to run indefinitely until manually stopped
  - Long-running batch jobs whose stdout you'll want to inspect later (evals, data processing, CI runs)
${processGroupNote}
- Use foreground execution (is_background: false) for:
  - One-time commands: \`ls\`, \`cat\`, \`grep\`
  - Build commands: \`npm run build\`, \`make\`
  - Installation commands: \`npm install\`, \`pip install\`
  - Git operations: \`git commit\`, \`git push\`
  - Test runs: \`npm test\`, \`pytest\`

**How background tasks work (non-Windows):**
- The tool result returns a stable \`Task ID\` and an absolute \`Output file\` path. stdout and stderr are redirected at the shell level, so the OS keeps writing even after this tool returns. **Output is never lost** — read the file with the ${ToolNames.READ_FILE} tool whenever you want to inspect progress or final results.
- When the process exits, the next user turn includes a \`<task_notification>\` block with the task's \`status\` (completed | failed | killed), \`exit_code\`, and \`output_file\` path. **Do not poll** — the notification arrives automatically.
- Stop a runaway background task with the \`${ToolNames.BG_STOP}\` tool, passing the \`task_id\` from the original tool result. It SIGTERMs the process group and escalates to SIGKILL after a short grace period.
- Output files live under the project temp dir; they survive across turns within a session and can grow large. Prefer the ${ToolNames.READ_FILE} tool (which tail-reads with a cap) over a shell \`cat\` for large outputs.
`;
}

function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `cmd.exe /c <command>`';
  } else {
    return 'Exact bash command to execute as `bash -c <command>`';
  }
}

export class ShellTool extends BaseDeclarativeTool<
  ShellToolParams,
  ToolResult
> {
  static Name: string = ToolNames.SHELL;

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      ToolDisplayNames.SHELL,
      getShellToolDescription(),
      Kind.Execute,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: getCommandDescription(),
          },
          is_background: {
            type: 'boolean',
            description:
              'Optional: Whether to run the command in background. Defaults to false. Set to true for long-running processes (servers, watchers, evals, batch jobs). Background tasks return a Task ID and an Output file path; stdout/stderr is redirected to that file by the OS so output survives even after this tool returns. You will receive a <task_notification> on the next turn when the task exits — do not poll. Stop a runaway task with the bg_stop tool.',
          },
          timeout: {
            type: 'number',
            description: 'Optional timeout in milliseconds (max 600000)',
          },
          description: {
            type: 'string',
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          directory: {
            type: 'string',
            description:
              '(OPTIONAL) The absolute path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  protected override validateToolParamValues(
    params: ShellToolParams,
  ): string | null {
    // NOTE: Permission checks (read-only detection, PM rules) are handled at
    // L3 (getDefaultPermission) and L4 (PM override) in coreToolScheduler.
    // This method only performs pure parameter validation.
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }
    if (getCommandRoots(params.command).length === 0) {
      return 'Could not identify command root to obtain permission from user.';
    }
    if (params.timeout !== undefined) {
      if (
        typeof params.timeout !== 'number' ||
        !Number.isInteger(params.timeout)
      ) {
        return 'Timeout must be an integer number of milliseconds.';
      }
      if (params.timeout <= 0) {
        return 'Timeout must be a positive number.';
      }
      if (params.timeout > 600000) {
        return 'Timeout cannot exceed 600000ms (10 minutes).';
      }
    }
    if (params.directory) {
      if (!path.isAbsolute(params.directory)) {
        return 'Directory must be an absolute path.';
      }

      const userSkillsDirs = this.config.storage.getUserSkillsDirs();
      const resolvedDirectoryPath = path.resolve(params.directory);
      const isWithinUserSkills = isSubpaths(
        userSkillsDirs,
        resolvedDirectoryPath,
      );
      if (isWithinUserSkills) {
        return `Explicitly running shell commands from within the user skills directory is not allowed. Please use absolute paths for command parameter instead.`;
      }

      const workspaceDirs = this.config.getWorkspaceContext().getDirectories();
      const isWithinWorkspace = workspaceDirs.some((wsDir) =>
        params.directory!.startsWith(wsDir),
      );

      if (!isWithinWorkspace) {
        return `Directory '${params.directory}' is not within any of the registered workspace directories.`;
      }
    }
    return null;
  }

  protected createInvocation(
    params: ShellToolParams,
  ): ToolInvocation<ShellToolParams, ToolResult> {
    return new ShellToolInvocation(this.config, params);
  }
}
