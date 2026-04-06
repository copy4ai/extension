import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { VSCodeAPI, CodeEntry, Dependency, ExtensionMessage } from '../types';
import { useVSCodeMessage } from '../hooks/useVSCodeMessage';
import { Header } from './Header';
import { WarningBanner } from './WarningBanner';
import { CodePreview } from './CodePreview';
import { DepthControl } from './DepthControl';
import { LoadingBar } from './LoadingBar';
import { DependencyList } from './DependencyList';
import { ActionBar } from './ActionBar';
import { JSDocSection } from './JSDocSection';
import { FeedbackWidget } from './FeedbackWidget';
import { Toast } from './Toast';

/* ── Sticky Preferences ── */

interface PersistedPrefs {
  depth?: 1 | 2 | 3;
  depsCollapsed?: boolean;
  shortcutHintsDismissed?: boolean;
  depViewMode?: 'list' | 'tree';
  splitRatio?: number;
  exportFormat?: 'plain' | 'markdown' | 'xml';
  depGroupBy?: 'depth' | 'file';
  recentSymbols?: { name: string; path: string }[];
  aiReadyMode?: boolean;
}

function savePrefs(vscode: VSCodeAPI, partial: Partial<PersistedPrefs>) {
  const current = (vscode.getState() as PersistedPrefs) || {};
  vscode.setState({ ...current, ...partial });
}

/* ── Assemble Output ── */

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function assembleOutput(root: CodeEntry, deps: Dependency[], format: 'plain' | 'markdown' | 'xml'): string {
  switch (format) {
    case 'markdown': {
      let out = `# ${root.symbolName || 'Code'}\n\n`;
      out += `**File:** \`${root.filePath}\`\n\n`;
      out += '```' + (root.language || '') + '\n' + root.code + '\n```\n';
      if (deps.length > 0) {
        out += '\n## Dependencies\n';
        for (const dep of deps) {
          out += `\n### ${dep.symbolName}\n\n`;
          out += `**File:** \`${dep.filePath}\` · Depth ${dep.depth}\n\n`;
          out += '```' + (dep.language || '') + '\n' + dep.code + '\n```\n';
        }
      }
      return out;
    }
    case 'xml': {
      let out = '<context>\n';
      out += `  <file path="${escapeXml(root.filePath)}" symbol="${escapeXml(root.symbolName || '')}" language="${root.language}">\n`;
      out += root.code + '\n';
      out += '  </file>\n';
      for (const dep of deps) {
        out += `  <dependency path="${escapeXml(dep.filePath)}" symbol="${escapeXml(dep.symbolName)}" depth="${dep.depth}" language="${dep.language}">\n`;
        out += dep.code + '\n';
        out += '  </dependency>\n';
      }
      out += '</context>';
      return out;
    }
    default: {
      let out = `// File: ${root.filePath}\n`;
      if (root.symbolName) out += `// Symbol: ${root.symbolName}\n`;
      out += '\n' + root.code + '\n';
      for (const dep of deps) {
        out += `\n// Dependency: ${dep.symbolName} (${dep.filePath}, L${dep.depth})\n\n`;
        out += dep.code + '\n';
      }
      return out;
    }
  }
}

/* ── State ── */

interface PanelState {
  root: CodeEntry | null;
  dependencies: Dependency[];
  currentDepth: 1 | 2 | 3;
  maxDepth: number;
  isHistoryReplay: boolean;
  selectedDepIds: Set<string>;
  loading: boolean;
  copyLoading: boolean;
  copyBlocked: boolean;
  warning: string | null;
  toast: { text: string; type: 'success' | 'error' | 'warning' } | null;
  jsdocLoading: boolean;
  jsdocContent: string | null;
  showFeedback: boolean;
  feedbackKey: number;
  shortcutHintsDismissed: boolean;
}

type Action =
  | { type: 'SET_DATA'; payload: { root: CodeEntry; dependencies: Dependency[]; currentDepth: number; isHistoryReplay: boolean } }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'COPY_START' }
  | { type: 'COPY_SUCCESS' }
  | { type: 'COPY_BLOCKED' }
  | { type: 'COPY_RESET' }
  | { type: 'TOGGLE_DEP'; id: string; checked: boolean }
  | { type: 'SELECT_ALL' }
  | { type: 'SELECT_NONE' }
  | { type: 'SET_SELECTION'; ids: Set<string> }
  | { type: 'RESTORE_SELECTION'; ids: Set<string> }
  | { type: 'SET_MAX_DEPTH'; maxDepth: number }
  | { type: 'SET_WARNING'; message: string | null }
  | { type: 'SHOW_TOAST'; text: string; toastType: 'success' | 'error' | 'warning' }
  | { type: 'HIDE_TOAST' }
  | { type: 'JSDOC_LOADING'; loading: boolean }
  | { type: 'JSDOC_RESULT'; success: boolean; jsdoc?: string; error?: string }
  | { type: 'HIDE_FEEDBACK' }
  | { type: 'DISMISS_HINTS' };

function buildSelectedIds(deps: Dependency[]): Set<string> {
  return new Set(deps.map((d) => d.filePath + ':' + d.symbolName));
}

function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'SET_DATA': {
      const depth = (action.payload.currentDepth as 1 | 2 | 3) || 1;
      return {
        ...state,
        root: action.payload.root,
        dependencies: action.payload.dependencies,
        currentDepth: depth,
        isHistoryReplay: action.payload.isHistoryReplay,
        selectedDepIds: buildSelectedIds(action.payload.dependencies),
        loading: false,
        copyLoading: false,
        copyBlocked: false,
        jsdocContent: null,
        showFeedback: false,
        warning: null,
        toast: null,
      };
    }
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'COPY_START':
      return { ...state, copyLoading: true };
    case 'COPY_SUCCESS':
      return { ...state, copyLoading: false, showFeedback: true, feedbackKey: state.feedbackKey + 1 };
    case 'COPY_BLOCKED':
      return { ...state, copyLoading: false, copyBlocked: true };
    case 'COPY_RESET':
      return { ...state, copyBlocked: false, copyLoading: false };
    case 'TOGGLE_DEP': {
      const next = new Set(state.selectedDepIds);
      if (action.checked) next.add(action.id);
      else next.delete(action.id);
      return { ...state, selectedDepIds: next };
    }
    case 'SELECT_ALL':
      return { ...state, selectedDepIds: buildSelectedIds(state.dependencies) };
    case 'SELECT_NONE':
      return { ...state, selectedDepIds: new Set() };
    case 'SET_SELECTION':
      return { ...state, selectedDepIds: action.ids };
    case 'RESTORE_SELECTION':
      return { ...state, selectedDepIds: action.ids };
    case 'SET_MAX_DEPTH': {
      const clampedDepth = Math.min(state.currentDepth, action.maxDepth) as 1 | 2 | 3;
      return { ...state, maxDepth: action.maxDepth, currentDepth: clampedDepth };
    }
    case 'SET_WARNING':
      return { ...state, warning: action.message };
    case 'SHOW_TOAST':
      return { ...state, toast: { text: action.text, type: action.toastType } };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    case 'JSDOC_LOADING':
      return { ...state, jsdocLoading: action.loading };
    case 'JSDOC_RESULT':
      return {
        ...state,
        jsdocLoading: false,
        jsdocContent: action.success ? (action.jsdoc ?? null) : null,
      };
    case 'HIDE_FEEDBACK':
      return { ...state, showFeedback: false };
    case 'DISMISS_HINTS':
      return { ...state, shortcutHintsDismissed: true };
    default:
      return state;
  }
}

const initialState: PanelState = {
  root: null,
  dependencies: [],
  currentDepth: 1,
  maxDepth: 3,
  isHistoryReplay: false,
  selectedDepIds: new Set(),
  loading: false,
  copyLoading: false,
  copyBlocked: false,
  warning: null,
  toast: null,
  jsdocLoading: false,
  jsdocContent: null,
  showFeedback: false,
  feedbackKey: 0,
  shortcutHintsDismissed: false,
};

/* ── Splash Screen ── */

function SplashScreen({ recentSymbols }: { recentSymbols: { name: string; path: string }[] }) {
  return (
    <div className="p-splash">
      <div className="p-splash-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="6" width="24" height="32" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.5" />
          <rect x="16" y="10" width="24" height="32" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
        </svg>
      </div>
      <div className="p-splash-title">Copy4AI</div>
      <div className="p-splash-subtitle">Preparing your code...</div>
      <div className="p-splash-loader">
        <div className="p-splash-bar" />
      </div>
      {recentSymbols.length > 0 && (
        <div className="p-splash-recent">
          <div className="p-splash-recent-label">Recent</div>
          {recentSymbols.map((s, i) => (
            <div key={i} className="p-splash-recent-item">
              <span className="p-splash-recent-name">{s.name}</span>
              <span className="p-splash-recent-path">{s.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Copy Preview Modal ── */

function CopyPreviewModal({ content, onClose }: { content: string; onClose: () => void }) {
  return (
    <div className="p-modal-overlay" onClick={onClose}>
      <div className="p-modal" onClick={e => e.stopPropagation()}>
        <div className="p-modal-header">
          <span className="p-section-label" style={{ marginBottom: 0 }}>Copy Preview</span>
          <button className="p-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="p-modal-body">
          <pre>{content}</pre>
        </div>
      </div>
    </div>
  );
}

/* ── App ── */

interface Props {
  vscode: VSCodeAPI;
}

export function App({ vscode }: Props) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    return {
      ...initialState,
      currentDepth: prefs.depth || 1,
      shortcutHintsDismissed: prefs.shortcutHintsDismissed || false,
    };
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(false);
  const [showCopyPreview, setShowCopyPreview] = useState(false);
  const [exportFormat, setExportFormat] = useState<'plain' | 'markdown' | 'xml'>(() => {
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    return prefs.exportFormat || 'plain';
  });
  const [aiReadyMode, setAiReadyMode] = useState(() => {
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    return prefs.aiReadyMode || false;
  });
  const [splitRatio, setSplitRatio] = useState(() => {
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    return prefs.splitRatio || 58;
  });

  const selectionHistoryRef = useRef<Set<string>[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleCopyRef = useRef<() => void>();
  const splitRatioRef = useRef(splitRatio);
  splitRatioRef.current = splitRatio;

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsWide(entry.contentRect.width >= 600);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
    return () => clearTimeout(t);
  }, [state.toast]);

  useEffect(() => {
    if (state.root) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.root, state.dependencies]);

  /* ── Selection history tracking ── */
  const pushSelectionHistory = useCallback(() => {
    const history = selectionHistoryRef.current;
    history.push(new Set(stateRef.current.selectedDepIds));
    if (history.length > 25) history.splice(0, history.length - 25);
  }, []);

  const dispatchWithHistory = useCallback((action: Action) => {
    if (action.type === 'TOGGLE_DEP' || action.type === 'SELECT_ALL' || action.type === 'SELECT_NONE' || action.type === 'SET_SELECTION') {
      pushSelectionHistory();
    }
    dispatch(action);
  }, [pushSelectionHistory]);

  /* ── Keyboard Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const s = stateRef.current;
      if (!s.root) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleCopyRef.current?.();
        return;
      }

      if (mod && e.key === 'z') {
        e.preventDefault();
        const history = selectionHistoryRef.current;
        if (history.length > 0) {
          const prev = history.pop()!;
          dispatch({ type: 'RESTORE_SELECTION', ids: prev });
        }
        return;
      }

      if (mod && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        dispatchWithHistory({ type: 'SELECT_NONE' });
        return;
      }

      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        dispatchWithHistory({ type: 'SELECT_ALL' });
        return;
      }

      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const d = Number(e.key) as 1 | 2 | 3;
        if (d <= s.maxDepth && !s.isHistoryReplay) {
          vscode.postMessage({ type: 'depthChange', payload: { depth: d } });
          savePrefs(vscode, { depth: d });
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Track recent symbols ── */
  const trackRecentSymbol = useCallback(() => {
    const s = stateRef.current;
    if (!s.root) return;
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    const recent = (prefs.recentSymbols || []).filter(
      r => !(r.name === s.root!.symbolName && r.path === s.root!.filePath)
    );
    recent.unshift({ name: s.root.symbolName || 'Code', path: s.root.filePath });
    savePrefs(vscode, { recentSymbols: recent.slice(0, 5) });
  }, []);

  useVSCodeMessage((msg: ExtensionMessage) => {
    switch (msg.type) {
      case 'setData':
        dispatch({ type: 'SET_DATA', payload: msg.payload });
        break;
      case 'loading':
        dispatch({ type: 'SET_LOADING', loading: msg.payload.loading });
        break;
      case 'copySuccess': {
        dispatch({ type: 'COPY_SUCCESS' });
        trackRecentSymbol();
        const depCount = state.dependencies.filter(d =>
          state.selectedDepIds.has(d.filePath + ':' + d.symbolName)
        ).length;
        const name = state.root?.symbolName || 'Code';
        dispatch({
          type: 'SHOW_TOAST',
          text: `Copied: ${name} + ${depCount} dep${depCount !== 1 ? 's' : ''} (${totalChars.toLocaleString()} chars)`,
          toastType: 'success',
        });
        break;
      }
      case 'copyBlocked':
        dispatch({ type: 'COPY_BLOCKED' });
        break;
      case 'jsdocLoading':
        dispatch({ type: 'JSDOC_LOADING', loading: msg.payload.loading });
        break;
      case 'jsdocResult':
        dispatch({ type: 'JSDOC_RESULT', success: msg.payload.success, jsdoc: msg.payload.jsdoc, error: msg.payload.error });
        if (msg.payload.success) {
          dispatch({ type: 'SHOW_TOAST', text: 'JSDoc generated!', toastType: 'success' });
        } else {
          dispatch({ type: 'SHOW_TOAST', text: msg.payload.error || 'Failed to generate JSDoc', toastType: 'error' });
        }
        break;
      case 'setMaxDepth':
        dispatch({ type: 'SET_MAX_DEPTH', maxDepth: msg.payload.maxDepth });
        break;
      case 'showWarning':
        dispatch({ type: 'SET_WARNING', message: msg.payload.message });
        break;
      case 'error':
        dispatch({ type: 'SHOW_TOAST', text: msg.payload.message, toastType: 'error' });
        break;
    }
  });

  const { totalChars, estimatedCredits, fileCount, rootLineCount, depCount, depLineCount, depthDistribution } = useMemo(() => {
    if (!state.root) return { totalChars: 0, estimatedCredits: 1, fileCount: 1, rootLineCount: 0, depCount: 0, depLineCount: 0, depthDistribution: [] as { depth: number; count: number }[] };
    const selectedDeps = state.dependencies.filter((d) =>
      state.selectedDepIds.has(d.filePath + ':' + d.symbolName)
    );
    const totalChars = state.root.code.length + selectedDeps.reduce((s, d) => s + d.code.length, 0);
    const estimatedCredits = totalChars <= 2000 ? 1 : totalChars <= 8000 ? 2 : 3;
    const rootLineCount = state.root.code.split('\n').length;
    const depLineCount = selectedDeps.reduce((s, d) => s + d.code.split('\n').length, 0);

    const depthCounts: Record<number, number> = {};
    selectedDeps.forEach(d => { depthCounts[d.depth] = (depthCounts[d.depth] || 0) + 1; });
    const depthDistribution = Object.entries(depthCounts)
      .map(([depth, count]) => ({ depth: Number(depth), count }))
      .sort((a, b) => a.depth - b.depth);

    return { totalChars, estimatedCredits, fileCount: 1 + selectedDeps.length, rootLineCount, depCount: selectedDeps.length, depLineCount, depthDistribution };
  }, [state.root, state.dependencies, state.selectedDepIds]);

  const assembledPreview = useMemo(() => {
    if (!state.root) return '';
    const selectedDeps = state.dependencies.filter(d => state.selectedDepIds.has(d.filePath + ':' + d.symbolName));
    return assembleOutput(state.root, selectedDeps, exportFormat);
  }, [state.root, state.dependencies, state.selectedDepIds, exportFormat]);

  /* ── Drag-to-Resize (hook must be before early return) ── */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const layoutEl = rootRef.current?.querySelector('.p-layout') as HTMLElement;
    if (!layoutEl) return;
    const layoutRect = layoutEl.getBoundingClientRect();

    const handleMove = (ev: MouseEvent) => {
      const x = ev.clientX - layoutRect.left;
      const pct = Math.min(75, Math.max(30, (x / layoutRect.width) * 100));
      setSplitRatio(pct);
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      savePrefs(vscode, { splitRatio: splitRatioRef.current });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, []);

  /* ── Splash / Loading Screen ── */
  if (!state.root) {
    const prefs = (vscode.getState() as PersistedPrefs) || {};
    return (
      <div ref={rootRef} className="p-root">
        <SplashScreen recentSymbols={prefs.recentSymbols || []} />
      </div>
    );
  }

  const handleCopy = () => {
    if (exportFormat !== 'plain' && !aiReadyMode) {
      navigator.clipboard.writeText(assembledPreview).then(() => {
        dispatch({ type: 'COPY_SUCCESS' });
        trackRecentSymbol();
        const formatLabel = exportFormat.toUpperCase();
        const name = state.root?.symbolName || 'Code';
        dispatch({
          type: 'SHOW_TOAST',
          text: `Copied [${formatLabel}]: ${name} + ${depCount} dep${depCount !== 1 ? 's' : ''} (${totalChars.toLocaleString()} chars)`,
          toastType: 'success',
        });
      });
    } else {
      dispatch({ type: 'COPY_START' });
      vscode.postMessage({
        type: 'copy',
        payload: { selectedDependencies: Array.from(state.selectedDepIds), aiReady: aiReadyMode },
      });
    }
  };
  handleCopyRef.current = handleCopy;

  const handleDepthChange = (depth: 1 | 2 | 3) => {
    vscode.postMessage({ type: 'depthChange', payload: { depth } });
    savePrefs(vscode, { depth });
  };

  const handleJSDoc = () => {
    vscode.postMessage({ type: 'generateJSDoc' });
  };

  const handleFeedback = (positive: boolean) => {
    vscode.postMessage({ type: 'feedback', payload: { positive } });
    dispatch({ type: 'HIDE_FEEDBACK' });
    dispatch({ type: 'SHOW_TOAST', text: positive ? 'Thanks for the feedback!' : "Thanks, we'll improve!", toastType: 'success' });
  };

  const handleCopyJSDoc = () => {
    if (state.jsdocContent) {
      navigator.clipboard.writeText(state.jsdocContent);
      dispatch({ type: 'SHOW_TOAST', text: 'JSDoc copied!', toastType: 'success' });
    }
  };

  const handleDismissHints = () => {
    dispatch({ type: 'DISMISS_HINTS' });
    savePrefs(vscode, { shortcutHintsDismissed: true });
  };

  const handleDepsCollapsedChange = (collapsed: boolean) => {
    savePrefs(vscode, { depsCollapsed: collapsed });
  };

  const handleDepViewModeChange = (mode: 'list' | 'tree') => {
    savePrefs(vscode, { depViewMode: mode });
  };

  const handleDepGroupByChange = (groupBy: 'depth' | 'file') => {
    savePrefs(vscode, { depGroupBy: groupBy });
  };

  const handleExportFormatChange = (format: 'plain' | 'markdown' | 'xml') => {
    setExportFormat(format);
    savePrefs(vscode, { exportFormat: format });
  };

  const handleAIReadyToggle = () => {
    const next = !aiReadyMode;
    setAiReadyMode(next);
    savePrefs(vscode, { aiReadyMode: next });
  };

  const handleSelectPreset = (preset: string) => {
    pushSelectionHistory();
    let filterFn: (d: Dependency) => boolean;
    switch (preset) {
      case 'types': filterFn = d => /^[A-Z]/.test(d.symbolName); break;
      case 'functions': filterFn = d => /^[a-z]/.test(d.symbolName); break;
      case 'no-circular': filterFn = d => !d.isCircular; break;
      case 'small': filterFn = d => d.code.length < 1000; break;
      default: return;
    }
    const ids = new Set(state.dependencies.filter(filterFn).map(d => d.filePath + ':' + d.symbolName));
    dispatch({ type: 'SET_SELECTION', ids });
  };

  const prefs = (vscode.getState() as PersistedPrefs) || {};
  const layoutStyle = isWide ? { gridTemplateColumns: `${splitRatio}fr ${100 - splitRatio}fr` } : undefined;

  return (
    <div ref={rootRef} className={`p-root${isWide ? ' wide' : ''}`}>
      <Header
        root={state.root}
        totalChars={totalChars}
        estimatedCredits={estimatedCredits}
        fileCount={fileCount}
        depthDistribution={depthDistribution}
      />
      {state.isHistoryReplay && (
        <div className="p-history-banner">
          <span className="p-history-icon">&#x1F553;</span>
          <span>Viewing from history &mdash; depth changes are disabled</span>
        </div>
      )}
      <WarningBanner
        message={state.warning}
        onClose={() => dispatch({ type: 'SET_WARNING', message: null })}
      />
      <div className="p-layout" style={layoutStyle}>
        <div className="p-layout-main">
          <CodePreview root={state.root} />
          <JSDocSection
            jsdocContent={state.jsdocContent}
            originalCode={state.root.code}
            onCopy={handleCopyJSDoc}
          />
          {isWide && (
            <div className="p-resize-handle" onMouseDown={handleResizeStart} />
          )}
        </div>
        <div className="p-layout-side">
          <DepthControl
            currentDepth={state.currentDepth}
            maxDepth={state.maxDepth}
            isHistoryReplay={state.isHistoryReplay}
            onChange={handleDepthChange}
          />
          <LoadingBar visible={state.loading} />
          <DependencyList
            dependencies={state.dependencies}
            selectedIds={state.selectedDepIds}
            onToggle={(id, checked) => dispatchWithHistory({ type: 'TOGGLE_DEP', id, checked })}
            onSelectAll={() => dispatchWithHistory({ type: 'SELECT_ALL' })}
            onSelectNone={() => dispatchWithHistory({ type: 'SELECT_NONE' })}
            initialCollapsed={prefs.depsCollapsed}
            onCollapsedChange={handleDepsCollapsedChange}
            initialViewMode={prefs.depViewMode}
            onViewModeChange={handleDepViewModeChange}
            initialGroupBy={prefs.depGroupBy}
            onGroupByChange={handleDepGroupByChange}
            onSelectPreset={handleSelectPreset}
          />
          <FeedbackWidget key={state.feedbackKey} visible={state.showFeedback} onFeedback={handleFeedback} />
          <ActionBar
            copyLoading={state.copyLoading}
            copyBlocked={state.copyBlocked}
            loading={state.loading}
            jsdocLoading={state.jsdocLoading}
            onCopy={handleCopy}
            onJSDoc={handleJSDoc}
            onDismissBlock={() => dispatch({ type: 'COPY_RESET' })}
            rootLineCount={rootLineCount}
            depCount={depCount}
            depLineCount={depLineCount}
            totalChars={totalChars}
            estimatedCredits={estimatedCredits}
            shortcutHintsDismissed={state.shortcutHintsDismissed}
            onDismissHints={handleDismissHints}
            hasRoot={!!state.root}
            exportFormat={exportFormat}
            onExportFormatChange={handleExportFormatChange}
            onPreview={() => setShowCopyPreview(true)}
            aiReadyMode={aiReadyMode}
            onAIReadyToggle={handleAIReadyToggle}
          />
        </div>
      </div>
      <Toast toast={state.toast} />
      {showCopyPreview && (
        <CopyPreviewModal
          content={assembledPreview}
          onClose={() => setShowCopyPreview(false)}
        />
      )}
    </div>
  );
}
