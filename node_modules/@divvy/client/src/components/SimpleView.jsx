import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { formatCents, toCents, parseReceiptText } from '@divvy/shared';
import { api } from '../api';
import { PlusIcon, TrashIcon, ScanIcon } from './Icons';

/**
 * Controlled currency input that preserves smooth typing (decimals, backspaces)
 * while focused, and syncs cents immediately on change & blur.
 */
function EditableMoneyInput({
  cents,
  onChangeCents,
  disabled = false,
  placeholder = '0.00',
  style = {},
  className = 'form-input mono',
  ariaLabel,
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => ((cents || 0) / 100).toFixed(2));

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}>
      <span
        style={{
          position: 'absolute',
          left: '10px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          pointerEvents: 'none',
        }}
      >
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
        placeholder={placeholder}
        value={focused ? draft : ((cents || 0) / 100).toFixed(2)}
        onFocus={(e) => {
          setFocused(true);
          setDraft(((cents || 0) / 100).toFixed(2));
          e.target.select();
        }}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(val);
          const parsed = toCents(val);
          if (Number.isFinite(parsed) && parsed >= 0) {
            onChangeCents(parsed);
          }
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = toCents(draft);
          const finalCents = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          onChangeCents(finalCents);
          setDraft((finalCents / 100).toFixed(2));
        }}
        style={{
          paddingLeft: '22px',
          paddingRight: '10px',
          paddingTop: '7px',
          paddingBottom: '7px',
          textAlign: 'right',
          fontSize: '14px',
          fontWeight: 700,
          width: '100%',
        }}
      />
    </div>
  );
}

export function SimpleView({
  divvy,
  split,
  onTogglePaid,
  onOpenPayment,
  onUpdateParty,
  onRemoveParty,
  onSetPartyCount,
  onUpdateReceipt,
  onSetItemParties,
  onClearAllAllocations,
  readOnly = false,
}) {
  // 3 Wizard Steps: 0 = Receipt, 1 = Parties, 2 = Split & Drag-and-Drop
  const [step, setStep] = useState(0);

  // Setting: "parties can be dragged to item price/cost in settings . default to no"
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragPartiesToPrice, setDragPartiesToPrice] = useState(() => {
    try {
      return localStorage.getItem('divvy_simple_drag_party_to_price') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleDragPartyToPrice = (nextVal) => {
    setDragPartiesToPrice(nextVal);
    try {
      localStorage.setItem('divvy_simple_drag_party_to_price', String(nextVal));
    } catch {
      // ignore storage errors
    }
  };

  // Setting: Drag visual appearance ('opaque' | 'outline', defaults to 'opaque')
  const [dragBoxStyle, setDragBoxStyle] = useState(() => {
    try {
      return localStorage.getItem('divvy_simple_drag_box_style') || 'opaque';
    } catch {
      return 'opaque';
    }
  });

  const handleSetDragBoxStyle = (style) => {
    setDragBoxStyle(style);
    try {
      localStorage.setItem('divvy_simple_drag_box_style', style);
    } catch {
      // ignore storage errors
    }
  };

  // Inline Receipt OCR Scanner state on Step 1
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Editable # of items input state
  const items = divvy?.items || [];
  const adjustments = divvy?.adjustments || [];
  const parties = divvy?.parties || [];
  const allocations = divvy?.allocations || [];
  const partiesMap = new Map(parties.map((p) => [p.id, p]));

  const [itemCountDraft, setItemCountDraft] = useState(String(items.length));
  const [itemCountFocused, setItemCountFocused] = useState(false);

  // Progressive disclosure state for party email / phone fields
  // Maps partyId -> { email: boolean, phone: boolean }
  const [contactFieldsShown, setContactFieldsShown] = useState({});

  // Drag & Drop + Touch/Tap state for Step 3
  const [draggingItemId, setDraggingItemId] = useState(null);
  const [draggingPartyId, setDraggingPartyId] = useState(null);
  const [dragOverPartyId, setDragOverPartyId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [dragBox, setDragBox] = useState(null); // { type: 'item'|'party', id, x, y, width }
  const [activeTapItemId, setActiveTapItemId] = useState(null);
  const [activeTapPartyId, setActiveTapPartyId] = useState(null);
  const suppressNextClickRef = useRef(false);

  // Swipe gesture tracking (touch & pointer)
  const swipeStartRef = useRef({ x: 0, y: 0, time: 0, isInput: false });

  const goToStep = (nextStep) => {
    const clamped = Math.max(0, Math.min(2, nextStep));
    setStep(clamped);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTouchStartContainer = (e) => {
    const tag = e.target?.tagName?.toLowerCase();
    const isDraggableOrInput =
      tag === 'input' ||
      tag === 'button' ||
      tag === 'textarea' ||
      Boolean(e.target?.closest('[data-draggable="true"]'));
    const touch = e.touches?.[0];
    if (!touch) return;
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      isInput: isDraggableOrInput,
    };
  };

  const handleTouchEndContainer = (e) => {
    if (swipeStartRef.current.isInput) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    const dt = Date.now() - swipeStartRef.current.time;

    // Horizontal swipe: fast enough, predominantly horizontal, at least 65px
    if (dt < 600 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      if (dx < 0 && step < 2) {
        goToStep(step + 1);
      } else if (dx > 0 && step > 0) {
        goToStep(step - 1);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 1: RECEIPT HELPERS
  // ---------------------------------------------------------------------------
  const subtotalCents = items.reduce((sum, it) => sum + (Math.round(Number(it.priceCents)) || 0), 0);

  // Tax adjustment
  const taxAdj = adjustments.find((a) => a.kind === 'tax') || {
    id: 'adj_tax',
    kind: 'tax',
    label: 'Tax',
    amountCents: 0,
  };

  // Tip / Misc adjustment (combines non-tax adjustments or uses tip/misc)
  const tipMiscCents = adjustments
    .filter((a) => a.kind !== 'tax')
    .reduce((sum, a) => sum + (Math.round(Number(a.amountCents)) || 0), 0);

  const grandTotalCents = subtotalCents + (taxAdj.amountCents || 0) + tipMiscCents;

  const handleSetItemCount = (targetCount) => {
    const count = Math.max(0, Math.min(100, Math.round(Number(targetCount) || 0)));
    if (count === items.length) return;

    let nextItems;
    if (count > items.length) {
      const added = Array.from({ length: count - items.length }, (_, idx) => ({
        id: `item_${Date.now()}_${items.length + idx + 1}`,
        description: `Item ${items.length + idx + 1}`,
        quantity: 1,
        priceCents: 0,
      }));
      nextItems = [...items, ...added];
    } else {
      nextItems = items.slice(0, count);
    }
    onUpdateReceipt({ items: nextItems, adjustments });
  };

  const handleUpdateLineItem = (index, patch) => {
    const nextItems = items.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
    onUpdateReceipt({ items: nextItems, adjustments });
  };

  const handleDeleteLineItem = (index) => {
    const nextItems = items.filter((_, idx) => idx !== index);
    onUpdateReceipt({ items: nextItems, adjustments });
  };

  const handleAddLineItem = () => {
    const nextItems = [
      ...items,
      {
        id: `item_${Date.now()}_${items.length + 1}`,
        description: `Item ${items.length + 1}`,
        quantity: 1,
        priceCents: 0,
      },
    ];
    onUpdateReceipt({ items: nextItems, adjustments });
  };

  const handleUpdateTax = (cents) => {
    const otherAdjs = adjustments.filter((a) => a.kind !== 'tax');
    const nextAdjs = [
      { id: taxAdj.id || 'adj_tax', kind: 'tax', label: 'Tax', amountCents: cents },
      ...otherAdjs,
    ];
    onUpdateReceipt({ items, adjustments: nextAdjs });
  };

  const handleUpdateTipMisc = (cents) => {
    const existingTip = adjustments.find((a) => a.kind !== 'tax');
    const nextAdjs = [
      { id: taxAdj.id || 'adj_tax', kind: 'tax', label: 'Tax', amountCents: taxAdj.amountCents || 0 },
      {
        id: existingTip?.id || 'adj_tip_misc',
        kind: 'tip',
        label: 'Tip / Misc',
        amountCents: cents,
      },
    ];
    onUpdateReceipt({ items, adjustments: nextAdjs });
  };

  // Inline Receipt OCR Scan
  const handleScanFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setScanning(true);
    setScanProgress(10);
    setScanStatus('Reading receipt image...');

    let parsed = null;
    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.round((m.progress || 0) * 80) + 15);
            setScanStatus(`Scanning receipt... ${Math.round((m.progress || 0) * 100)}%`);
          }
        },
      });
      const ret = await worker.recognize(file);
      await worker.terminate();
      parsed = parseReceiptText(ret?.data?.text || '');
    } catch {
      try {
        setScanStatus('Trying server OCR...');
        const res = await api.ocr.scanServer(file);
        parsed = res.parsed || parseReceiptText(res.text || '');
      } catch {
        setScanning(false);
        setScanStatus('');
        return;
      }
    }

    const scannedItems = (parsed?.items || []).map((it, idx) => ({
      id: `item_${Date.now()}_${idx}`,
      description: it.description || `Item ${idx + 1}`,
      quantity: it.quantity || 1,
      priceCents: it.priceCents || 0,
    }));

    const scannedAdjs = (parsed?.adjustments || []).map((adj, idx) => ({
      id: `adj_${Date.now()}_${idx}`,
      kind: adj.kind === 'tax' ? 'tax' : 'tip',
      label: adj.kind === 'tax' ? 'Tax' : 'Tip / Misc',
      amountCents: adj.amountCents || 0,
    }));

    onUpdateReceipt({
      title: parsed?.merchant ? `${parsed.merchant}` : divvy?.title,
      merchant: parsed?.merchant || divvy?.merchant,
      items: scannedItems.length > 0 ? scannedItems : items,
      adjustments: scannedAdjs.length > 0 ? scannedAdjs : adjustments,
    });

    setScanning(false);
    setScanProgress(100);
    setScanStatus('');
  };

  // ---------------------------------------------------------------------------
  // STEP 2: PARTIES HELPERS
  // ---------------------------------------------------------------------------
  const isFieldShown = (party, field) => {
    if (contactFieldsShown[party.id]?.[field] !== undefined) {
      return contactFieldsShown[party.id][field];
    }
    return Boolean(party[field] && String(party[field]).trim());
  };

  const showContactField = (partyId, field, visible = true) => {
    setContactFieldsShown((prev) => ({
      ...prev,
      [partyId]: {
        ...(prev[partyId] || {}),
        [field]: visible,
      },
    }));
  };

  // ---------------------------------------------------------------------------
  // STEP 3: DRAG & DROP HELPERS (100% -> 50% -> 33.3% ...)
  // ---------------------------------------------------------------------------
  const getAssignedPartyIdsForItem = (itemId) => {
    const itemAllocs = allocations.filter((a) => a.itemId === itemId);
    const seen = new Set();
    const list = [];
    for (const a of itemAllocs) {
      if (!seen.has(a.partyId) && partiesMap.has(a.partyId)) {
        seen.add(a.partyId);
        list.push(a.partyId);
      }
    }
    return list;
  };

  const assignPartyToItemEqualShare = (itemId, partyId) => {
    if (!itemId || !partyId || readOnly) return;
    const currentPartyIds = getAssignedPartyIdsForItem(itemId);
    if (currentPartyIds.includes(partyId)) {
      // Already assigned to this item — keep existing or no-op
      return;
    }
    const nextPartyIds = [...currentPartyIds, partyId];
    onSetItemParties(itemId, nextPartyIds);
  };

  const removePartyFromItemEqualShare = (itemId, partyId) => {
    if (!itemId || !partyId || readOnly) return;
    const currentPartyIds = getAssignedPartyIdsForItem(itemId);
    const nextPartyIds = currentPartyIds.filter((id) => id !== partyId);
    onSetItemParties(itemId, nextPartyIds);
  };

  // Pointer-based drag (mouse, trackpad, touch) with a 100% opaque floating box
  const startPointerDrag = (e, type, id) => {
    if (readOnly) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target?.closest?.('button, input, a, textarea')) return;

    const cardEl = e.currentTarget;
    const rect = cardEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const width = Math.min(Math.max(rect.width, 250), 380);
    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;
    let currentHoveredPartyId = null;
    let currentHoveredItemId = null;

    const handlePointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!isDragging) {
        if (Math.hypot(dx, dy) < 5) return;
        isDragging = true;
        suppressNextClickRef.current = true;
        if (type === 'item') setDraggingItemId(id);
        else setDraggingPartyId(id);
      }

      setDragBox({
        type,
        id,
        x: moveEvent.clientX - offsetX,
        y: moveEvent.clientY - offsetY,
        width,
      });

      const elUnder = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      if (type === 'item') {
        const partyEl = elUnder?.closest?.('[data-drop-party-id]');
        const pid = partyEl ? partyEl.getAttribute('data-drop-party-id') : null;
        currentHoveredPartyId = pid;
        setDragOverPartyId(pid);
      } else if (type === 'party') {
        const itemEl = elUnder?.closest?.('[data-drop-item-id]');
        const iid = itemEl ? itemEl.getAttribute('data-drop-item-id') : null;
        currentHoveredItemId = iid;
        setDragOverItemId(iid);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (isDragging) {
        if (type === 'item' && currentHoveredPartyId) {
          assignPartyToItemEqualShare(id, currentHoveredPartyId);
        } else if (type === 'party' && currentHoveredItemId) {
          assignPartyToItemEqualShare(currentHoveredItemId, id);
        }
        setDraggingItemId(null);
        setDraggingPartyId(null);
        setDragOverPartyId(null);
        setDragOverItemId(null);
        setDragBox(null);
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const unassignedCents = split?.unassignedCents || 0;
  const isAllAssigned = unassignedCents === 0 && grandTotalCents > 0;

  return (
    <div
      className="simple-wizard-container"
      onTouchStart={handleTouchStartContainer}
      onTouchEnd={handleTouchEndContainer}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '920px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* STEPPER HEADER (Tap or Swipe between steps) */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '280px' }}>
          {[
            { idx: 0, label: '1. Receipt', sub: `${items.length} items • ${formatCents(grandTotalCents)}` },
            { idx: 1, label: '2. Parties', sub: `${parties.length} paying` },
            {
              idx: 2,
              label: '3. Split Items',
              sub: isAllAssigned ? '100% assigned ✓' : `${formatCents(unassignedCents)} left`,
            },
          ].map((s, i) => {
            const active = step === s.idx;
            const done = step > s.idx || (s.idx === 2 && isAllAssigned);
            return (
              <React.Fragment key={s.idx}>
                <button
                  type="button"
                  onClick={() => goToStep(s.idx)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: active
                      ? '1px solid var(--accent-coral)'
                      : done
                      ? '1px solid rgba(60, 198, 176, 0.35)'
                      : '1px solid var(--border-subtle)',
                    background: active
                      ? 'rgba(242, 107, 91, 0.14)'
                      : done
                      ? 'rgba(60, 198, 176, 0.08)'
                      : 'var(--bg-surface-elevated)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: active ? 'var(--accent-coral)' : done ? 'var(--accent-teal)' : 'var(--text-primary)',
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.sub}</span>
                </button>
                {i < 2 && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '14px' }}>→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
          Swipe left/right or use Next →
        </div>
      </div>

      {/* =====================================================================
          STEP 1: SCAN & EDIT RECEIPT ON ONE PAGE
          ===================================================================== */}
      {step === 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Row: Scan Receipt & Merchant Title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧾 Receipt Details
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Scan a receipt or edit any field marked <span style={{ color: 'var(--accent-coral)' }}>(e)</span> directly below.
              </p>
            </div>

            {!readOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleScanFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={scanning}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ScanIcon size={16} />
                  {scanning ? `Scanning (${scanProgress}%)...` : 'Scan Receipt Photo'}
                </button>
              </div>
            )}
          </div>

          {scanning && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--accent-coral)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{scanStatus || 'Scanning receipt...'}</div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--bg-surface)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginTop: '8px',
                }}
              >
                <div
                  style={{
                    width: `${scanProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent-coral), var(--accent-amber))',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* ROW 1: # of items (e) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                # of Items <span style={{ fontSize: '11px', color: 'var(--accent-coral)', fontWeight: 600 }}>(editable)</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Adjust count to automatically add or trim line item rows
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={readOnly || items.length <= 0}
                onClick={() => handleSetItemCount(items.length - 1)}
                style={{ width: '34px', height: '34px', padding: 0, fontSize: '18px', fontWeight: 800 }}
                title="Decrease item count"
              >
                −
              </button>
              <input
                type="number"
                min="0"
                max="100"
                disabled={readOnly}
                aria-label="Number of items"
                className="form-input mono"
                value={itemCountFocused ? itemCountDraft : String(items.length)}
                onFocus={(e) => {
                  setItemCountFocused(true);
                  setItemCountDraft(String(items.length));
                  e.target.select();
                }}
                onChange={(e) => {
                  setItemCountDraft(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (Number.isFinite(val) && val >= 0 && val <= 100) {
                    handleSetItemCount(val);
                  }
                }}
                onBlur={() => {
                  setItemCountFocused(false);
                  const val = parseInt(itemCountDraft, 10);
                  if (Number.isFinite(val) && val >= 0) {
                    handleSetItemCount(val);
                  } else {
                    setItemCountDraft(String(items.length));
                  }
                }}
                style={{
                  width: '68px',
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '16px',
                  padding: '6px 8px',
                }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={readOnly}
                onClick={() => handleSetItemCount(items.length + 1)}
                style={{ width: '34px', height: '34px', padding: 0, fontSize: '18px', fontWeight: 800 }}
                title="Increase item count"
              >
                +
              </button>
            </div>
          </div>

          {/* ROW 2: Each Line Item Name (e) and Price (e) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 130px 32px',
                gap: '10px',
                padding: '0 8px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              <span>#</span>
              <span>Line Item Name (editable)</span>
              <span style={{ textAlign: 'right' }}>Price (editable)</span>
              <span />
            </div>

            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 130px 32px',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </span>

                <input
                  type="text"
                  disabled={readOnly}
                  className="form-input"
                  placeholder={`Item ${idx + 1} name`}
                  value={item.description}
                  onChange={(e) => handleUpdateLineItem(idx, { description: e.target.value })}
                  style={{ padding: '7px 12px', fontSize: '14px', fontWeight: 600 }}
                />

                <EditableMoneyInput
                  cents={item.priceCents}
                  disabled={readOnly}
                  ariaLabel={`Price for ${item.description || `Item ${idx + 1}`}`}
                  onChangeCents={(cents) => handleUpdateLineItem(idx, { priceCents: cents })}
                />

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleDeleteLineItem(idx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Remove item"
                  >
                    <TrashIcon size={15} />
                  </button>
                )}
              </div>
            ))}

            {!readOnly && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleAddLineItem}
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                <PlusIcon size={14} /> Add Line Item
              </button>
            )}
          </div>

          {/* ROW 3: Subtotal, Tax (e), Tip/Misc (e), Grand Total */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '18px 20px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
            }}
          >
            {/* Subtotal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Subtotal</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700 }}>
                {formatCents(subtotalCents)}
              </span>
            </div>

            {/* Tax (e) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Tax <span style={{ fontSize: '11px', color: 'var(--accent-coral)' }}>(editable)</span>
              </span>
              <EditableMoneyInput
                cents={taxAdj.amountCents || 0}
                disabled={readOnly}
                ariaLabel="Tax amount"
                onChangeCents={handleUpdateTax}
                style={{ width: '130px' }}
              />
            </div>

            {/* Tip / Misc (e) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Tip / Misc <span style={{ fontSize: '11px', color: 'var(--accent-coral)' }}>(editable)</span>
                </span>
                {!readOnly && subtotalCents > 0 && (
                  <div style={{ display: 'inline-flex', gap: '4px' }}>
                    {[15, 18, 20].map((pct) => {
                      const pctCents = Math.round((subtotalCents * pct) / 100);
                      const isMatch = Math.abs(tipMiscCents - pctCents) <= 5;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleUpdateTipMisc(pctCents)}
                          style={{
                            padding: '2px 7px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: 'var(--radius-full)',
                            border: isMatch ? '1px solid var(--accent-coral)' : '1px solid var(--border-subtle)',
                            background: isMatch ? 'var(--accent-coral-glow)' : 'var(--bg-surface)',
                            color: isMatch ? 'var(--accent-coral)' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <EditableMoneyInput
                cents={tipMiscCents}
                disabled={readOnly}
                ariaLabel="Tip or miscellaneous amount"
                onChangeCents={handleUpdateTipMisc}
                style={{ width: '130px' }}
              />
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-medium)', margin: '4px 0' }} />

            {/* Grand Total */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Grand Total
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '24px',
                  fontWeight: 800,
                  color: 'var(--accent-coral)',
                }}
              >
                {formatCents(grandTotalCents)}
              </span>
            </div>
          </div>

          {/* Step 1 Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => goToStep(1)}>
              Next: Paying Parties →
            </button>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP 2: PAYING PARTIES (+ or -, default 2, Jack & Jill as 1 party)
          ===================================================================== */}
      {step === 1 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>👥 Paying Parties</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Set the number of paying parties and optional contact details.
              </p>
            </div>

            {/* # of paying parties (+ or -, default 2) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                background: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700 }}># of Paying Parties:</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={readOnly || parties.length <= 1}
                onClick={() => onSetPartyCount(parties.length - 1)}
                style={{ width: '34px', height: '34px', padding: 0, fontSize: '18px', fontWeight: 800 }}
                title="Remove party"
              >
                −
              </button>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '18px',
                  fontWeight: 800,
                  minWidth: '28px',
                  textAlign: 'center',
                  color: 'var(--accent-coral)',
                }}
              >
                {parties.length}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={readOnly}
                onClick={() => onSetPartyCount(parties.length + 1)}
                style={{ width: '34px', height: '34px', padding: 0, fontSize: '18px', fontWeight: 800 }}
                title="Add party"
              >
                +
              </button>
            </div>
          </div>

          {/* Couples / Combined Party Hint */}
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(60, 198, 176, 0.08)',
              border: '1px solid rgba(60, 198, 176, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '16px' }}>💡</span>
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>Paying together?</strong>{' '}
              <em>&ldquo;Jack and Jill&rdquo;</em> can be the name of 1 party if they are paying as 1.
            </span>
          </div>

          {/* Parties List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {parties.map((party, idx) => {
              const emailVisible = isFieldShown(party, 'email');
              const phoneVisible = isFieldShown(party, 'phone');

              return (
                <div
                  key={party.id}
                  style={{
                    padding: '16px 18px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: `4px solid ${party.color || 'var(--accent-coral)'}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Top row: Avatar, Party Name input, Remove button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      className="party-avatar-circle"
                      style={{
                        background: party.color || 'var(--accent-coral)',
                        width: '36px',
                        height: '36px',
                        flexShrink: 0,
                      }}
                    >
                      {party.name ? party.name.slice(0, 2).toUpperCase() : `P${idx + 1}`}
                    </div>

                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          display: 'block',
                          marginBottom: '4px',
                        }}
                      >
                        Party #{idx + 1} Name
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        className="form-input"
                        placeholder={idx === 1 ? 'e.g. Jack and Jill' : `Party ${idx + 1} name`}
                        value={party.name || ''}
                        onChange={(e) => onUpdateParty(party.id, { name: e.target.value })}
                        style={{ fontSize: '15px', fontWeight: 700, padding: '8px 12px' }}
                      />
                    </div>

                    {!readOnly && parties.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveParty(party.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '6px',
                          alignSelf: 'flex-end',
                          marginBottom: '4px',
                        }}
                        title="Remove this party"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>

                  {/* Progressive Contact Options:
                      "option to add email or phone, option to adds phone if email was selected previously, and vice versa" */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '10px',
                      paddingLeft: '48px',
                    }}
                  >
                    {/* Email input if selected */}
                    {emailVisible && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 220px' }}>
                        <input
                          type="email"
                          disabled={readOnly}
                          className="form-input"
                          placeholder="Email address (optional)"
                          value={party.email || ''}
                          onChange={(e) => onUpdateParty(party.id, { email: e.target.value })}
                          style={{ padding: '7px 12px', fontSize: '13px' }}
                        />
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateParty(party.id, { email: '' });
                              showContactField(party.id, 'email', false);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '15px',
                              padding: '0 4px',
                            }}
                            title="Hide email"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}

                    {/* Phone input if selected */}
                    {phoneVisible && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px' }}>
                        <input
                          type="tel"
                          disabled={readOnly}
                          className="form-input"
                          placeholder="Phone number (optional)"
                          value={party.phone || ''}
                          onChange={(e) => onUpdateParty(party.id, { phone: e.target.value })}
                          style={{ padding: '7px 12px', fontSize: '13px' }}
                        />
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateParty(party.id, { phone: '' });
                              showContactField(party.id, 'phone', false);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '15px',
                              padding: '0 4px',
                            }}
                            title="Hide phone"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action buttons to add Email or Phone (or the other one if one was already selected) */}
                    {!readOnly && !emailVisible && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => showContactField(party.id, 'email', true)}
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        ✉️ + Add Email
                      </button>
                    )}

                    {!readOnly && !phoneVisible && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => showContactField(party.id, 'phone', true)}
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        📱 + Add Phone
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step 2 Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => goToStep(0)}>
              ← Back: Receipt
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => goToStep(2)}>
              Next: Split Items →
            </button>
          </div>
        </section>
      )}

      {/* =====================================================================
          STEP 3: DRAG-AND-DROP ITEMS & PARTIES (100% -> 50% -> 33.3%...)
          ===================================================================== */}
      {step === 2 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Header & Settings Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>🎯 Drag & Split Items</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {dragPartiesToPrice
                  ? 'Drag a Party onto an item’s price/cost (or drag items to parties). 1st = 100%, 2nd = 50% each, 3rd = 33.3% each.'
                  : 'Drag any item onto a party. 1st party = 100%, 2nd party = 50% each, 3rd party = 33.3% each.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {allocations.length > 0 && !readOnly && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onClearAllAllocations}
                  title="Reset all item assignments"
                >
                  ↺ Reset Splits
                </button>
              )}
              <button
                type="button"
                className={`btn btn-sm ${settingsOpen ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSettingsOpen((prev) => !prev)}
              >
                ⚙️ Settings
              </button>
            </div>
          </div>

          {/* Settings Panel: parties to price & drag box appearance */}
          {settingsOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '16px 18px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {/* Setting 1: "parties can be dragged to item price/cost in settings . default to no" */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Parties can be dragged to item price/cost
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Default is <strong>No</strong> (drag items to parties). Turn on to drag party cards directly onto an item&rsquo;s price/cost box.
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-full)',
                    padding: '2px',
                  }}
                >
                  <button
                    type="button"
                    className={`btn btn-sm ${!dragPartiesToPrice ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-full)', padding: '4px 14px' }}
                    onClick={() => handleToggleDragPartyToPrice(false)}
                  >
                    No (Default)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${dragPartiesToPrice ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-full)', padding: '4px 14px' }}
                    onClick={() => handleToggleDragPartyToPrice(true)}
                  >
                    Yes
                  </button>
                </div>
              </div>

              {/* Setting 2: Drag box appearance (Opaque Box vs Outline Box) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Dragging Box Appearance
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Choose whether the dragged preview box displays as a solid <strong>Opaque Box</strong> or a high-contrast <strong>Outline Box</strong>.
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-full)',
                    padding: '2px',
                  }}
                >
                  <button
                    type="button"
                    className={`btn btn-sm ${dragBoxStyle === 'opaque' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-full)', padding: '4px 14px' }}
                    onClick={() => handleSetDragBoxStyle('opaque')}
                  >
                    ⬛ Opaque Box
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${dragBoxStyle === 'outline' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-full)', padding: '4px 14px' }}
                    onClick={() => handleSetDragBoxStyle('outline')}
                  >
                    🔲 Outline Box
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completion Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              background: isAllAssigned ? 'rgba(60, 198, 176, 0.12)' : 'rgba(245, 176, 76, 0.1)',
              border: isAllAssigned ? '1px solid var(--accent-teal)' : '1px solid rgba(245, 176, 76, 0.35)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>{isAllAssigned ? '✅' : '👆'}</span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {isAllAssigned
                  ? 'All items assigned! Tax & tip are split proportionally below.'
                  : `${formatCents(unassignedCents)} remaining to assign (drag items to parties, or tap an item then tap a party).`}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '15px' }}>
              Total: {formatCents(grandTotalCents)}
            </span>
          </div>

          {/* TWO-COLUMN DRAG & DROP BOARD: ITEMS <-> PARTIES */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            {/* LEFT COLUMN: ITEMS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>🧾 Receipt Items ({items.length})</span>
                <span>{dragPartiesToPrice ? 'Drop Party on Price →' : 'Drag Item to Party →'}</span>
              </div>

              {items.map((item) => {
                const assignedPartyIds = getAssignedPartyIdsForItem(item.id);
                const partyCount = assignedPartyIds.length;
                const equalPct = partyCount > 0 ? Math.round((1000 / partyCount)) / 10 : 0;
                const itemSplit = split?.items?.[item.id];
                const isItemDone = partyCount > 0 && (itemSplit?.unassignedCents ?? 0) === 0;
                const isTapSelected = activeTapItemId === item.id;
                const isDropTarget = dragOverItemId === item.id;

                const isBeingDragged = draggingItemId === item.id;

                return (
                  <div
                    key={item.id}
                    data-draggable="true"
                    data-drop-item-id={dragPartiesToPrice ? item.id : undefined}
                    onPointerDown={(e) => startPointerDrag(e, 'item', item.id)}
                    onClick={() => {
                      if (readOnly || suppressNextClickRef.current) return;
                      if (dragPartiesToPrice && activeTapPartyId) {
                        assignPartyToItemEqualShare(item.id, activeTapPartyId);
                        return;
                      }
                      setActiveTapItemId((prev) => (prev === item.id ? null : item.id));
                    }}
                    style={{
                      padding: '14px 16px',
                      background: isDropTarget
                        ? 'rgba(242, 107, 91, 0.16)'
                        : isTapSelected
                        ? 'rgba(242, 107, 91, 0.12)'
                        : isItemDone
                        ? 'rgba(60, 198, 176, 0.06)'
                        : 'var(--bg-surface-elevated)',
                      border: isDropTarget || isTapSelected
                        ? '2px solid var(--accent-coral)'
                        : isBeingDragged
                        ? '1px dashed var(--accent-coral)'
                        : isItemDone
                        ? '1px solid rgba(60, 198, 176, 0.35)'
                        : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: readOnly ? 'default' : isBeingDragged ? 'grabbing' : 'grab',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                            cursor: 'grab',
                          }}
                          title="Drag item to a party"
                        >
                          ⋮⋮
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                          {item.description || 'Item'}
                        </span>
                      </div>

                      {/* Item Price / Cost Dropzone (specifically highlighted when dragPartiesToPrice is on) */}
                      <div
                        data-drop-item-id={item.id}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          fontSize: '15px',
                          padding: dragPartiesToPrice ? '6px 12px' : '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          border: dragPartiesToPrice
                            ? isDropTarget
                              ? '2px solid var(--accent-coral)'
                              : '1px dashed var(--accent-amber)'
                            : '1px solid transparent',
                          background: dragPartiesToPrice ? 'rgba(245, 176, 76, 0.1)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                        title={
                          dragPartiesToPrice
                            ? 'Drop a party here onto the item price/cost'
                            : undefined
                        }
                      >
                        {formatCents(item.priceCents)}
                      </div>
                    </div>

                    {/* Assigned party chips showing 100%, 50%, 33.3%, etc. */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      {partyCount > 0 ? (
                        assignedPartyIds.map((pid) => {
                          const p = partiesMap.get(pid);
                          const cents = itemSplit?.perParty?.[pid] || 0;
                          return (
                            <span
                              key={pid}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '3px 10px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: `1px solid ${p?.color || 'var(--border-medium)'}`,
                              }}
                            >
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: p?.color || 'var(--accent-coral)',
                                }}
                              />
                              <span>{p?.name || 'Party'}</span>
                              <span style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)' }}>
                                {equalPct}%
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                ({formatCents(cents)})
                              </span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePartyFromItemEqualShare(item.id, pid);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    lineHeight: 1,
                                    marginLeft: '2px',
                                  }}
                                  title={`Remove ${p?.name || 'party'} from ${item.description}`}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          {isTapSelected
                            ? '👉 Now tap a party on the right to assign this item'
                            : dragPartiesToPrice
                            ? 'Unassigned — drag a party to the price above, or drag this item to a party'
                            : 'Unassigned — drag to a party on the right'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT COLUMN: PARTIES DROPZONES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>👥 Paying Parties ({parties.length})</span>
                <span>{dragPartiesToPrice ? '← Drag Party to Item Price' : 'Drop Items Here'}</span>
              </div>

              {parties.map((party) => {
                const partySplit = split?.parties?.[party.id];
                const totalOwedCents = partySplit?.totalCents || 0;
                const itemsCents = partySplit?.itemsCents || 0;
                const extrasCents = partySplit?.extrasCents || 0;
                const isPaid = Boolean(party.paidAt || party.paid);
                const isDropOver = dragOverPartyId === party.id;
                const isPartyTapSelected = activeTapPartyId === party.id;
                const isBeingDragged = draggingPartyId === party.id;

                // Items assigned to this party
                const assignedItemsForParty = items.filter((it) =>
                  getAssignedPartyIdsForItem(it.id).includes(party.id)
                );

                return (
                  <div
                    key={party.id}
                    data-drop-party-id={party.id}
                    data-draggable={dragPartiesToPrice ? 'true' : undefined}
                    onPointerDown={(e) => {
                      if (dragPartiesToPrice) startPointerDrag(e, 'party', party.id);
                    }}
                    onClick={() => {
                      if (readOnly || suppressNextClickRef.current) return;
                      if (activeTapItemId) {
                        assignPartyToItemEqualShare(activeTapItemId, party.id);
                        return;
                      }
                      if (dragPartiesToPrice) {
                        setActiveTapPartyId((prev) => (prev === party.id ? null : party.id));
                      }
                    }}
                    style={{
                      padding: '16px',
                      background: isDropOver
                        ? 'rgba(60, 198, 176, 0.16)'
                        : isPartyTapSelected
                        ? 'rgba(242, 107, 91, 0.12)'
                        : 'var(--bg-surface-elevated)',
                      border: isDropOver
                        ? '2px dashed var(--accent-teal)'
                        : isPartyTapSelected
                        ? '2px solid var(--accent-coral)'
                        : isBeingDragged
                        ? '1px dashed var(--accent-coral)'
                        : '1px solid var(--border-subtle)',
                      borderLeft: `4px solid ${party.color || 'var(--accent-coral)'}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: dragPartiesToPrice
                        ? isBeingDragged
                          ? 'grabbing'
                          : 'grab'
                        : activeTapItemId
                        ? 'pointer'
                        : 'default',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                      userSelect: 'none',
                      touchAction: dragPartiesToPrice ? 'none' : 'auto',
                    }}
                  >
                    {/* Party Header & Live Total */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          className="party-avatar-circle"
                          style={{
                            background: party.color || 'var(--accent-coral)',
                            width: '36px',
                            height: '36px',
                          }}
                        >
                          {party.name ? party.name.slice(0, 2).toUpperCase() : 'P'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {dragPartiesToPrice && <span style={{ color: 'var(--text-muted)' }}>⋮⋮</span>}
                            <span>{party.name}</span>
                          </div>
                          {(party.email || party.phone) && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {[party.email, party.phone].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '20px',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {formatCents(totalOwedCents)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Items {formatCents(itemsCents)} + Tax/Tip {formatCents(extrasCents)}
                        </div>
                      </div>
                    </div>

                    {/* Assigned Items inside this Party */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 'var(--radius-sm)',
                        minHeight: '38px',
                        alignItems: 'center',
                      }}
                    >
                      {assignedItemsForParty.length > 0 ? (
                        assignedItemsForParty.map((it) => {
                          const pIds = getAssignedPartyIdsForItem(it.id);
                          const pct = Math.round((1000 / pIds.length)) / 10;
                          const shareCents = split?.items?.[it.id]?.perParty?.[party.id] || 0;
                          return (
                            <span
                              key={it.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                padding: '3px 9px',
                                borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-medium)',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{it.description}</span>
                              <span style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                {pct}%
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                ({formatCents(shareCents)})
                              </span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePartyFromItemEqualShare(it.id, party.id);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    lineHeight: 1,
                                  }}
                                  title="Remove item from this party"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Drop items here to assign to {party.name}
                        </span>
                      )}
                    </div>

                    {/* Settle Up / Mark Paid Footer */}
                    {totalOwedCents > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '8px',
                          paddingTop: '4px',
                        }}
                      >
                        {onOpenPayment && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPayment(party);
                            }}
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3 Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => goToStep(1)}>
              ← Back: Parties
            </button>
          </div>
        </section>
      )}

      {/* =====================================================================
          FLOATING DRAG BOX FOLLOWING POINTER (Opaque Card or Outline Box)
          ===================================================================== */}
      {dragBox && (() => {
        const isOutline = dragBoxStyle === 'outline';

        if (dragBox.type === 'item') {
          const draggedItem = items.find((i) => i.id === dragBox.id);
          if (!draggedItem) return null;
          const hoveredParty = dragOverPartyId ? partiesMap.get(dragOverPartyId) : null;
          const curParties = getAssignedPartyIdsForItem(draggedItem.id);
          const nextCount =
            dragOverPartyId && !curParties.includes(dragOverPartyId)
              ? curParties.length + 1
              : Math.max(1, curParties.length);
          const nextPct = Math.round(1000 / nextCount) / 10;
          const nextShareCents = Math.round((draggedItem.priceCents || 0) / nextCount);

          const borderColor = hoveredParty ? 'var(--accent-teal)' : 'var(--accent-coral)';

          return (
            <div
              style={{
                position: 'fixed',
                left: `${dragBox.x}px`,
                top: `${dragBox.y}px`,
                width: `${dragBox.width}px`,
                zIndex: 9999,
                pointerEvents: 'none',
                opacity: 1,
                backgroundColor: isOutline ? 'rgba(26, 19, 16, 0.55)' : '#241a16',
                backdropFilter: isOutline ? 'blur(8px)' : 'none',
                border: isOutline ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                boxShadow: isOutline
                  ? hoveredParty
                    ? '0 0 28px rgba(60, 198, 176, 0.55), inset 0 0 12px rgba(60, 198, 176, 0.25)'
                    : '0 0 28px rgba(242, 107, 91, 0.55), inset 0 0 12px rgba(242, 107, 91, 0.25)'
                  : '0 20px 48px rgba(0, 0, 0, 0.9), 0 0 24px rgba(242, 107, 91, 0.35)',
                transform: 'scale(1.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--accent-coral)', fontWeight: 800 }}>⋮⋮</span>
                  <span style={{ fontWeight: 800, fontSize: '15px', color: '#f8f5f2' }}>
                    {draggedItem.description || 'Item'}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    fontSize: '15px',
                    color: '#f8f5f2',
                  }}
                >
                  {formatCents(draggedItem.priceCents)}
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: hoveredParty
                    ? 'rgba(60, 198, 176, 0.2)'
                    : isOutline
                    ? 'rgba(242, 107, 91, 0.15)'
                    : '#1a1310',
                  color: hoveredParty ? 'var(--accent-teal)' : '#f8f5f2',
                  border: hoveredParty
                    ? '1px solid var(--accent-teal)'
                    : isOutline
                    ? '1px dashed rgba(242, 107, 91, 0.4)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                {hoveredParty
                  ? `🎯 Drop on ${hoveredParty.name} → ${nextPct}% (${formatCents(nextShareCents)})`
                  : 'Drag onto a party to assign'}
              </div>
            </div>
          );
        }

        if (dragBox.type === 'party') {
          const draggedParty = partiesMap.get(dragBox.id);
          if (!draggedParty) return null;
          const hoveredItem = dragOverItemId ? items.find((i) => i.id === dragOverItemId) : null;
          const curParties = hoveredItem ? getAssignedPartyIdsForItem(hoveredItem.id) : [];
          const nextCount =
            hoveredItem && !curParties.includes(draggedParty.id)
              ? curParties.length + 1
              : Math.max(1, curParties.length);
          const nextPct = Math.round(1000 / nextCount) / 10;
          const nextShareCents = hoveredItem ? Math.round((hoveredItem.priceCents || 0) / nextCount) : 0;
          const partyAccent = draggedParty.color || 'var(--accent-coral)';

          return (
            <div
              style={{
                position: 'fixed',
                left: `${dragBox.x}px`,
                top: `${dragBox.y}px`,
                width: `${dragBox.width}px`,
                zIndex: 9999,
                pointerEvents: 'none',
                opacity: 1,
                backgroundColor: isOutline ? 'rgba(26, 19, 16, 0.55)' : '#241a16',
                backdropFilter: isOutline ? 'blur(8px)' : 'none',
                border: isOutline ? `2px dashed ${partyAccent}` : `2px solid ${partyAccent}`,
                borderLeft: `6px solid ${partyAccent}`,
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                boxShadow: isOutline
                  ? `0 0 28px ${partyAccent}80, inset 0 0 12px ${partyAccent}33`
                  : '0 20px 48px rgba(0, 0, 0, 0.9)',
                transform: 'scale(1.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  className="party-avatar-circle"
                  style={{
                    background: partyAccent,
                    width: '32px',
                    height: '32px',
                  }}
                >
                  {draggedParty.name ? draggedParty.name.slice(0, 2).toUpperCase() : 'P'}
                </div>
                <span style={{ fontWeight: 800, fontSize: '15px', color: '#f8f5f2' }}>
                  {draggedParty.name}
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: hoveredItem
                    ? 'rgba(60, 198, 176, 0.2)'
                    : isOutline
                    ? 'rgba(242, 107, 91, 0.15)'
                    : '#1a1310',
                  color: hoveredItem ? 'var(--accent-teal)' : '#f8f5f2',
                  border: hoveredItem
                    ? '1px solid var(--accent-teal)'
                    : isOutline
                    ? '1px dashed rgba(242, 107, 91, 0.4)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                {hoveredItem
                  ? `🎯 Drop on ${hoveredItem.description} → ${nextPct}% (${formatCents(nextShareCents)})`
                  : 'Drag onto an item price/cost box'}
              </div>
            </div>
          );
        }

        return null;
      })()}
    </div>
  );
}
