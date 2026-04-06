import * as vscode from 'vscode';

export interface CodeEntry {
  filePath: string;
  code: string;
  language: string;
  symbolName?: string;
  isMain: boolean;
  startLine: number;
  endLine: number;
}

export interface Dependency {
  symbolName: string;
  filePath: string;
  code: string;
  language: string;
  depth: number;
  isCircular?: boolean;
  startLine?: number;
  endLine?: number;
}

export interface DependencyTree {
  root: CodeEntry;
  dependencies: Dependency[];
  totalCharacters: number;
}

export interface CopyResult {
  markdown: string;
  charCount: number;
  estimatedCredits: number;
  fileCount: number;
}

export interface CreditBalance {
  plan: Plan;
  daily: { used: number; limit: number };
  weekly: { used: number; limit: number };
}

export type Plan = 'free' | 'pro' | 'ultra' | 'business' | 'business_plus';

export interface HistoryEntry {
  id: string;
  functionName: string;
  filePath: string;
  timestamp: number;
  charCount: number;
  estimatedCredits: number;
  dependencyCount: number;
  markdown: string;
  root?: CodeEntry;
  dependencies?: Dependency[];
}

// Webview message types
export type ExtensionToWebviewMessage =
  | { type: 'setData'; payload: { root: CodeEntry; dependencies: Dependency[]; charCount: number; estimatedCredits: number } }
  | { type: 'copySuccess' }
  | { type: 'error'; payload: { message: string } };

export type WebviewToExtensionMessage =
  | { type: 'copy'; payload: { selectedDependencies: string[]; aiReady?: boolean } }
  | { type: 'depthChange'; payload: { depth: number } }
  | { type: 'ready' }
  | { type: 'feedback'; payload: { positive: boolean; comment?: string } }
  | { type: 'generateJSDoc' };
