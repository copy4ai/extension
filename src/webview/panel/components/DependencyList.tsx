import React, { useEffect, useMemo, useState } from 'react';
import { Dependency } from '../types';
import { DependencyItem } from './DependencyItem';

const depthColors: Record<number, string> = {
  1: 'var(--depth-1)',
  2: 'var(--depth-2)',
  3: 'var(--depth-3)',
};
const depthLabels: Record<number, string> = {
  1: 'Level 1 \u2014 Direct',
  2: 'Level 2 \u2014 Transitive',
  3: 'Level 3 \u2014 Deep',
};

interface Props {
  dependencies: Dependency[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  initialCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  initialViewMode?: 'list' | 'tree';
  onViewModeChange?: (mode: 'list' | 'tree') => void;
  initialGroupBy?: 'depth' | 'file';
  onGroupByChange?: (groupBy: 'depth' | 'file') => void;
  onSelectPreset?: (preset: string) => void;
}

export function DependencyList({
  dependencies, selectedIds, onToggle, onSelectAll, onSelectNone,
  initialCollapsed, onCollapsedChange,
  initialViewMode, onViewModeChange,
  initialGroupBy, onGroupByChange,
  onSelectPreset,
}: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>(initialViewMode || 'list');
  const [groupBy, setGroupBy] = useState<'depth' | 'file'>(initialGroupBy || 'depth');

  useEffect(() => {
    setFilterText('');
  }, [dependencies]);

  const filteredDeps = useMemo(() => {
    if (!filterText) return dependencies;
    const lower = filterText.toLowerCase();
    return dependencies.filter(d =>
      d.symbolName.toLowerCase().includes(lower) ||
      d.filePath.toLowerCase().includes(lower)
    );
  }, [dependencies, filterText]);

  if (dependencies.length === 0) return (
    <div className="p-section">
      <div className="p-section-label">Dependencies</div>
      <div className="p-deps-empty">No external dependencies at this depth.</div>
    </div>
  );

  const selectedCount = dependencies.filter((d) =>
    selectedIds.has(d.filePath + ':' + d.symbolName)
  ).length;

  const handleToggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  };

  const handleViewModeToggle = () => {
    const next: 'list' | 'tree' = viewMode === 'list' ? 'tree' : 'list';
    setViewMode(next);
    onViewModeChange?.(next);
  };

  const handleGroupByToggle = () => {
    const next: 'depth' | 'file' = groupBy === 'depth' ? 'file' : 'depth';
    setGroupBy(next);
    onGroupByChange?.(next);
  };

  // Depth groups
  const depthGroups: Record<number, Dependency[]> = {};
  filteredDeps.forEach((d) => {
    if (!depthGroups[d.depth]) depthGroups[d.depth] = [];
    depthGroups[d.depth].push(d);
  });
  const hasMultipleDepths = Object.keys(depthGroups).length > 1;

  // File groups
  const fileGroups: Record<string, Dependency[]> = {};
  filteredDeps.forEach((d) => {
    const key = d.filePath;
    if (!fileGroups[key]) fileGroups[key] = [];
    fileGroups[key].push(d);
  });
  const hasMultipleFiles = Object.keys(fileGroups).length > 1;

  // Tree mode: sorted by depth then filePath
  const treeDeps = viewMode === 'tree'
    ? [...filteredDeps].sort((a, b) =>
        a.depth !== b.depth ? a.depth - b.depth : a.filePath.localeCompare(b.filePath)
      )
    : [];

  const showFilter = dependencies.length >= 5;
  const showPresets = dependencies.length >= 5;
  const hasCircular = dependencies.some(d => d.isCircular);

  const renderListContent = () => {
    if (groupBy === 'file' && hasMultipleFiles) {
      return (
        <ul className="p-dep-list">
          {Object.keys(fileGroups).sort().map((filePath) => {
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            return (
              <React.Fragment key={filePath}>
                <li className="p-dep-group-label">
                  <span className="p-dep-group-file-icon">&#x1F4C4;</span>
                  <span title={filePath}>{fileName}</span>
                  <span className="p-dep-group-file-count">{fileGroups[filePath].length}</span>
                </li>
                {fileGroups[filePath].map((dep) => (
                  <DependencyItem
                    key={dep.filePath + ':' + dep.symbolName}
                    dep={dep}
                    checked={selectedIds.has(dep.filePath + ':' + dep.symbolName)}
                    onChange={onToggle}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </ul>
      );
    }

    return (
      <ul className="p-dep-list">
        {Object.keys(depthGroups).sort().map((depthKey) => {
          const depth = Number(depthKey);
          return (
            <React.Fragment key={depth}>
              {hasMultipleDepths && (
                <li className="p-dep-group-label">
                  <span
                    className="p-dep-group-dot"
                    style={{ background: depthColors[depth] || depthColors[1] }}
                  />
                  {depthLabels[depth] || `Level ${depth}`}
                </li>
              )}
              {depthGroups[depth].map((dep) => (
                <DependencyItem
                  key={dep.filePath + ':' + dep.symbolName}
                  dep={dep}
                  checked={selectedIds.has(dep.filePath + ':' + dep.symbolName)}
                  onChange={onToggle}
                />
              ))}
            </React.Fragment>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="p-section">
      <div className="p-deps-header">
        <div className="p-deps-header-left">
          <button
            className={`p-deps-toggle${collapsed ? ' collapsed' : ''}`}
            onClick={handleToggleCollapsed}
          >
            &#x25BC;
          </button>
          <div className="p-section-label" style={{ marginBottom: 0 }}>Dependencies</div>
          <span className="p-deps-count">{dependencies.length}</span>
          <span className="p-deps-sel">{selectedCount}/{dependencies.length} selected</span>
        </div>
        <div className="p-deps-actions">
          <button
            className={`p-deps-view-toggle${viewMode === 'tree' ? ' active' : ''}`}
            onClick={handleViewModeToggle}
            title={viewMode === 'list' ? 'Switch to tree view' : 'Switch to list view'}
          >
            {viewMode === 'list' ? 'Tree' : 'List'}
          </button>
          {viewMode === 'list' && hasMultipleFiles && (
            <button
              className={`p-deps-view-toggle${groupBy === 'file' ? ' active' : ''}`}
              onClick={handleGroupByToggle}
              title={groupBy === 'depth' ? 'Group by file' : 'Group by depth'}
            >
              {groupBy === 'depth' ? 'File' : 'Depth'}
            </button>
          )}
          <button onClick={onSelectAll}>All</button>
          <button onClick={onSelectNone}>None</button>
        </div>
      </div>
      <div className={`p-deps-body${collapsed ? ' collapsed' : ''}`}>
        {showFilter && (
          <div className="p-deps-filter">
            <input
              className="p-deps-filter-input"
              type="text"
              placeholder="Filter dependencies..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <>
                <span className="p-deps-filter-count">{filteredDeps.length}/{dependencies.length}</span>
                <button className="p-deps-filter-clear" onClick={() => setFilterText('')}>&times;</button>
              </>
            )}
          </div>
        )}
        {showPresets && (
          <div className="p-deps-presets">
            <button onClick={() => onSelectPreset?.('types')} title="Select only types (starts with uppercase)">Types</button>
            <button onClick={() => onSelectPreset?.('functions')} title="Select only functions (starts with lowercase)">Fns</button>
            {hasCircular && (
              <button onClick={() => onSelectPreset?.('no-circular')} title="Deselect circular dependencies">No circular</button>
            )}
            <button onClick={() => onSelectPreset?.('small')} title="Select only deps under 1,000 chars">&lt; 1k</button>
          </div>
        )}
        {filteredDeps.length === 0 && filterText ? (
          <div className="p-deps-empty">No matches for &ldquo;{filterText}&rdquo;</div>
        ) : viewMode === 'tree' ? (
          <ul className="p-dep-list">
            {treeDeps.map((dep) => (
              <DependencyItem
                key={dep.filePath + ':' + dep.symbolName}
                dep={dep}
                checked={selectedIds.has(dep.filePath + ':' + dep.symbolName)}
                onChange={onToggle}
                indent={dep.depth - 1}
              />
            ))}
          </ul>
        ) : (
          renderListContent()
        )}
      </div>
    </div>
  );
}
