/**
 * Tracks repeatedly denied tool calls and persists them across sessions so the
 * agent can avoid re-attempting blocked actions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DENY_THRESHOLD = 2;

interface DenialRecord {
  count: number;
  lastSeenAt: number;
}

interface BlockerStore {
  denials: Record<string, DenialRecord>;
}

export class PermissionBlockerService {
  private denials = new Map<string, DenialRecord>();
  private readonly persistPath: string;

  constructor(persistPath: string) {
    this.persistPath = persistPath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf-8');
      const store = JSON.parse(raw) as BlockerStore;
      for (const [key, rec] of Object.entries(store.denials ?? {})) {
        this.denials.set(key, rec);
      }
    } catch {
      // File doesn't exist yet — start with empty store
    }
  }

  private saveToDisk(): void {
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      const store: BlockerStore = {
        denials: Object.fromEntries(this.denials.entries()),
      };
      fs.writeFileSync(
        this.persistPath,
        JSON.stringify(store, null, 2),
        'utf-8',
      );
    } catch {
      // Non-fatal
    }
  }

  /**
   * Record a user-initiated denial for the given tool.
   * Every denial is persisted so counts are never lost across restarts.
   */
  recordDenial(toolName: string): void {
    const existing = this.denials.get(toolName) ?? { count: 0, lastSeenAt: 0 };
    const updated: DenialRecord = {
      count: existing.count + 1,
      lastSeenAt: Date.now(),
    };
    this.denials.set(toolName, updated);
    this.saveToDisk();
  }

  /**
   * Returns tool names that have been denied at or above the threshold.
   */
  getBlockedTools(): Array<{ tool: string; count: number }> {
    const result: Array<{ tool: string; count: number }> = [];
    for (const [tool, rec] of this.denials.entries()) {
      if (rec.count >= DENY_THRESHOLD) {
        result.push({ tool, count: rec.count });
      }
    }
    return result.sort((a, b) => b.count - a.count);
  }

  /**
   * Returns a system prompt note listing blocked tools, or null if none.
   */
  buildPromptNote(): string | null {
    const blocked = this.getBlockedTools();
    if (blocked.length === 0) return null;
    const list = blocked
      .map(({ tool, count }) => `  • ${tool} (denied ${count}x)`)
      .join('\n');
    return `# Previously Blocked Actions\n\nThe user has repeatedly denied these tools in past sessions. Ask before attempting them again or propose an alternative:\n${list}`;
  }

  /**
   * Clears all denial records (for the current tool name or all).
   */
  clear(toolName?: string): void {
    if (toolName) {
      this.denials.delete(toolName);
    } else {
      this.denials.clear();
    }
    this.saveToDisk();
  }
}
