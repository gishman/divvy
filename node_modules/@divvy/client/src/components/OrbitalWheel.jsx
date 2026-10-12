import React from 'react';
import { formatCents } from '@divvy/shared';

export function OrbitalWheel({ split, parties = [], status = 'open', onAssignRemainder }) {
  const totalCents = split?.totalCents || 0;
  const unassignedCents = split?.unassignedCents ?? totalCents;
  const assignedCents = Math.max(0, totalCents - unassignedCents);
  const percentComplete = totalCents > 0 ? Math.min(100, Math.round((assignedCents / totalCents) * 100)) : 0;

  const radius = 105;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  // Compute segments for each party
  let accumulatedPercent = 0;
  const segments = parties.map((p) => {
    const partyShareCents = split?.parties?.[p.id]?.totalCents || 0;
    const pct = totalCents > 0 ? (partyShareCents / totalCents) : 0;
    const dashLength = pct * circumference;
    const dashOffset = -accumulatedPercent * circumference;
    accumulatedPercent += pct;
    return {
      party: p,
      cents: partyShareCents,
      pct: Math.round(pct * 100),
      dashLength,
      dashOffset,
      color: p.color || 'var(--accent-coral)',
    };
  });

  // Remaining unassigned segment
  const unassignedPct = totalCents > 0 ? (unassignedCents / totalCents) : 1;
  const unassignedDash = unassignedPct * circumference;
  const unassignedOffset = -accumulatedPercent * circumference;

  const isComplete = unassignedCents === 0 && totalCents > 0;
  const isClosed = status === 'closed';

  return (
    <div className="wheel-container">
      <div className="wheel-svg-wrapper">
        <svg className="wheel-svg" viewBox="0 0 280 280">
          {/* Subtle background track */}
          <circle
            cx="140"
            cy="140"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
          />

          {/* Party allocated segments */}
          {segments.map((seg) => (
            seg.dashLength > 0 && (
              <circle
                key={seg.party.id}
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dashLength} ${circumference}`}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease',
                  filter: `drop-shadow(0 0 6px ${seg.color}66)`,
                }}
              />
            )
          ))}

          {/* Unassigned track (amber glow dashed) */}
          {unassignedCents > 0 && totalCents > 0 && (
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              stroke="var(--accent-amber)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${Math.max(2, unassignedDash)} ${circumference}`}
              strokeDashoffset={unassignedOffset}
              strokeLinecap="round"
              strokeDashoffset-style="dash"
              style={{
                opacity: 0.35,
                transition: 'all 0.4s ease',
                filter: 'drop-shadow(0 0 8px rgba(245, 176, 76, 0.4))',
              }}
            />
          )}
        </svg>

        {/* Center Hub */}
        <div className="wheel-hub">
          <span className="wheel-hub-sub">
            {isClosed ? 'Divvy Closed' : isComplete ? 'Complete' : 'Remaining'}
          </span>
          <div className="wheel-hub-amount">
            {isClosed
              ? formatCents(totalCents)
              : isComplete
              ? '$0.00'
              : formatCents(unassignedCents)}
          </div>
          <div className="wheel-hub-status">
            {isClosed ? (
              <span style={{ color: 'var(--status-closed)' }}>All settled ✓</span>
            ) : isComplete ? (
              <span style={{ color: 'var(--status-complete)' }}>100% assigned</span>
            ) : (
              <span style={{ color: 'var(--accent-amber)' }}>{percentComplete}% assigned</span>
            )}
          </div>
        </div>
      </div>

      {/* Pill below wheel */}
      {!isComplete ? (
        <button
          type="button"
          className="wheel-unassigned-tag alert"
          onClick={onAssignRemainder}
          style={{ cursor: 'pointer', border: '1px solid var(--accent-amber)' }}
          title="Click to divide remaining amount"
        >
          <span>⚡ {formatCents(unassignedCents)} unassigned</span>
          <span style={{ fontSize: '11px', textDecoration: 'underline' }}>Split remainder</span>
        </button>
      ) : (
        <div className="wheel-unassigned-tag all-done">
          <span>✓ {isClosed ? 'All parties have paid' : 'All items assigned — awaiting payment'}</span>
        </div>
      )}
    </div>
  );
}
