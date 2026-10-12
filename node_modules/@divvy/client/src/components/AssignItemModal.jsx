import React, { useState } from 'react';
import { formatCents, toCents } from '@divvy/shared';
import { CloseIcon } from './Icons';

export function AssignItemModal({
  isOpen,
  onClose,
  selectedItems = [],
  parties = [],
  initialParty,
  onConfirmAssign,
}) {
  const [targetPartyId, setTargetPartyId] = useState(initialParty?.id || parties[0]?.id || '');
  const [splitMode, setSplitMode] = useState('full'); // 'full' (100%), 'percent', 'amount', 'equal-selected'
  const [customValue, setCustomValue] = useState('');
  const [selectedPartyIdsForShare, setSelectedPartyIdsForShare] = useState(new Set(parties.map((p) => p.id)));
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (initialParty?.id) {
      setTargetPartyId(initialParty.id);
    } else if (parties.length > 0) {
      setTargetPartyId(parties[0].id);
    }
  }, [initialParty, parties, isOpen]);

  if (!isOpen || selectedItems.length === 0) return null;

  const totalCents = selectedItems.reduce((sum, it) => sum + (it.priceCents || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const allocations = [];

    for (const item of selectedItems) {
      if (splitMode === 'full') {
        allocations.push({
          itemId: item.id,
          partyId: targetPartyId,
          mode: 'percent',
          value: 100,
        });
      } else if (splitMode === 'percent') {
        const pct = Number(customValue);
        if (!pct || pct <= 0 || pct > 100) {
          setError('Percentage must be between 1 and 100');
          return;
        }
        allocations.push({
          itemId: item.id,
          partyId: targetPartyId,
          mode: 'percent',
          value: pct,
        });
      } else if (splitMode === 'amount') {
        const cents = toCents(customValue);
        if (!cents || cents <= 0) {
          setError('Please enter a valid dollar amount');
          return;
        }
        // If multiple items selected with fixed amount, divide evenly or apply
        const perItemCents = Math.round(cents / selectedItems.length);
        allocations.push({
          itemId: item.id,
          partyId: targetPartyId,
          mode: 'amount',
          value: perItemCents,
        });
      } else if (splitMode === 'equal-selected') {
        const pids = Array.from(selectedPartyIdsForShare);
        if (pids.length === 0) {
          setError('Select at least one party to share with');
          return;
        }
        for (const pid of pids) {
          allocations.push({
            itemId: item.id,
            partyId: pid,
            mode: 'share',
            value: 1,
          });
        }
      }
    }

    onConfirmAssign(allocations);
    onClose();
  };

  const togglePartyForShare = (pid) => {
    const next = new Set(selectedPartyIdsForShare);
    if (next.has(pid)) {
      if (next.size > 1) next.delete(pid);
    } else {
      next.add(pid);
    }
    setSelectedPartyIdsForShare(next);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚡ Assign Line Items (Rule 1)</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Selected ({selectedItems.length} items):</div>
              <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '2px' }}>
                {selectedItems.map((it) => it.description || 'Item').join(', ')}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-coral)', fontWeight: 700, marginTop: '4px' }}>
                Total: {formatCents(totalCents)}
              </div>
            </div>

            {/* Split Mode Options */}
            <div className="form-group">
              <label className="form-label">How would you like to assign?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn ${splitMode === 'full' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setSplitMode('full')}
                >
                  Entire Item (100%)
                </button>
                <button
                  type="button"
                  className={`btn ${splitMode === 'percent' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setSplitMode('percent')}
                >
                  % of Item Price
                </button>
                <button
                  type="button"
                  className={`btn ${splitMode === 'amount' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setSplitMode('amount')}
                >
                  Fixed $ Amount
                </button>
                <button
                  type="button"
                  className={`btn ${splitMode === 'equal-selected' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setSplitMode('equal-selected')}
                >
                  Split Evenly (50/50 etc)
                </button>
              </div>
            </div>

            {/* Target party (for full, percent, amount) */}
            {splitMode !== 'equal-selected' ? (
              <div className="form-group">
                <label className="form-label">Assign to Party</label>
                <select
                  className="form-input"
                  value={targetPartyId}
                  onChange={(e) => setTargetPartyId(e.target.value)}
                >
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Select parties to split evenly across:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {parties.map((p) => {
                    const isChecked = selectedPartyIdsForShare.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePartyForShare(p.id)}
                        className={`btn ${isChecked ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || '#fff' }} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom input for % or $ */}
            {splitMode === 'percent' && (
              <div className="form-group">
                <label className="form-label">Enter percentage (e.g. 50 for 50%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="any"
                  className="form-input mono"
                  placeholder="50"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {splitMode === 'amount' && (
              <div className="form-group">
                <label className="form-label">Enter dollar amount (e.g. 15.50)</label>
                <input
                  type="text"
                  className="form-input mono"
                  placeholder="15.50"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
