import React from 'react';

const depthHints: Record<number, string> = { 1: 'direct', 2: 'transitive', 3: 'deep' };

interface Props {
  currentDepth: 1 | 2 | 3;
  maxDepth: number;
  isHistoryReplay?: boolean;
  onChange: (depth: 1 | 2 | 3) => void;
}

export function DepthControl({ currentDepth, maxDepth, isHistoryReplay, onChange }: Props) {
  return (
    <div className="p-section">
      <div className="p-depth">
        <span className="p-depth-label">Depth</span>
        <div className="p-depth-group">
          {([1, 2, 3] as const).map((d) => (
            <button
              key={d}
              className={`p-depth-btn${currentDepth === d ? ` active d${d}` : ''}`}
              disabled={isHistoryReplay || d > maxDepth}
              aria-pressed={currentDepth === d}
              aria-label={`Depth ${d} — ${depthHints[d]}`}
              onClick={() => { if (d !== currentDepth) onChange(d); }}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="p-depth-hint">
          {isHistoryReplay ? 'read-only' : depthHints[currentDepth] || ''}
        </span>
      </div>
    </div>
  );
}
