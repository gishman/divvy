import React, { useState } from 'react';
import { formatCents, toCents } from '@divvy/shared';
import { PlusIcon, TrashIcon } from './Icons';

export function ReceiptView({
  divvy,
  split,
  selectedItemIds,
  onToggleSelectItem,
  onSelectAllItems,
  onClearSelection,
  onAssignItem,
  onUpdateReceipt,
  onDeleteAllocation,
  readOnly = false,
}) {
  const [editingItem, setEditingItem] = useState(null); // { id, description, price, quantity }
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  const items = divvy?.items || [];
  const adjustments = divvy?.adjustments || [];
  const partiesMap = new Map((divvy?.parties || []).map((p) => [p.id, p]));

  // Find tax, tip, fees from adjustments
  const taxAdj = adjustments.find((a) => a.kind === 'tax') || { kind: 'tax', label: 'Sales Tax', amountCents: 0 };
  const tipAdj = adjustments.find((a) => a.kind === 'tip') || { kind: 'tip', label: 'Tip / Gratuity', amountCents: 0 };
  const feeAdjs = adjustments.filter((a) => a.kind !== 'tax' && a.kind !== 'tip');

  // Subtotal in cents
  const subtotalCents = split?.subtotalCents || items.reduce((sum, it) => sum + (it.priceCents || 0), 0);
  const grandTotalCents = split?.totalCents || (subtotalCents + (taxAdj.amountCents || 0) + (tipAdj.amountCents || 0));

  // Quick Tip calculations
  const calculateTipForPercent = (pct) => {
    return Math.round((subtotalCents * pct) / 100);
  };

  const handleSetTipPercent = (pct) => {
    if (readOnly) return;
    const cents = calculateTipForPercent(pct);
    updateAdjustment('tip', 'Tip / Gratuity', cents);
  };

  const updateAdjustment = (kind, label, cents) => {
    const existing = adjustments.find((a) => a.kind === kind);
    let nextAdjs;
    if (existing) {
      nextAdjs = adjustments.map((a) => (a.kind === kind ? { ...a, amountCents: cents } : a));
    } else {
      nextAdjs = [...adjustments, { kind, label, amountCents: cents }];
    }
    onUpdateReceipt({ adjustments: nextAdjs });
  };

  const handleSaveItemEdit = (item) => {
    const updatedItems = items.map((it) => {
      if (it.id === item.id) {
        return {
          ...it,
          description: editingItem.description.trim() || it.description,
          priceCents: toCents(editingItem.price) || it.priceCents,
        };
      }
      return it;
    });
    onUpdateReceipt({ items: updatedItems });
    setEditingItem(null);
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItemDesc.trim()) return;
    const priceCents = toCents(newItemPrice);
    const newItem = {
      description: newItemDesc.trim(),
      priceCents,
      quantity: 1,
    };
    onUpdateReceipt({ items: [...items, newItem] });
    setNewItemDesc('');
    setNewItemPrice('');
    setIsAddingItem(false);
  };

  const handleDeleteItem = (itemId) => {
    if (confirm('Remove this line item? Any assignments for it will be removed.')) {
      onUpdateReceipt({ items: items.filter((it) => it.id !== itemId) });
    }
  };

  const allSelected = items.length > 0 && items.every((it) => selectedItemIds.has(it.id));

  return (
    <div className="receipt-card card">
      <div className="card-header">
        <h2>
          <span>🧾 Receipt Breakdown</span>
        </h2>
        {items.length > 0 && !readOnly && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={allSelected ? onClearSelection : onSelectAllItems}
          >
            {allSelected ? 'Deselect All' : 'Select All Items'}
          </button>
        )}
      </div>

      {/* SECTION 1: LINE ITEMS */}
      <div className="receipt-section-title">
        <span>1. Line Items ({items.length})</span>
        <span style={{ fontSize: '11px', textTransform: 'none', color: 'var(--accent-coral)', fontWeight: 600 }}>
          ⚡ Click any item to assign (Rule 1)
        </span>
      </div>

      <div className="receipt-items-list">
        {items.map((item) => {
          const isSelected = selectedItemIds.has(item.id);
          const isEditing = editingItem?.id === item.id;
          const itemSplit = split?.items?.[item.id];
          const unassignedItemCents = itemSplit?.unassignedCents ?? item.priceCents;
          const isFullyAssigned = unassignedItemCents === 0;

          // Find allocations on this item
          const itemAllocs = (divvy?.allocations || []).filter((a) => a.itemId === item.id);

          return (
            <div
              key={item.id}
              className={`receipt-item-row ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                if (!readOnly && !isEditing) onAssignItem(item);
              }}
              style={{ cursor: readOnly ? 'default' : 'pointer' }}
              title={readOnly ? undefined : 'Click this item to assign it to a party'}
            >
              <input
                type="checkbox"
                className="item-select-checkbox"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelectItem(item.id)}
                disabled={readOnly}
                aria-label={`Select ${item.description}`}
              />

              <div className="item-desc-cell" onClick={(e) => isEditing && e.stopPropagation()}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '4px 8px', fontSize: '14px' }}
                      value={editingItem.description}
                      onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                      autoFocus
                    />
                    <input
                      type="text"
                      className="form-input mono"
                      style={{ padding: '4px 8px', fontSize: '14px', width: '90px' }}
                      value={editingItem.price}
                      onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSaveItemEdit(item)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingItem(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="item-desc-text">
                        {item.description || 'Untitled item'}
                      </span>
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '2px 4px', fontSize: '11px', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem({ id: item.id, description: item.description, price: (item.priceCents / 100).toFixed(2) });
                          }}
                          title="Edit item name or price"
                        >
                          ✎
                        </button>
                      )}
                    </div>

                    {/* Assigned Parties Chips */}
                    {itemAllocs.length > 0 && (
                      <div className="item-assignees-bar">
                        {itemAllocs.map((a) => {
                          const party = partiesMap.get(a.partyId);
                          const cents = itemSplit?.allocations?.find((x) => x.id === a.id)?.cents || 0;
                          return (
                            <span key={a.id} className="assignee-chip" style={{ borderColor: party?.color ? `${party.color}44` : undefined }}>
                              <span
                                className="chip-dot"
                                style={{ background: party?.color || 'var(--accent-coral)' }}
                              />
                              <span>
                                {party?.name || 'Party'}: {formatCents(cents)}
                                {a.mode === 'percent' && ` (${a.value}%)`}
                              </span>
                              {!readOnly && (
                                <span
                                  className="chip-remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteAllocation(a.id);
                                  }}
                                  title="Remove assignment"
                                >
                                  ×
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="item-price-cell">
                {formatCents(item.priceCents)}
              </div>

              <div className="item-status-cell">
                {isFullyAssigned ? (
                  <span style={{ fontSize: '11px', color: 'var(--status-complete)', fontWeight: 600 }}>
                    Assigned ✓
                  </span>
                ) : (
                  <span className="unassigned-mini-badge">
                    ⚡ {formatCents(unassignedItemCents)} left
                  </span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    title="Delete item"
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Item Row */}
        {!readOnly && (
          isAddingItem ? (
            <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <input
                type="text"
                placeholder="Item description (e.g. Garlic Noodles)"
                className="form-input"
                style={{ flex: 1 }}
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                autoFocus
                required
              />
              <input
                type="text"
                placeholder="Price ($0.00)"
                className="form-input mono"
                style={{ width: '110px' }}
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm">Add</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsAddingItem(false)}>Cancel</button>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'flex-start', marginTop: '8px' }}
              onClick={() => setIsAddingItem(true)}
            >
              <PlusIcon size={14} /> Add Line Item
            </button>
          )
        )}
      </div>

      {/* SECTION 2: SUBTOTAL, TAXES, TIP */}
      <div className="receipt-section-title" style={{ marginTop: '16px' }}>
        <span>2. Subtotal, Taxes & Tip</span>
      </div>

      <div className="receipt-adjustments-card">
        <div className="adjustment-row">
          <span className="label">Items Subtotal</span>
          <span className="value">{formatCents(subtotalCents)}</span>
        </div>

        {/* Tax */}
        <div className="adjustment-row">
          <span className="label">Sales Tax</span>
          {readOnly ? (
            <span className="value">{formatCents(taxAdj.amountCents)}</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="text"
                className="form-input mono"
                style={{ width: '90px', padding: '4px 8px', textAlign: 'right' }}
                value={(taxAdj.amountCents / 100).toFixed(2)}
                onChange={(e) => updateAdjustment('tax', 'Sales Tax', toCents(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Tip */}
        <div className="adjustment-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <span className="label">Tip / Gratuity</span>
            {!readOnly && (
              <div className="tip-selector-row">
                {[15, 18, 20, 25].map((pct) => {
                  const targetCents = calculateTipForPercent(pct);
                  const isCurrent = Math.abs(tipAdj.amountCents - targetCents) < 2;
                  return (
                    <button
                      key={pct}
                      type="button"
                      className={`tip-chip ${isCurrent ? 'active' : ''}`}
                      onClick={() => handleSetTipPercent(pct)}
                    >
                      {pct}% ({formatCents(targetCents)})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {readOnly ? (
            <span className="value">{formatCents(tipAdj.amountCents)}</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="text"
                className="form-input mono"
                style={{ width: '90px', padding: '4px 8px', textAlign: 'right' }}
                value={(tipAdj.amountCents / 100).toFixed(2)}
                onChange={(e) => updateAdjustment('tip', 'Tip / Gratuity', toCents(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Extra fees if any */}
        {feeAdjs.map((adj) => (
          <div key={adj.id || adj.label} className="adjustment-row">
            <span className="label">{adj.label || adj.kind}</span>
            <span className="value">{formatCents(adj.amountCents)}</span>
          </div>
        ))}
      </div>

      {/* SECTION 3: GRAND TOTAL */}
      <div className="receipt-section-title" style={{ marginTop: '16px' }}>
        <span>3. Final (Grand Total)</span>
      </div>

      <div className="receipt-grand-total-banner">
        <div>
          <div className="grand-total-label">Grand Total Due</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Pre-tax subtotal + taxes + tips
          </div>
        </div>
        <div className="grand-total-amount">
          {formatCents(grandTotalCents)}
        </div>
      </div>
    </div>
  );
}
