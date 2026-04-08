/**
 * @license
 * Copyright 2025 protoLabs Studio
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
  ToolResultDisplay,
  ToolConfirmationPayload,
  ToolConfirmationOutcome,
} from './tools.js';
import type { PermissionDecision } from '../permissions/types.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { getErrorMessage } from '../utils/errors.js';

const debugLogger = createDebugLogger('BROWSER');

/**
 * Browser automation tool parameters
 */
export interface BrowserToolParams {
  /**
   * Browser action to perform: open, close, snapshot, click, fill, type,
   * screenshot, get, is, find, wait, batch, etc.
   */
  action: BrowserAction;
  /**
   * URL for open action
   */
  url?: string;
  /**
   * Selector for element actions (CSS selector or element ref like @e1)
   */
  selector?: string;
  /**
   * Text to fill or type
   */
  text?: string;
  /**
   * Attribute name for get attr action
   */
  attribute?: string;
  /**
   * Key to press (e.g., Enter, Tab, Escape)
   */
  key?: string;
  /**
   * Additional flags as JSON string
   */
  flags?: string;
  /**
   * Batch commands for batch action (JSON array of commands)
   */
  commands?: string[];
  /**
   * Whether to use headed mode (show browser window)
   */
  headed?: boolean;
  /**
   * Session name for persistent sessions
   */
  session?: string;
  /**
   * Path for screenshot or other file outputs
   */
  outputPath?: string;
  /**
   * Output format: text or json
   */
  format?: 'text' | 'json';
}

/**
 * Supported browser actions
 */
export type BrowserAction =
  | 'open'
  | 'close'
  | 'snapshot'
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'type'
  | 'press'
  | 'screenshot'
  | 'get'
  | 'is'
  | 'find'
  | 'wait'
  | 'batch'
  | 'scroll'
  | 'hover'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'upload'
  | 'clipboard'
  | 'mouse'
  | 'keyboard'
  | 'tab'
  | 'window'
  | 'cookies'
  | 'storage'
  | 'network'
  | 'diff'
  | 'chat'
  | 'install'
  | 'profiles'
  | 'dashboard'
  | 'console'
  | 'errors'
  | 'trace'
  | 'profiler'
  | 'inspect'
  | 'eval';

/**
 * Map of action to agent-browser CLI command and arguments
 */
function buildCommand(
  action: BrowserAction,
  params: BrowserToolParams,
): string[] {
  const args: string[] = [];

  // Note: This switch covers all BrowserAction cases exhaustively
  switch (action) {
    case 'open':
      args.push('open');
      if (params.url) {
        args.push(params.url);
      }
      if (params.headed) {
        args.push('--headed');
      }
      if (params.session) {
        args.push('--session', params.session);
      }
      break;

    case 'close':
      args.push('close');
      break;

    case 'snapshot':
      args.push('snapshot');
      if (params.flags) {
        try {
          const flags = JSON.parse(params.flags);
          if (flags.interactive) args.push('-i');
          if (flags.urls) args.push('-u');
          if (flags.compact) args.push('-c');
          if (flags.depth) args.push('-d', String(flags.depth));
          if (flags.selector) args.push('-s', flags.selector);
        } catch {
          // Ignore invalid flags JSON
        }
      }
      if (params.format === 'json') {
        args.push('--json');
      }
      break;

    case 'click':
      args.push('click');
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'dblclick':
      args.push('dblclick');
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'fill':
      args.push('fill');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'type':
      args.push('type');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'press':
      args.push('press');
      if (params.key) {
        args.push(params.key);
      }
      break;

    case 'screenshot':
      args.push('screenshot');
      if (params.outputPath) {
        args.push(params.outputPath);
      }
      if (params.flags) {
        try {
          const flags = JSON.parse(params.flags);
          if (flags.full) args.push('--full');
          if (flags.annotate) args.push('--annotate');
        } catch {
          // Ignore invalid flags JSON
        }
      }
      break;

    case 'scroll':
      args.push('scroll');
      if (params.text) {
        args.push(params.text);
      }
      if (params.selector) {
        args.push('--selector', params.selector);
      }
      break;

    case 'hover':
      args.push('hover');
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'select':
      args.push('select');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'check':
      args.push('check');
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'uncheck':
      args.push('uncheck');
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'upload':
      args.push('upload');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'batch':
      args.push('batch');
      if (params.commands && params.commands.length > 0) {
        for (const cmd of params.commands) {
          args.push(cmd);
        }
      }
      break;

    case 'get':
      args.push('get');
      if (params.selector) {
        args.push(params.selector);
      } else if (params.text) {
        // e.g., 'get title', 'get url'
        args.push(params.text);
      }
      if (params.attribute) {
        args.push(params.attribute);
      }
      break;

    case 'is':
      args.push('is');
      if (params.text) {
        // e.g., 'is visible', 'is enabled'
        args.push(params.text);
      }
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'find':
      args.push('find');
      if (params.selector) {
        // e.g., 'find role button', 'find text Sign In'
        const parts = params.selector.split(' ');
        args.push(...parts);
      }
      if (params.text) {
        // action like 'click', 'fill', etc.
        args.push(params.text);
      }
      if (params.attribute) {
        args.push('--name', params.attribute);
      }
      break;

    case 'wait':
      args.push('wait');
      if (params.selector) {
        args.push(params.selector);
      } else if (params.text) {
        args.push(params.text);
      }
      if (params.attribute) {
        args.push('--' + params.attribute);
      }
      break;

    case 'clipboard':
      args.push('clipboard');
      if (params.text) {
        args.push('write', params.text);
      } else {
        args.push('read');
      }
      break;

    case 'mouse':
      args.push('mouse');
      if (params.selector) {
        // e.g., 'mouse move 100 200'
        args.push(...params.selector.split(' '));
      }
      break;

    case 'keyboard':
      args.push('keyboard');
      if (params.selector) {
        // e.g., 'keyboard type hello'
        args.push(...params.selector.split(' '));
      }
      break;

    case 'tab':
      args.push('tab');
      if (params.text) {
        args.push(params.text);
      }
      if (params.url) {
        args.push(params.url);
      }
      break;

    case 'window':
      args.push('window');
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'cookies':
      args.push('cookies');
      if (params.selector) {
        args.push(...params.selector.split(' '));
      }
      if (params.text) {
        args.push(params.text);
      }
      break;

    case 'storage':
      args.push('storage');
      if (params.text) {
        args.push(params.text);
      }
      if (params.selector) {
        args.push(...params.selector.split(' '));
      }
      break;

    case 'network':
      args.push('network');
      if (params.text) {
        args.push(params.text);
      }
      if (params.selector) {
        args.push(params.selector);
      }
      break;

    case 'diff':
      args.push('diff');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push('--baseline', params.text);
      }
      break;

    case 'chat':
      args.push('chat');
      if (params.text) {
        args.push(`"${params.text}"`);
      }
      break;

    case 'install':
      args.push('install');
      if (params.flags) {
        try {
          const flags = JSON.parse(params.flags);
          if (flags.withDeps) args.push('--with-deps');
        } catch {
          // Ignore invalid flags JSON
        }
      }
      break;

    case 'profiles':
      args.push('profiles');
      break;

    case 'dashboard':
      args.push('dashboard');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.text) {
        args.push('--port', params.text);
      }
      break;

    case 'console':
      args.push('console');
      if (params.format === 'json') {
        args.push('--json');
      }
      break;

    case 'errors':
      args.push('errors');
      break;

    case 'trace':
      args.push('trace');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.outputPath) {
        args.push(params.outputPath);
      }
      break;

    case 'profiler':
      args.push('profiler');
      if (params.selector) {
        args.push(params.selector);
      }
      if (params.outputPath) {
        args.push(params.outputPath);
      }
      break;

    case 'inspect':
      args.push('inspect');
      break;

    case 'eval':
      args.push('eval');
      if (params.text) {
        args.push(params.text);
      }
      if (params.flags) {
        try {
          const flags = JSON.parse(params.flags);
          if (flags.base64) args.push('-b');
          if (flags.stdin) args.push('--stdin');
        } catch {
          // Ignore invalid flags JSON
        }
      }
      break;
    default:
      // All BrowserAction cases are handled above - this is for exhaustiveness
      break;
  }

  return args;
}

class BrowserToolInvocation extends BaseToolInvocation<
  BrowserToolParams,
  ToolResult
> {
  private static agentBrowserPath: string | null = null;

  constructor(
    private readonly config: Config,
    params: BrowserToolParams,
  ) {
    super(params);
  }

  private static findAgentBrowser(): string | null {
    if (this.agentBrowserPath) {
      return this.agentBrowserPath;
    }

    // Try to find agent-browser in PATH
    const pathEnv = process.env['PATH'] || '';
    const pathDirs = pathEnv.split(path.delimiter);

    for (const dir of pathDirs) {
      const fullPath = path.join(dir, 'agent-browser');
      if (fs.existsSync(fullPath)) {
        this.agentBrowserPath = fullPath;
        return this.agentBrowserPath;
      }
    }

    // Check common locations
    const possiblePaths = [
      '/usr/local/bin/agent-browser',
      '/usr/bin/agent-browser',
      path.join(
        process.env['HOME'] || '/root',
        '.npm-global/bin/agent-browser',
      ),
    ];

    for (const fullPath of possiblePaths) {
      if (fs.existsSync(fullPath)) {
        this.agentBrowserPath = fullPath;
        return this.agentBrowserPath;
      }
    }

    return null;
  }

  override getDescription(): string {
    const action = this.params.action;
    const parts = [`Browser ${action}`];

    if (this.params.url) {
      parts.push(`url: ${this.params.url}`);
    }
    if (this.params.selector) {
      parts.push(`selector: ${this.params.selector}`);
    }
    if (this.params.text) {
      const text =
        this.params.text.length > 30
          ? this.params.text.substring(0, 27) + '...'
          : this.params.text;
      parts.push(`text: "${text}"`);
    }
    if (this.params.outputPath) {
      parts.push(`output: ${this.params.outputPath}`);
    }
    if (this.params.session) {
      parts.push(`session: ${this.params.session}`);
    }

    return parts.join(', ');
  }

  override getSummaryLabel(): string {
    return `Browser ${this.params.action}`;
  }

  override async getDefaultPermission(): Promise<PermissionDecision> {
    // Browser automation requires user confirmation due to potential side effects
    return 'ask';
  }

  override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails> {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Browser Automation',
      prompt: `Perform browser action: ${this.params.action}${this.params.url ? ` on ${this.params.url}` : ''}`,
      permissionRules: [`BrowserTool(${this.params.action})`],
      urls: this.params.url ? [this.params.url] : undefined,
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
  ): Promise<ToolResult> {
    const agentBrowser = BrowserToolInvocation.findAgentBrowser();

    if (!agentBrowser) {
      const errorMsg =
        'agent-browser is not installed. Please install it with: npm install -g agent-browser';
      debugLogger.error(`[BrowserTool] ${errorMsg}`);
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.BROWSER_TOOL_ERROR,
        },
      };
    }

    const args = buildCommand(this.params.action, this.params);

    if (args.length === 0 && this.params.action !== 'close') {
      const errorMsg = `No arguments provided for action: ${this.params.action}`;
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
        error: {
          message: errorMsg,
          type: ToolErrorType.BROWSER_TOOL_ERROR,
        },
      };
    }

    debugLogger.debug(
      `[BrowserTool] Executing: ${agentBrowser} ${args.join(' ')}`,
    );

    return new Promise<ToolResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let outputCollected = false;
      const outputInterval = setInterval(() => {
        if (updateOutput && stdout && !outputCollected) {
          updateOutput(stdout);
        }
      }, 100);

      const child = spawn(agentBrowser, args, {
        cwd: this.config.getTargetDir(),
        signal,
        env: {
          ...process.env,
          // Pass through browser-related env vars
          AGENT_BROWSER_SESSION: this.params.session || '',
        },
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearInterval(outputInterval);
        const errorMsg = `Failed to execute agent-browser: ${getErrorMessage(error)}`;
        debugLogger.error(`[BrowserTool] ${errorMsg}`);
        resolve({
          llmContent: errorMsg,
          returnDisplay: errorMsg,
          error: {
            message: errorMsg,
            type: ToolErrorType.BROWSER_TOOL_ERROR,
          },
        });
      });

      child.on('close', (code, signalNode) => {
        clearInterval(outputInterval);
        outputCollected = true;

        if (signal.aborted) {
          resolve({
            llmContent: 'Browser action was cancelled by user.',
            returnDisplay: 'Browser action cancelled.',
          });
          return;
        }

        const finalOutput = stdout || stderr || '';

        if (code !== 0) {
          const errorMsg = `agent-browser exited with code ${code}${signalNode ? ` (signal: ${signalNode})` : ''}:\n${finalOutput}`;
          debugLogger.error(`[BrowserTool] ${errorMsg}`);

          // Truncate large output
          const truncatedResult = this.truncateOutput(finalOutput);
          resolve({
            llmContent: truncatedResult,
            returnDisplay: `Browser action failed: ${code}`,
            error: {
              message: errorMsg,
              type: ToolErrorType.BROWSER_TOOL_ERROR,
            },
          });
          return;
        }

        debugLogger.debug(
          `[BrowserTool] Success: ${finalOutput.substring(0, 200)}`,
        );

        // Truncate large output for LLM
        const truncatedResult = this.truncateOutput(finalOutput);

        resolve({
          llmContent: truncatedResult,
          returnDisplay:
            finalOutput || 'Browser action completed successfully.',
        });
      });
    });
  }

  private truncateOutput(output: string): string {
    const maxLength = 50000; // 50KB limit for browser output
    if (output.length <= maxLength) {
      return output;
    }
    return (
      output.substring(0, maxLength) +
      `\n\n[Output truncated - ${output.length - maxLength} characters omitted]`
    );
  }
}

function getBrowserToolDescription(): string {
  return `Browser automation tool using agent-browser CLI for AI agents.

This tool provides browser automation capabilities including navigation, element interaction, and page inspection.

**Key Actions:**
- \`open\` - Navigate to a URL and optionally show browser window
- \`snapshot\` - Get accessibility tree with interactive elements (best for AI)
- \`click\`, \`fill\`, \`type\` - Interact with elements
- \`screenshot\` - Take a screenshot
- \`get\` - Get element attributes, page title, URL, etc.
- \`find\` - Find elements by role, text, label, etc.
- \`batch\` - Execute multiple commands in sequence
- \`wait\` - Wait for conditions
- \`close\` - Close the browser

**Selectors:**
- Element refs: @e1, @e2 (from snapshot output)
- CSS selectors: #id, .class, div > button
- Semantic: role:button, text:"Sign In", label:"Email"

**Usage Notes:**
- Use \`open\` first to navigate to a URL
- Use \`snapshot -i\` to get interactive elements with refs
- Click/fill elements using refs (@e1) or CSS selectors
- Screenshots are saved to the specified path or stdout
- Sessions persist between commands for authentication states
- Use \`--headed true\` to show browser window for debugging

**Requirements:**
- agent-browser must be installed: npm install -g agent-browser
- Chrome browser must be installed (auto-downloaded by agent-browser install)`;
}

export class BrowserTool extends BaseDeclarativeTool<
  BrowserToolParams,
  ToolResult
> {
  static Name: string = ToolNames.BROWSER;

  constructor(private readonly config: Config) {
    super(
      BrowserTool.Name,
      ToolDisplayNames.BROWSER,
      getBrowserToolDescription(),
      Kind.Other,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Browser action to perform',
            enum: [
              'open',
              'close',
              'snapshot',
              'click',
              'dblclick',
              'fill',
              'type',
              'press',
              'screenshot',
              'get',
              'is',
              'find',
              'wait',
              'batch',
              'scroll',
              'hover',
              'select',
              'check',
              'uncheck',
              'upload',
              'clipboard',
              'mouse',
              'keyboard',
              'tab',
              'window',
              'cookies',
              'storage',
              'network',
              'diff',
              'chat',
              'install',
              'profiles',
              'dashboard',
              'console',
              'errors',
              'trace',
              'profiler',
              'inspect',
              'eval',
            ],
          },
          url: {
            type: 'string',
            description: 'URL for open action or tab actions',
          },
          selector: {
            type: 'string',
            description:
              'Element selector (CSS selector, element ref like @e1, or semantic query)',
          },
          text: {
            type: 'string',
            description:
              'Text to fill/type, or action modifier (e.g., "title", "visible")',
          },
          attribute: {
            type: 'string',
            description:
              'Attribute name for get attr action, or --name filter for find',
          },
          key: {
            type: 'string',
            description: 'Key to press (e.g., Enter, Tab, Escape)',
          },
          flags: {
            type: 'string',
            description:
              'Additional flags as JSON string (e.g., {"interactive": true})',
          },
          commands: {
            type: 'array',
            items: { type: 'string' },
            description: 'Batch commands to execute in sequence',
          },
          headed: {
            type: 'boolean',
            description: 'Show browser window (headed mode)',
            default: false,
          },
          session: {
            type: 'string',
            description: 'Session name for persistent browser sessions',
          },
          outputPath: {
            type: 'string',
            description: 'Path for screenshot or other file outputs',
          },
          format: {
            type: 'string',
            enum: ['text', 'json'],
            description: 'Output format',
            default: 'text',
          },
        },
        required: ['action'],
      },
      true, // isOutputMarkdown
      true, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: BrowserToolParams,
  ): string | null {
    if (!params.action) {
      return "The 'action' parameter is required.";
    }

    // Validate action-specific requirements
    switch (params.action) {
      case 'open':
        if (!params.url) {
          return "The 'url' parameter is required for 'open' action.";
        }
        break;
      case 'click':
      case 'dblclick':
      case 'type':
      case 'hover':
      case 'check':
      case 'uncheck':
      case 'select':
      case 'upload':
        if (!params.selector) {
          return `The 'selector' parameter is required for '${params.action}' action.`;
        }
        break;
      case 'fill':
        if (!params.selector) {
          return "The 'selector' parameter is required for 'fill' action.";
        }
        if (!params.text) {
          return "The 'text' parameter is required for 'fill' action.";
        }
        break;
      default:
        // All BrowserAction cases are handled above - this is for exhaustiveness
        break;
    }

    return null;
  }

  protected createInvocation(
    params: BrowserToolParams,
  ): ToolInvocation<BrowserToolParams, ToolResult> {
    return new BrowserToolInvocation(this.config, params);
  }
}
