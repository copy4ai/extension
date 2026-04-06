import * as vscode from 'vscode';
import { HistoryEntry } from '../types';
import { HISTORY_MAX_ENTRIES } from '../utils/constants';

const HISTORY_KEY = 'copy4ai.history';

export class HistoryService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  getEntries(): HistoryEntry[] {
    return this.context.workspaceState.get<HistoryEntry[]>(HISTORY_KEY, []);
  }

  async addEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<void> {
    const entries = this.getEntries();

    const newEntry: HistoryEntry = {
      ...entry,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
    };

    entries.unshift(newEntry);

    // Keep only the last N entries
    if (entries.length > HISTORY_MAX_ENTRIES) {
      entries.length = HISTORY_MAX_ENTRIES;
    }

    await this.context.workspaceState.update(HISTORY_KEY, entries);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(HISTORY_KEY, []);
  }
}
