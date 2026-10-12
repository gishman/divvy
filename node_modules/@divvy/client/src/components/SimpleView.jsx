import React from 'react';
import { formatCents } from '@divvy/shared';
import { PlusIcon, TrashIcon, CheckIcon } from './Icons';

export function SimpleView({
  divvy,
  split,
  currentUser,
  onAssignItem,
  onSelectPartyForRemainder,
  onTogglePaid,
  onOpenPayment,
  onOpenAddParty,
  onRemoveParty,
  onUpdateReceipt,
  readOnly = false,
}) {
  const items = divvy?.items || [];
  const adjustments = divvy?.adjustments || [];
  const parties = divvy?.parties || [];
  const partiesMap = new Map(parties.map((p) => [p.id, p]));

  const subtotalCents = split?.subtotalCents || items.reduce((sum, it) => sum + (it.priceCents || 0), 0);
  const taxAdj = adjustments.find((a) => a.kind === 'tax') || { kind: 'tax', label: 'Sales Tax', amountCents: 0 };
  const tipAdj = adjustments.find((a) => a.kind === 'tip') || { kind: 'tip', label: 'Tip / Gratuity', amountCents: 0 };
  const grandTotalCents = split?.totalCents || (subtotalCents + (taxAdj.amountCents || 0) + (tipAdj.amountCents || 0));
  const unassignedCents = split?.unassignedCents || 0;
  const isAllItemsCompleted = split?.unassignedItemsCents === 0;
  const isFullyComplete = unassignedCents === 0 && (grandTotalCents > 0);

  return (
    <div className="simple-view-container" style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      {/* Top Banner: Status & Quick Metric */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: isFullyComplete ? 'rgba(60, 198, 176, 0.12)' : 'rgba(245, 176, 76, 0.12)',
          border: isFullyComplete ? '1px solid var(--accent-teal)' : '1px solid var(--accent-amber)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{isFullyComplete ? '✅' : '⚡'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
              {isFullyComplete
                ? 'All Items & Remaining Balances Completed!'
                : `${formatCents(unassignedCents)} Remaining to Be Assigned`}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {isFullyComplete
                ? 'Every item on this receipt has been assigned to a party.'
                : 'Click any line item or party member below to assign the remaining balance.'}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Grand Total</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, color: '#fff' }}>
            {formatCents(grandTotalCents)}
          </div>
        </div>
      </div>

      {/* 1. THE RECEIPT SECTION */}
      <section className="card">
        <div className="card-header">
          <h2>
            <span>🧾 Receipt Summary</span>
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {divvy?.merchant || 'Restaurant'} • {divvy?.receiptDate || 'Today'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '16px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Items Subtotal</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
              {formatCents(subtotalCents)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sales Tax</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
              {formatCents(taxAdj.amountCents)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tip / Gratuity</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
              {formatCents(tipAdj.amountCents)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--accent-coral)', textTransform: 'uppercase', fontWeight: 700 }}>Total Due</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: 'var(--accent-coral)', marginTop: '2px' }}>
              {formatCents(grandTotalCents)}
            </div>
          </div>
        </div>
      </section>

      {/* 2. PARTY MEMBERS SECTION */}
      <section className="card">
        <div className="card-header">
          <h2>
            <span>👥 Party Members ({parties.length})</span>
          </h2>
          {!readOnly && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenAddParty}>
              <PlusIcon size={14} /> Add Member
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {parties.map((party) => {
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
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
                title={readOnly ? undefined : `Click ${party.name} to assign remaining amount`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      className="party-avatar-circle"
                      style={{ background: party.color || 'var(--accent-coral)', width: '36px', height: '36px' }}
                    >
                      {party.name ? party.name.slice(0, 2).toUpperCase() : 'P'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>{party.name}</span>
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
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {party.phone || party.email || 'Party member'}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 800 }}>
                      {formatCents(totalOwedCents)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Total share
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.02)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                  <div>Items: {formatCents(itemsCents)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    Tax/Tip: {formatCents(extrasCents)} {poolCents > 0 && `• Remainder: ${formatCents(poolCents)}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-coral)', fontWeight: 600 }}>
                    ⚡ Click to assign
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {onOpenPayment && totalOwedCents > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}
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
                    >
                      {isPaid ? '✓ Paid' : '○ Mark Paid'}
                    </button>
                    {!readOnly && parties.length > 1 && (
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveParty(party.id);
                        }}
                        title="Remove party"
                      >
                        <TrashIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. BELOW: ALL ITEMS COMPLETED SECTION */}
      <section className="card" style={{ border: isAllItemsCompleted ? '1px solid rgba(60, 198, 176, 0.4)' : undefined }}>
        <div className="card-header">
          <h2>
            <span>
              {isAllItemsCompleted ? '✅ All Items Completed' : '📋 Line Items & Completion Status'}
            </span>
          </h2>
          <span style={{ fontSize: '12px', color: isAllItemsCompleted ? 'var(--status-complete)' : 'var(--accent-amber)', fontWeight: 600 }}>
            {isAllItemsCompleted ? '100% of line items assigned ✓' : 'Click any item below to assign'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item) => {
            const itemSplit = split?.items?.[item.id];
            const unassignedItemCents = itemSplit?.unassignedCents ?? item.priceCents;
            const isCompleted = unassignedItemCents === 0;
            const itemAllocs = (divvy?.allocations || []).filter((a) => a.itemId === item.id);

            return (
              <div
                key={item.id}
                onClick={() => !readOnly && onAssignItem(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: isCompleted ? 'rgba(60, 198, 176, 0.05)' : 'var(--bg-surface-elevated)',
                  border: isCompleted ? '1px solid rgba(60, 198, 176, 0.25)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: readOnly ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={readOnly ? undefined : 'Click to re-assign or split this item'}
              >
                {/* Left: Item description and assignee badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: isCompleted ? 'rgba(60, 198, 176, 0.2)' : 'rgba(245, 176, 76, 0.2)',
                      color: isCompleted ? 'var(--status-complete)' : 'var(--accent-amber)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '14px',
                    }}
                  >
                    {isCompleted ? '✓' : '⚡'}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '15px' }}>{item.description || 'Line item'}</span>
                      {item.quantity > 1 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>x{item.quantity}</span>
                      )}
                    </div>

                    {/* Assigned Parties list */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {itemAllocs.length > 0 ? (
                        itemAllocs.map((a) => {
                          const party = partiesMap.get(a.partyId);
                          const cents = itemSplit?.allocations?.find((x) => x.id === a.id)?.cents || 0;
                          return (
                            <span
                              key={a.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${party?.color || 'var(--border-subtle)'}`,
                              }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: party?.color || '#fff' }} />
                              <strong>{party?.name || 'Party'}</strong>: {formatCents(cents)}
                              {a.mode === 'percent' && ` (${a.value}%)`}
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--accent-amber)', fontStyle: 'italic' }}>
                          Not yet assigned — click to assign
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Item Price and Completion Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px' }}>
                    {formatCents(item.priceCents)}
                  </div>

                  <div>
                    {isCompleted ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          background: 'rgba(60, 198, 176, 0.15)',
                          color: 'var(--status-complete)',
                          border: '1px solid rgba(60, 198, 176, 0.3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ Completed
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          background: 'rgba(245, 176, 76, 0.15)',
                          color: 'var(--accent-amber)',
                          border: '1px solid rgba(245, 176, 76, 0.3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ⚡ {formatCents(unassignedItemCents)} left
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
