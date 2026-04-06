import React from 'react';
import { CodeEntry } from '../types';

const langDotClass: Record<string, string> = {
  typescript: 'lang-ts', typescriptreact: 'lang-ts',
  javascript: 'lang-js', javascriptreact: 'lang-js',
  python: 'lang-py', go: 'lang-go',
};

const langDisplayName: Record<string, string> = {
  typescript: 'TypeScript', typescriptreact: 'TSX',
  javascript: 'JavaScript', javascriptreact: 'JSX',
  python: 'Python', go: 'Go',
};

interface Props {
  root: CodeEntry;
  totalChars: number;
  estimatedCredits: number;
  fileCount: number;
  depthDistribution: { depth: number; count: number }[];
}

export function Header({ root, totalChars, estimatedCredits, fileCount, depthDistribution }: Props) {
  const dotClass = langDotClass[root.language] || '';
  const langName = langDisplayName[root.language] || root.language;
  const creditClass = `p-stat-cr${estimatedCredits}`;

  const creditTooltip = estimatedCredits === 1 ? 'Under 2,000 chars — 1 credit'
    : estimatedCredits === 2 ? '2,000–8,000 chars — 2 credits'
    : 'Over 8,000 chars — 3 credits';

  const estimatedTokens = Math.ceil(totalChars / 4);
  const tokenDisplay = estimatedTokens >= 1000
    ? `~${(estimatedTokens / 1000).toFixed(1)}k tokens`
    : `~${estimatedTokens} tokens`;

  return (
    <div className="p-header">
      <div className="p-header-left">
        <div className="p-breadcrumb">
          <span className="p-breadcrumb-lang">
            <span className={`lang-dot ${dotClass}`} />
            <span>{langName}</span>
          </span>
          <span className="p-breadcrumb-sep">&#x203A;</span>
          <span className="p-breadcrumb-path" title={root.filePath}>{root.filePath}</span>
        </div>
        <div className="p-title">{root.symbolName || 'Copy4AI'}</div>
        {depthDistribution.length > 0 && (
          <div className="p-depth-bar" title="Dependency depth distribution">
            {depthDistribution.map(({ depth, count }) => (
              <div
                key={depth}
                className={`p-depth-bar-seg d${depth}`}
                style={{ flex: count }}
                title={`L${depth}: ${count} dep${count !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-header-right">
        <div className="p-stats">
          <span className="p-stat">
            {totalChars.toLocaleString()} chars
          </span>
          <span className="p-stat p-stat-tokens" title="Estimated tokens (chars / 4)">
            {tokenDisplay}
          </span>
          <span className={`p-stat ${creditClass}`} title={creditTooltip}>
            ~{estimatedCredits} credit{estimatedCredits !== 1 ? 's' : ''}
          </span>
          <span className="p-stat">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
