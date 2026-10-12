import React from 'react';
import { formatCents } from '@divvy/shared';
import { PlusIcon, TrashIcon } from './Icons';

export function PartiesList({
  parties = [],
  split,
  currentUser,
  onOpenAddParty,
  onSelectPartyForRemainder,
  onTogglePaid,
  onOpenPayment,
  onRemoveParty,
  readOnly = false,
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>
          <span>👥 Parties ({parties.length})</span>
        </h2>
        {!readOnly && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onOpenAddParty}
          >
            <PlusIcon size={14} /> Add Party
          </button>
        )}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Click any party to assign a share of the remaining amount (Rule 2).
      </div>

      <div className="parties-list">
        {parties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            No parties yet. Click "+ Add Party" to add people to this divvy!
          </div>
        ) : (
          parties.map((party) => {
            const partySplit = split?.parties?.[party.id];
            const totalOwedCents = partySplit?.totalCents || 0;
            const itemsCents = partySplit?.itemsCents || 0;
            const extrasCents = partySplit?.extrasCents || 0;
            const poolCents = partySplit?.poolCents || 0;
            const isPaid = !!party.paidAt || !!party.paid;

            return (
              <div
                key={party.id}
                className="party-row-card"
                onClick={() => !readOnly && onSelectPartyForRemainder(party)}
                style={{
                  borderLeft: `4px solid ${party.color || 'var(--accent-coral)'}`,
                  cursor: readOnly ? 'default' : 'pointer',
                }}
                title={readOnly ? undefined : `Click ${party.name} to assign share of remainder (Rule 2)`}
              >
                <div className="party-row-top">
                  <div className="party-identity">
                    <div
                      className="party-avatar-circle"
                      style={{ background: party.color || 'var(--accent-coral)' }}
                    >
                      {party.name ? party.name.slice(0, 2).toUpperCase() : 'P'}
                    </div>

                    <div className="party-name-group">
                      <div className="party-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{party.name}</span>
                        {(party.contactId === currentUser?.id ||
                          (currentUser?.name && party.name?.toLowerCase() === currentUser?.name?.toLowerCase())) && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(60, 198, 176, 0.2)',
                              color: 'var(--accent-teal)',
                              border: '1px solid rgba(60, 198, 176, 0.4)',
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                      <div className="party-contact-sub">
                        {party.phone || party.email || 'Group member'}
                      </div>
                    </div>
                  </div>

                  <div className="party-owed-group">
                    <div className="party-owed-amount">
                      {formatCents(totalOwedCents)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {itemsCents > 0 && `Items: ${formatCents(itemsCents)}`}
                      {extrasCents > 0 && ` • Tax/Tip: ${formatCents(extrasCents)}`}
                      {poolCents > 0 && ` • Pool: ${formatCents(poolCents)}`}
                      {totalOwedCents === 0 && 'No share yet'}
                    </div>
                  </div>
                </div>

                <div className="party-actions-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {!readOnly && (
                      <span style={{ fontSize: '12px', color: 'var(--accent-coral)', fontWeight: 600 }}>
                        ⚡ Click to assign remainder (Rule 2)
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {onOpenPayment && totalOwedCents > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPayment(party);
                        }}
                        title="Open payment links (Venmo, Cash App, PayPal)"
                      >
                        💳 Settle Up
                      </button>
                    )}

                    <button
                      type="button"
                      className={`pay-toggle-btn ${isPaid ? 'paid' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePaid(party.id, !isPaid);
                      }}
                      title={isPaid ? 'Click to mark as unpaid' : 'Click to mark as paid'}
                    >
                      {isPaid ? '✓ Paid' : '○ Mark Paid'}
                    </button>

                    {!readOnly && parties.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveParty(party.id);
                        }}
                        title="Remove party from divvy"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
