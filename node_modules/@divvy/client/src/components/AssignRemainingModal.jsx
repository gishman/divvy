import React, { useState } from 'react';
import { formatCents, toCents } from '@divvy/shared';
import { CloseIcon } from './Icons';

export function AssignRemainingModal({
  isOpen,
  onClose,
  initialParty,
  parties = [],
  unassignedCents = 0,
  onConfirmAssign,
}) {
  const [selectedPartyId, setSelectedPartyId] = useState(initialParty?.id || parties[0]?.id || '');
  const [mode, setMode] = useState('amount'); // 'amount', 'percent', 'share'
  const [valueInput, setValueInput] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const currentParty = parties.find((p) => p.id === selectedPartyId) || initialParty;

  const handleQuickPercent = (pct) => {
    setMode('percent');
    setValueInput(String(pct));
  };

  const handleQuickAll = () => {
    setMode('amount');
    setValueInput((unassignedCents / 100).toFixed(2));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!selectedPartyId) {
      setError('Please select a party');
      return;
    }

    let allocValue = 0;
    if (mode === 'amount') {
      const cents = toCents(valueInput);
      if (!cents || cents <= 0) {
        setError('Please enter a valid dollar amount');
        return;
      }
      if (cents > unassignedCents) {
        setError(`Amount cannot exceed remaining unassigned ${formatCents(unassignedCents)}`);
        return;
      }
      allocValue = cents;
    } else if (mode === 'percent') {
      const pct = Number(valueInput);
      if (!pct || pct <= 0 || pct > 100) {
        setError('Percent must be between 1 and 100');
        return;
      }
      allocValue = pct;
    } else if (mode === 'share') {
      allocValue = 1;
    }

    onConfirmAssign([{
      partyId: selectedPartyId,
      itemId: null, // pool allocation!
      mode,
      value: allocValue,
    }]);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚡ Split Remaining Pool (Rule 2)</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px 18px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Remaining Unassigned Amount:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: 'var(--accent-amber)', marginTop: '4px' }}>
                {formatCents(unassignedCents)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Rule 2: Fixed $ amounts are taken out first, then percentages of whatever remains.
              </div>
            </div>

            {/* Select Party */}
            <div className="form-group">
              <label className="form-label">Assign to Party</label>
              <select
                className="form-input"
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode selection */}
            <div className="form-group">
              <label className="form-label">How should {currentParty?.name || 'this party'} pay?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn ${mode === 'amount' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setMode('amount')}
                >
                  $ Dollar Amount
                </button>
                <button
                  type="button"
                  className={`btn ${mode === 'percent' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setMode('percent')}
                >
                  % Percentage
                </button>
                <button
                  type="button"
                  className={`btn ${mode === 'share' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => { setMode('share'); setValueInput('1'); }}
                >
                  Even Pool Share
                </button>
              </div>
            </div>

            {/* Quick shortcuts */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleQuickAll}
                style={{ fontSize: '12px' }}
              >
                Pay All ({formatCents(unassignedCents)})
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickPercent(50)}
                style={{ fontSize: '12px' }}
              >
                Pay 50%
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickPercent(33.33)}
                style={{ fontSize: '12px' }}
              >
                Pay 1/3 (33%)
              </button>
            </div>

            {/* Value input */}
            {mode === 'amount' && (
              <div className="form-group">
                <label className="form-label">Dollar Amount ($)</label>
                <input
                  type="text"
                  className="form-input mono"
                  placeholder="0.00"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {mode === 'percent' && (
              <div className="form-group">
                <label className="form-label">Percentage (0 to 100%)</label>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="any"
                  className="form-input mono"
                  placeholder="50"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {mode === 'share' && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                This party will take 1 equal share of whatever remains in the unassigned pool.
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Assign Remainder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
