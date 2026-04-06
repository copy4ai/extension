import React, { useCallback, useMemo, useRef, useState } from 'react';
import { highlight, splitHtmlByLine } from '../utils/highlight';

function computeAddedLines(original: string, documented: string): Set<number> {
  const origLines = original.split('\n');
  const docLines = documented.split('\n');
  const added = new Set<number>();
  let oi = 0;
  for (let di = 0; di < docLines.length; di++) {
    if (oi < origLines.length && docLines[di].trim() === origLines[oi].trim()) {
      oi++;
    } else {
      added.add(di);
    }
  }
  return added;
}

interface Props {
  jsdocContent: string | null;
  originalCode: string | null;
  onCopy: () => void;
}

export function JSDocSection({ jsdocContent, originalCode, onCopy }: Props) {
  const highlighted = useMemo(
    () => (jsdocContent ? highlight(jsdocContent) : ''),
    [jsdocContent]
  );

  const highlightedLines = useMemo(
    () => (highlighted ? splitHtmlByLine(highlighted) : []),
    [highlighted]
  );

  const addedLines = useMemo(
    () => (originalCode && jsdocContent) ? computeAddedLines(originalCode, jsdocContent) : new Set<number>(),
    [originalCode, jsdocContent]
  );

  const [copied, setCopied] = useState(false);
  const [diffMode, setDiffMode] = useState<'full' | 'changes'>('full');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  if (!jsdocContent) return null;

  const hasChanges = addedLines.size > 0;

  let diffContent: React.ReactNode;
  if (diffMode === 'full' || !hasChanges) {
    diffContent = (
      <pre><code>{highlightedLines.map((lineHtml, i) => (
        <div
          key={i}
          className={addedLines.has(i) ? 'p-diff-added' : undefined}
          dangerouslySetInnerHTML={{ __html: lineHtml || '\u200b' }}
        />
      ))}</code></pre>
    );
  } else {
    const linesToShow = new Set<number>();
    for (let i = 0; i < highlightedLines.length; i++) {
      if (addedLines.has(i)) {
        linesToShow.add(i);
        if (i > 0) linesToShow.add(i - 1);
        if (i < highlightedLines.length - 1) linesToShow.add(i + 1);
      }
    }

    const elements: React.ReactNode[] = [];
    let lastShown = -2;

    for (let i = 0; i < highlightedLines.length; i++) {
      if (!linesToShow.has(i)) continue;

      if (lastShown >= 0 && i > lastShown + 1) {
        elements.push(
          <div key={`sep-${i}`} className="p-diff-separator">&middot;&middot;&middot;</div>
        );
      }

      elements.push(
        <div
          key={i}
          className={addedLines.has(i) ? 'p-diff-added' : 'p-diff-context'}
          dangerouslySetInnerHTML={{ __html: highlightedLines[i] || '\u200b' }}
        />
      );
      lastShown = i;
    }

    diffContent = <pre><code>{elements}</code></pre>;
  }

  return (
    <div className="p-section">
      <div className="p-jsdoc-header">
        <div className="p-section-label" style={{ marginBottom: 0 }}>Documented Code</div>
        <div className="p-jsdoc-controls">
          {hasChanges && (
            <div className="p-diff-toggle">
              <button
                className={diffMode === 'full' ? 'active' : ''}
                onClick={() => setDiffMode('full')}
              >Full</button>
              <button
                className={diffMode === 'changes' ? 'active' : ''}
                onClick={() => setDiffMode('changes')}
              >Changes only</button>
            </div>
          )}
          <button className={`p-copy-mini${copied ? ' copied' : ''}`} onClick={handleCopy}>
            {copied ? '\u2713 Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="p-jsdoc-preview">
        {diffContent}
      </div>
    </div>
  );
}
