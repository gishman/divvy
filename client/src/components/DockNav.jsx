import React from 'react';
import { ReceiptIcon, ScanIcon, HistoryIcon, UsersIcon, TrophyIcon } from './Icons';

export function DockNav({ activeTab, setActiveTab, user, onOpenProfile, onOpenScan }) {
  const navItems = [
    { id: 'divvy', label: 'Current Divvy', icon: ReceiptIcon },
    { id: 'history', label: 'Past Divvys', icon: HistoryIcon },
    { id: 'contacts', label: 'Contacts', icon: UsersIcon },
    { id: 'awards', label: 'Hall of Fame', icon: TrophyIcon },
  ];

  return (
    <nav className="nav-dock" aria-label="Main Navigation">
      <div 
        className="dock-brand" 
        onClick={() => setActiveTab('divvy')} 
        title="divvy home"
      >
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="16" fill="url(#brandGrad)" />
          <path d="M11 18H25" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path d="M18 11V25" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="18" cy="18" r="4.5" fill="#120d0b" />
          <defs>
            <linearGradient id="brandGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f26b5b" />
              <stop offset="1" stopColor="#f5b04c" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="dock-menu">
        <button
          type="button"
          className="dock-btn"
          style={{ background: 'linear-gradient(135deg, var(--accent-coral), var(--accent-amber))', color: '#fff', marginBottom: '8px' }}
          onClick={onOpenScan}
          aria-label="Scan or Add Receipt"
        >
          <ScanIcon size={22} />
          <span className="tooltip">Scan / New Divvy</span>
        </button>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dock-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
            >
              <Icon size={20} />
              <span className="tooltip">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="dock-footer">
        <button
          type="button"
          className="user-avatar-btn"
          onClick={onOpenProfile}
          title={user ? `${user.name} (Click to switch or view profile)` : 'Sign in / Profile'}
          aria-label="User Profile"
        >
          {user ? (user.name ? user.name.slice(0, 2).toUpperCase() : 'ME') : '?'}
        </button>
      </div>
    </nav>
  );
}
