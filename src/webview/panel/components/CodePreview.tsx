import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CodeEntry } from '../types';
import { highlight, splitHtmlByLine } from '../utils/highlight';

const langDotClass: Record<string, string> = {
  typescript: 'lang-ts', typescriptreact: 'lang-ts',
  javascript: 'lang-js', javascriptreact: 'lang-js',
  python: 'lang-py', go: 'lang-go',
};

interface Props {
  root: CodeEntry;
}

export function CodePreview({ root }: Props) {
  const highlighted = useMemo(() => highlight(root.code), [root.code]);
  const lines = useMemo(() => splitHtmlByLine(highlighted), [highlighted]);
  const dotClass = langDotClass[root.language] || '';
  const filename = root.filePath.split(/[/\\]/).pop() || root.filePath;
  const lineCount = lines.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > el.clientHeight);
    setScrolledToBottom(false);
    setExpanded(false);
  }, [root.code]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }, []);

  const lineRange = ` (L${root.startLine}\u2013L${root.endLine})`;
  const gutterWidth = String(root.startLine + lineCount - 1).length;

  return (
    <div className="p-section">
      <div className="p-section-label">Selected Code</div>
      <div className="p-code-header">
        <span className="p-code-filename">
          <span className={`lang-dot ${dotClass}`} />
          <span>{filename}</span>
        </span>
        <span className="p-code-linecount">
          {lineCount} line{lineCount !== 1 ? 's' : ''}{lineRange}
        </span>
      </div>
      <div className="p-code-body">
        <div
          ref={scrollRef}
          className={`p-code-scroll${expanded ? ' expanded' : ''}`}
          onScroll={handleScroll}
        >
          <pre><code>{lines.map((lineHtml, i) => (
            <div key={i} className="p-code-line">
              <span
                className="p-line-num"
                style={{ minWidth: `${gutterWidth}ch` }}
              >
                {root.startLine + i}
              </span>
              <span
                className="p-line-content"
                dangerouslySetInnerHTML={{ __html: lineHtml || '\u200b' }}
              />
            </div>
          ))}</code></pre>
        </div>
        {isOverflowing && !scrolledToBottom && !expanded && (
          <div className="p-code-fade" />
        )}
      </div>
      {isOverflowing && (
        <button className="p-code-expand" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `Show all ${lineCount} lines`}
        </button>
      )}
    </div>
  );
}
