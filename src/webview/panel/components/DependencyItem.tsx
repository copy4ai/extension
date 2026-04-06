import React, { useRef, useState } from 'react';
import { Dependency } from '../types';

function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k' : String(len);
}

function charsClass(len: number): string {
  if (len > 3000) return 'p-dep-chars very-heavy';
  if (len > 1000) return 'p-dep-chars heavy';
  return 'p-dep-chars';
}

interface Props {
  dep: Dependency;
  checked: boolean;
  onChange: (id: string, checked: boolean) => void;
  indent?: number;
}

function symbolLabel(name: string): string {
  return /^[A-Z]/.test(name) ? 'T' : 'fn';
}

export function DependencyItem({ dep, checked, onChange, indent }: Props) {
  const id = dep.filePath + ':' + dep.symbolName;
  const encodedId = encodeURIComponent(id);
  const len = dep.code.length;
  const charsTooltip = `${len.toLocaleString()} chars — ${len > 3000 ? 'large' : len > 1000 ? 'medium' : 'small'}`;

  const itemRef = useRef<HTMLLIElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  const codeLines = dep.code.split('\n');
  const previewLines = codeLines.slice(0, 8);
  const hasMore = codeLines.length > 8;

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => {
      if (itemRef.current) {
        const rect = itemRef.current.getBoundingClientRect();
        const previewHeight = Math.min(180, previewLines.length * 18 + 24);
        setPreviewPos({
          top: Math.max(8, rect.top - previewHeight - 4),
          left: rect.left + 20,
          width: Math.min(400, Math.max(260, rect.width - 40)),
        });
        setShowPreview(true);
      }
    }, 400);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimer.current);
    setShowPreview(false);
  };

  return (
    <li
      ref={itemRef}
      className={`p-dep-item${!checked ? ' dimmed' : ''}`}
      style={indent ? { paddingLeft: `${12 + indent * 20}px` } : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <input
        type="checkbox"
        id={`dep-${encodedId}`}
        checked={checked}
        onChange={(e) => onChange(id, e.target.checked)}
      />
      <label htmlFor={`dep-${encodedId}`}>
        <span className="p-dep-symbol">{symbolLabel(dep.symbolName)}</span>
        <span className="p-dep-name">{dep.symbolName}</span>
        <span className="p-dep-path" title={dep.filePath}>{dep.filePath}</span>
      </label>
      <div className="p-dep-meta">
        {dep.isCircular && (
          <span className="p-dep-circular"
            title="Circular dependency — this file imports the selected code, creating a cycle">
            &#x21BB; circular
          </span>
        )}
        <span className={charsClass(len)} title={charsTooltip}>{formatChars(len)}</span>
        <span className={`p-dep-badge d${dep.depth}`}>L{dep.depth}</span>
      </div>
      {showPreview && previewPos && (
        <div
          className="p-dep-preview"
          style={{
            top: previewPos.top,
            left: previewPos.left,
            width: previewPos.width,
          }}
        >
          <pre>{previewLines.join('\n')}{hasMore ? '\n...' : ''}</pre>
        </div>
      )}
    </li>
  );
}
