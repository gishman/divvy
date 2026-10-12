import React from 'react';
import { formatCents } from '@divvy/shared';
import { CloseIcon, TrophyIcon } from './Icons';

export function GamificationModal({
  isOpen,
  onClose,
  divvys = [],
  currentUser,
}) {
  if (!isOpen) return null;

  const totalDivvys = divvys.length;
  const totalSpentCents = divvys.reduce((sum, d) => sum + (d.myShareCents || 0), 0);
  const totalVolumeCents = divvys.reduce((sum, d) => sum + (d.totalCents || 0), 0);

  const awards = [
    {
      id: 'pizza-boss',
      title: '🍕 Pizza Boss',
      desc: 'Shared the highest number of appetizers and shared pizzas across your table.',
      unlocked: totalDivvys >= 1,
      tag: 'Table Hero',
      color: '#f5b04c',
    },
    {
      id: 'thrifty',
      title: '🪙 Thriftiest Divver',
      desc: 'Managed the slickest low-overhead orders without missing a single round.',
      unlocked: totalDivvys >= 2,
      tag: 'Budget Wizard',
      color: '#3cc6b0',
    },
    {
      id: 'settler',
      title: '⚡ Speedy Settler',
      desc: 'Marked payments complete before the waiter even brought the receipt folder.',
      unlocked: divvys.some((d) => d.myPaid),
      tag: 'Zero Friction',
      color: '#5aa9f0',
    },
    {
      id: 'host',
      title: '👑 Grand Host',
      desc: 'Created and organized dinner splits for 3 or more gatherings.',
      unlocked: totalDivvys >= 3,
      tag: 'Legendary Host',
      color: '#f26b5b',
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🏆 Divvy Hall of Fame & Badges</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {/* Lifetime stats banner */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Divvys Split</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, marginTop: '2px' }}>
                {totalDivvys}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Your Spend</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: 'var(--accent-teal)', marginTop: '2px' }}>
                {formatCents(totalSpentCents)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Volume</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: 'var(--accent-coral)', marginTop: '2px' }}>
                {formatCents(totalVolumeCents)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginTop: '6px' }}>
            Earned Badges & Titles
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {awards.map((badge) => (
              <div
                key={badge.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  background: 'var(--bg-surface-elevated)',
                  border: badge.unlocked ? `1px solid ${badge.color}44` : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  opacity: badge.unlocked ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: badge.unlocked ? `${badge.color}22` : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${badge.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  <TrophyIcon size={20} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{badge.title}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: `${badge.color}22`,
                        color: badge.color,
                        fontWeight: 700,
                      }}
                    >
                      {badge.tag}
                    </span>
                    {badge.unlocked && (
                      <span style={{ fontSize: '11px', color: 'var(--status-complete)', fontWeight: 600, marginLeft: 'auto' }}>
                        UNLOCKED ✓
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {badge.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
