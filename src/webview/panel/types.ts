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

export interface SetDataPayload {
  root: CodeEntry;
  dependencies: Dependency[];
  charCount: number;
  estimatedCredits: number;
  currentDepth: number;
  isHistoryReplay: boolean;
}

export type ExtensionMessage =
  | { type: 'setData'; payload: SetDataPayload }
  | { type: 'loading'; payload: { loading: boolean } }
  | { type: 'copySuccess' }
  | { type: 'copyBlocked' }
  | { type: 'jsdocLoading'; payload: { loading: boolean } }
  | { type: 'jsdocResult'; payload: { success: boolean; jsdoc?: string; error?: string } }
  | { type: 'setMaxDepth'; payload: { maxDepth: number } }
  | { type: 'showWarning'; payload: { message: string } }
  | { type: 'error'; payload: { message: string } };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'copy'; payload: { selectedDependencies: string[]; aiReady?: boolean } }
  | { type: 'depthChange'; payload: { depth: 1 | 2 | 3 } }
  | { type: 'generateJSDoc' }
  | { type: 'feedback'; payload: { positive: boolean } };

export interface VSCodeAPI {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
