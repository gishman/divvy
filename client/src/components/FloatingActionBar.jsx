import React from 'react';
import { formatCents } from '@divvy/shared';

export function FloatingActionBar({
  selectedCount,
  selectedTotalCents,
  onOpenAssign,
  onClear,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="floating-action-bar" role="toolbar" aria-label="Selected Items Actions">
      <div className="selected-count">
        ✓ {selectedCount} {selectedCount === 1 ? 'item' : 'items'} ({formatCents(selectedTotalCents)})
        <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '13px' }}>
          • Click any party or item to assign
        </span>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onClear}
        style={{ color: 'var(--text-muted)' }}
      >
        Clear
      </button>
    </div>
  );
}
