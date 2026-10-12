import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';
import { parseReceiptText, formatCents, toCents } from '@divvy/shared';
import { api } from '../api';
import { CloseIcon, ScanIcon, PlusIcon, TrashIcon } from './Icons';

export function ReceiptScannerModal({
  isOpen,
  onClose,
  onCreateDivvy,
  onJoinExisting,
}) {
  const [stage, setStage] = useState('upload'); // 'upload', 'scanning', 'preview', 'duplicate-warning'
  const [scanProgress, setScanProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewData, setPreviewData] = useState({
    title: 'Restaurant Bill',
    merchant: '',
    receiptDate: new Date().toISOString().slice(0, 10),
    items: [],
    adjustments: [],
  });
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleProcessFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG)');
      return;
    }

    setError('');
    setStage('scanning');
    setScanProgress(5);
    setStatusMessage('Initializing OCR engine...');

    let text = '';
    let parsed = null;

    // 1. Attempt client-side Tesseract.js with Web Worker
    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const p = Math.round((m.progress || 0) * 80) + 10;
            setScanProgress(p);
            setStatusMessage(`Reading text... ${Math.round((m.progress || 0) * 100)}%`);
          }
        },
      });

      setStatusMessage('Extracting receipt details...');
      const ret = await worker.recognize(file);
      await worker.terminate();
      text = ret?.data?.text || '';
      parsed = parseReceiptText(text);
      setScanProgress(100);
    } catch (localErr) {
      console.warn('Local OCR failed, falling back to server OCR...', localErr);
      setStatusMessage('Local OCR unavailable, trying server fallback...');
      try {
        const serverRes = await api.ocr.scanServer(file);
        text = serverRes.text || '';
        parsed = serverRes.parsed || parseReceiptText(text);
        setScanProgress(100);
      } catch (serverErr) {
        setError(`Scanning failed: ${serverErr.message || 'Could not parse image'}. You can still enter items manually.`);
        setStage('preview');
        return;
      }
    }

    // Populate preview
    const merchantName = parsed?.merchant || 'Restaurant';
    const items = (parsed?.items || []).map((it, idx) => ({
      id: `scanned_${idx}`,
      description: it.description || `Item #${idx + 1}`,
      quantity: it.quantity || 1,
      priceCents: it.priceCents || 0,
    }));

    const adjustments = (parsed?.adjustments || []).map((adj, idx) => ({
      id: `adj_${idx}`,
      kind: adj.kind || 'tax',
      label: adj.label || (adj.kind === 'tax' ? 'Sales Tax' : 'Tip'),
      amountCents: adj.amountCents || 0,
    }));

    setPreviewData({
      title: `${merchantName} (${new Date().toLocaleDateString()})`,
      merchant: merchantName,
      receiptDate: parsed?.receiptDate || new Date().toISOString().slice(0, 10),
      items: items.length > 0 ? items : [{ id: 'item_1', description: 'Item 1', quantity: 1, priceCents: 1500 }],
      adjustments: adjustments.length > 0 ? adjustments : [
        { id: 'tax_1', kind: 'tax', label: 'Sales Tax', amountCents: 125 },
        { id: 'tip_1', kind: 'tip', label: 'Tip', amountCents: 300 },
      ],
    });

    setStage('preview');
  };

  const handleStartManual = () => {
    setPreviewData({
      title: 'New Divvy',
      merchant: 'Dinner',
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { id: 'item_1', description: 'Shared Appetizer', quantity: 1, priceCents: 1400 },
        { id: 'item_2', description: 'Main Entree 1', quantity: 1, priceCents: 2400 },
        { id: 'item_3', description: 'Main Entree 2', quantity: 1, priceCents: 2200 },
      ],
      adjustments: [
        { id: 'tax_1', kind: 'tax', label: 'Sales Tax', amountCents: 540 },
        { id: 'tip_1', kind: 'tip', label: 'Tip / Gratuity', amountCents: 1200 },
      ],
    });
    setStage('preview');
  };

  const handleCreateSubmit = async (force = false) => {
    try {
      const payload = {
        title: previewData.title,
        merchant: previewData.merchant,
        receiptDate: previewData.receiptDate,
        items: previewData.items,
        adjustments: previewData.adjustments,
        force,
      };

      const result = await onCreateDivvy(payload);
      if (result?.duplicates && result.duplicates.length > 0) {
        setDuplicateMatches(result.duplicates);
        setStage('duplicate-warning');
        return;
      }
      onClose();
    } catch (err) {
      if (err.data?.duplicates) {
        setDuplicateMatches(err.data.duplicates);
        setStage('duplicate-warning');
      } else {
        setError(err.message || 'Could not create divvy');
      }
    }
  };

  const calculateSubtotal = () =>
    previewData.items.reduce((sum, it) => sum + (it.priceCents || 0), 0);

  const calculateTotal = () =>
    calculateSubtotal() + previewData.adjustments.reduce((sum, a) => sum + (a.amountCents || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {stage === 'upload' && '📸 Scan or Create Receipt'}
            {stage === 'scanning' && '🔍 Reading Receipt...'}
            {stage === 'preview' && '🧾 Review & Confirm Receipt'}
            {stage === 'duplicate-warning' && '⚠️ Duplicate Divvy Detected'}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* STAGE 1: UPLOAD / DROPZONE */}
        {stage === 'upload' && (
          <div className="modal-body">
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleProcessFile(e.dataTransfer.files[0]);
              }}
              onClick={() => document.getElementById('receipt-file-input')?.click()}
            >
              <ScanIcon size={48} className="dropzone-icon" />
              <div style={{ fontWeight: 700, fontSize: '16px', marginTop: '12px' }}>
                Drop receipt photo here or click to browse
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Instant on-device OCR using Tesseract.js (JPG, PNG)
              </div>
              <input
                id="receipt-file-input"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleProcessFile(e.target.files[0]);
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={handleStartManual}
            >
              ✍️ Enter Receipt Items Manually
            </button>

            {error && <div className="form-error">{error}</div>}
          </div>
        )}

        {/* STAGE 2: SCANNING PROGRESS */}
        {stage === 'scanning' && (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Processing receipt...</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {statusMessage}
            </div>

            <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden', marginTop: '20px' }}>
              <div
                style={{
                  width: `${scanProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--accent-coral), var(--accent-amber))',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* STAGE 3: PREVIEW & EDIT */}
        {stage === 'preview' && (
          <div className="modal-body">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Title / Merchant</label>
                <input
                  type="text"
                  className="form-input"
                  value={previewData.title}
                  onChange={(e) => setPreviewData({ ...previewData, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Receipt Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={previewData.receiptDate}
                  onChange={(e) => setPreviewData({ ...previewData, receiptDate: e.target.value })}
                />
              </div>
            </div>

            {/* Line items table */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="form-label">Line Items ({previewData.items.length})</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setPreviewData({
                      ...previewData,
                      items: [...previewData.items, { id: `item_${Date.now()}`, description: 'New item', quantity: 1, priceCents: 1000 }],
                    })
                  }
                >
                  <PlusIcon size={12} /> Add Item
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                {previewData.items.map((item, idx) => (
                  <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                      value={item.description}
                      onChange={(e) => {
                        const next = [...previewData.items];
                        next[idx].description = e.target.value;
                        setPreviewData({ ...previewData, items: next });
                      }}
                    />
                    <input
                      type="text"
                      className="form-input mono"
                      style={{ width: '90px', padding: '6px 10px', fontSize: '13px', textAlign: 'right' }}
                      value={(item.priceCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const next = [...previewData.items];
                        next[idx].priceCents = toCents(e.target.value);
                        setPreviewData({ ...previewData, items: next });
                      }}
                    />
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={() =>
                        setPreviewData({
                          ...previewData,
                          items: previewData.items.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Adjustments */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Sales Tax ($)</label>
                <input
                  type="text"
                  className="form-input mono"
                  value={((previewData.adjustments.find((a) => a.kind === 'tax')?.amountCents || 0) / 100).toFixed(2)}
                  onChange={(e) => {
                    const cents = toCents(e.target.value);
                    const exists = previewData.adjustments.some((a) => a.kind === 'tax');
                    const adjs = exists
                      ? previewData.adjustments.map((a) => (a.kind === 'tax' ? { ...a, amountCents: cents } : a))
                      : [...previewData.adjustments, { kind: 'tax', label: 'Sales Tax', amountCents: cents }];
                    setPreviewData({ ...previewData, adjustments: adjs });
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tip / Gratuity ($)</label>
                <input
                  type="text"
                  className="form-input mono"
                  value={((previewData.adjustments.find((a) => a.kind === 'tip')?.amountCents || 0) / 100).toFixed(2)}
                  onChange={(e) => {
                    const cents = toCents(e.target.value);
                    const exists = previewData.adjustments.some((a) => a.kind === 'tip');
                    const adjs = exists
                      ? previewData.adjustments.map((a) => (a.kind === 'tip' ? { ...a, amountCents: cents } : a))
                      : [...previewData.adjustments, { kind: 'tip', label: 'Tip', amountCents: cents }];
                    setPreviewData({ ...previewData, adjustments: adjs });
                  }}
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Items Subtotal: </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCents(calculateSubtotal())}</span>
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Grand Total: </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 800, color: 'var(--accent-coral)' }}>
                  {formatCents(calculateTotal())}
                </span>
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>
        )}

        {/* STAGE 4: DUPLICATE WARNING ("One divvy per event") */}
        {stage === 'duplicate-warning' && (
          <div className="modal-body">
            <div style={{ background: 'rgba(245, 176, 76, 0.1)', border: '1px solid var(--accent-amber)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
              <strong>Notice: "One Divvy Per Event"</strong>
              <p style={{ fontSize: '13px', marginTop: '6px' }}>
                We found existing divvys for your group with this exact amount ({formatCents(calculateTotal())}).
                If someone at your table already scanned this, you can join their live session!
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
              {duplicateMatches.map((dup) => (
                <div key={dup.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{dup.title || 'Untitled divvy'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Scanned by {dup.ownerName} • {dup.receiptDate || new Date(dup.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onJoinExisting(dup.id);
                      onClose();
                    }}
                  >
                    Join This Divvy →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="modal-footer">
          {stage === 'preview' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setStage('upload')}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handleCreateSubmit(false)}>
                Create Divvy Now
              </button>
            </>
          )}

          {stage === 'duplicate-warning' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleCreateSubmit(true)}>
                Create New Anyway
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
