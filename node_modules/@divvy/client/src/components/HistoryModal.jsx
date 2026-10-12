import React from 'react';
import { formatCents } from '@divvy/shared';
import { CloseIcon, PlusIcon, TrashIcon } from './Icons';

export function HistoryModal({
  isOpen,
  onClose,
  divvys = [],
  currentDivvyId,
  onSelectDivvy,
  onStartNew,
  onDeleteDivvy,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🕒 Past Divvys History</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Your recent restaurant splits & events ({divvys.length})
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onStartNew();
                onClose();
              }}
            >
              <PlusIcon size={14} /> New Divvy
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', marginTop: '8px' }}>
            {divvys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                No past divvys found yet. Scan or create a new one!
              </div>
            ) : (
              divvys.map((d) => {
                const isCurrent = d.id === currentDivvyId;
                const statusBadgeClass =
                  d.status === 'closed'
                    ? 'badge-closed'
                    : d.status === 'complete'
                    ? 'badge-complete'
                    : 'badge-open';

                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: isCurrent ? 'rgba(242, 107, 91, 0.08)' : 'var(--bg-surface-elevated)',
                      border: isCurrent ? '1px solid var(--accent-coral)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => {
                      onSelectDivvy(d.id);
                      onClose();
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>{d.title || 'Untitled Divvy'}</span>
                        <span className={`badge ${statusBadgeClass}`}>
                          {d.status}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: '11px', color: 'var(--accent-coral)', fontWeight: 600 }}>
                            (Current)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {d.receiptDate || new Date(d.createdAt).toLocaleDateString()} • {d.parties?.length || 0} parties • {d.itemCount || 0} items
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px' }}>
                          {formatCents(d.totalCents || 0)}
                        </div>
                        {d.myShareCents > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--accent-teal)' }}>
                            Your share: {formatCents(d.myShareCents)}
                          </div>
                        )}
                      </div>

                      {onDeleteDivvy && (
                        <button
                          type="button"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${d.title}"?`)) onDeleteDivvy(d.id);
                          }}
                          title="Delete divvy"
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
