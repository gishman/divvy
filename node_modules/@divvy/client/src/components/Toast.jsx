import React from 'react';

export function Toast({ toasts = [] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type || 'info'}`}>
          <span>{t.type === 'error' ? '❌' : t.type === 'success' ? '✅' : 'ℹ️'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
