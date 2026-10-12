import React, { useState, useEffect } from 'react';
import { formatCents } from '@divvy/shared';
import { CloseIcon, WalletIcon, ExternalLinkIcon, CopyIcon, CheckIcon } from './Icons';

export function PaymentModal({
  isOpen,
  onClose,
  party,
  divvy,
  totalOwedCents = 0,
  isPaid = false,
  onTogglePaid,
  onAddToast,
}) {
  const [venmoHandle, setVenmoHandle] = useState('');
  const [cashAppHandle, setCashAppHandle] = useState('');
  const [paypalHandle, setPaypalHandle] = useState('');
  const [copied, setCopied] = useState(false);

  // Load saved payment handles for this party from localStorage
  useEffect(() => {
    if (party) {
      const storageKey = `divvy_handles_${party.contactId || party.id || party.name}`;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        setVenmoHandle(saved.venmo || '');
        setCashAppHandle(saved.cashapp || '');
        setPaypalHandle(saved.paypal || '');
      } catch {
        // fallback
      }
    }
  }, [party]);

  if (!isOpen || !party) return null;

  const dollars = (Math.max(0, totalOwedCents) / 100).toFixed(2);
  const note = `${divvy?.title || 'Bill split'} via Divvy`;

  const handleSaveHandles = () => {
    const storageKey = `divvy_handles_${party.contactId || party.id || party.name}`;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        venmo: venmoHandle.trim().replace(/^@/, ''),
        cashapp: cashAppHandle.trim().replace(/^\$/, ''),
        paypal: paypalHandle.trim().replace(/^paypal\.me\//, ''),
      })
    );
  };

  const cleanVenmo = venmoHandle.trim().replace(/^@/, '');
  const cleanCashApp = cashAppHandle.trim().replace(/^\$/, '');
  const cleanPayPal = paypalHandle.trim().replace(/^https?:\/\/paypal\.me\//i, '').replace(/^paypal\.me\//i, '');

  const venmoUrl = cleanVenmo
    ? `https://venmo.com/?txn=pay&audience=private&recipients=${encodeURIComponent(cleanVenmo)}&amount=${dollars}&note=${encodeURIComponent(note)}`
    : `https://venmo.com/`;

  const cashAppUrl = cleanCashApp
    ? `https://cash.app/$${encodeURIComponent(cleanCashApp)}/${dollars}`
    : `https://cash.app/`;

  const paypalUrl = cleanPayPal
    ? `https://paypal.me/${encodeURIComponent(cleanPayPal)}/${dollars}`
    : `https://www.paypal.com/`;

  const handleCopySummary = () => {
    const text = `Hey ${party.name}! Your share for "${divvy?.title || 'Dinner'}" is $${dollars}.\n` +
      (cleanVenmo ? `Venmo: ${venmoUrl}\n` : '') +
      (cleanCashApp ? `Cash App: ${cashAppUrl}\n` : '') +
      (cleanPayPal ? `PayPal: ${paypalUrl}\n` : '');

    navigator.clipboard?.writeText(text);
    setCopied(true);
    if (onAddToast) onAddToast('Payment details copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <WalletIcon size={20} />
            <h3 style={{ margin: 0 }}>Settle Up with {party.name}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {/* Amount Card */}
          <div
            style={{
              padding: '18px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(242, 107, 91, 0.12), rgba(245, 176, 76, 0.12))',
              border: '1px solid rgba(242, 107, 91, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Amount Due
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff', marginTop: '4px' }}>
                {formatCents(totalOwedCents)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {divvy?.title || 'Divvy bill'}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${isPaid ? 'badge-closed' : 'badge-open'}`}>
                {isPaid ? '✓ Marked Paid' : '○ Pending Payment'}
              </span>
            </div>
          </div>

          {/* Payment Providers Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Choose Payment Method
            </div>

            {/* 1. Venmo Deep Link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#008CFF',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                  }}
                >
                  V
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Venmo</div>
                  <input
                    type="text"
                    placeholder="@username"
                    value={venmoHandle}
                    onChange={(e) => {
                      setVenmoHandle(e.target.value);
                      handleSaveHandles();
                    }}
                    onBlur={handleSaveHandles}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px dashed var(--border-medium)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      padding: '2px 0',
                      outline: 'none',
                      width: '130px',
                    }}
                  />
                </div>
              </div>

              <a
                href={venmoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSaveHandles}
              >
                Pay ${dollars} <ExternalLinkIcon size={12} />
              </a>
            </div>

            {/* 2. Cash App Deep Link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#00D632',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                  }}
                >
                  $
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Cash App</div>
                  <input
                    type="text"
                    placeholder="$cashtag"
                    value={cashAppHandle}
                    onChange={(e) => {
                      setCashAppHandle(e.target.value);
                      handleSaveHandles();
                    }}
                    onBlur={handleSaveHandles}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px dashed var(--border-medium)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      padding: '2px 0',
                      outline: 'none',
                      width: '130px',
                    }}
                  />
                </div>
              </div>

              <a
                href={cashAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSaveHandles}
              >
                Pay ${dollars} <ExternalLinkIcon size={12} />
              </a>
            </div>

            {/* 3. PayPal Deep Link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#003087',
                    color: '#0079C1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                  }}
                >
                  P
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>PayPal / PayPal.Me</div>
                  <input
                    type="text"
                    placeholder="paypal.me/handle"
                    value={paypalHandle}
                    onChange={(e) => {
                      setPaypalHandle(e.target.value);
                      handleSaveHandles();
                    }}
                    onBlur={handleSaveHandles}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px dashed var(--border-medium)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      padding: '2px 0',
                      outline: 'none',
                      width: '130px',
                    }}
                  />
                </div>
              </div>

              <a
                href={paypalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSaveHandles}
              >
                Pay ${dollars} <ExternalLinkIcon size={12} />
              </a>
            </div>

            {/* PayPal Business Account Readiness banner */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 121, 193, 0.08)',
                border: '1px solid rgba(0, 121, 193, 0.25)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '14px' }}>💼</span>
              <span>
                <strong>PayPal Business</strong>: Direct checkout ready. Provide your Client ID to activate instant automated web checkout!
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopySummary}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copied ? 'Copied Link' : 'Copy Pay Link'}
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn btn-sm ${isPaid ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => {
                onTogglePaid(party.id, !isPaid);
                onClose();
              }}
            >
              {isPaid ? 'Mark Unpaid' : '✓ Mark Paid'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
