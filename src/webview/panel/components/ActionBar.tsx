import React from 'react';

const mod = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl';

interface Props {
  copyLoading: boolean;
  copyBlocked: boolean;
  loading: boolean;
  jsdocLoading: boolean;
  onCopy: () => void;
  onJSDoc: () => void;
  onDismissBlock: () => void;
  rootLineCount: number;
  depCount: number;
  depLineCount: number;
  totalChars: number;
  estimatedCredits: number;
  shortcutHintsDismissed: boolean;
  onDismissHints: () => void;
  hasRoot: boolean;
  exportFormat: 'plain' | 'markdown' | 'xml';
  onExportFormatChange: (format: 'plain' | 'markdown' | 'xml') => void;
  onPreview: () => void;
  aiReadyMode: boolean;
  onAIReadyToggle: () => void;
}

export function ActionBar({
  copyLoading, copyBlocked, loading, jsdocLoading,
  onCopy, onJSDoc, onDismissBlock,
  rootLineCount, depCount, depLineCount, totalChars, estimatedCredits,
  shortcutHintsDismissed, onDismissHints, hasRoot,
  exportFormat, onExportFormatChange, onPreview,
  aiReadyMode, onAIReadyToggle,
}: Props) {
  const disabled = copyLoading || copyBlocked || loading;

  let copyLabel: React.ReactNode;
  if (copyBlocked) {
    copyLabel = '\u26A0 Limit Reached';
  } else if (copyLoading) {
    copyLabel = <><span className="p-btn-spinner" /> Copying&#x2026;</>;
  } else {
    copyLabel = 'Copy to Clipboard';
  }

  return (
    <div className="p-actions">
      <div className="p-copy-summary">
        {rootLineCount} lines · {depCount} dep{depCount !== 1 ? 's' : ''}
        {depCount > 0 && ` (${depLineCount.toLocaleString()} lines)`}
        {' · '}{estimatedCredits} credit{estimatedCredits !== 1 ? 's' : ''}
      </div>
      <div className="p-format-row">
        <div className="p-format-selector">
          {(['plain', 'markdown', 'xml'] as const).map(f => (
            <button
              key={f}
              className={exportFormat === f ? 'active' : ''}
              onClick={() => onExportFormatChange(f)}
            >
              {f === 'plain' ? 'Plain' : f === 'markdown' ? 'MD' : 'XML'}
            </button>
          ))}
        </div>
        <button
          className={`p-ai-toggle${aiReadyMode ? ' active' : ''}`}
          onClick={onAIReadyToggle}
          title="AI-ready mode: adds line numbers and AI prompt for paste-back workflow"
        >
          AI
        </button>
        <button className="p-preview-btn" onClick={onPreview} title="Preview copy output">
          Preview
        </button>
      </div>
      {aiReadyMode && (
        <div className="p-ai-hint">AI-ready: line info + prompt included for paste-back</div>
      )}
      <div className="p-actions-row">
        <button
          className="p-btn p-btn-primary"
          disabled={disabled}
          onClick={onCopy}
        >
          {copyLabel}
        </button>
        <button
          className="p-btn p-btn-secondary"
          disabled={jsdocLoading || loading}
          title="Generate JSDoc documentation"
          onClick={onJSDoc}
        >
          {jsdocLoading
            ? <><span className="p-btn-spinner" /> Generating&hellip;</>
            : 'JSDoc'}
        </button>
      </div>
      {copyBlocked && (
        <div className="p-block-notice">
          <span>You have reached the copy limit. Please try again later.</span>
          <button className="p-block-dismiss" onClick={onDismissBlock}>Dismiss</button>
        </div>
      )}
      {!shortcutHintsDismissed && hasRoot && (
        <div className="p-shortcut-hints">
          <span><kbd>{mod}</kbd>+<kbd>Enter</kbd> Copy</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Depth</span>
          <span><kbd>{mod}</kbd>+<kbd>A</kbd> Select all</span>
          <span><kbd>{mod}</kbd>+<kbd>Z</kbd> Undo</span>
          <button className="p-shortcut-dismiss" onClick={onDismissHints}>Got it</button>
        </div>
      )}
    </div>
  );
}
