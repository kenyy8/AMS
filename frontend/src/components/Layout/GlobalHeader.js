import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
const GlobalHeader = ({ navItems = [] }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Global scan removed: scanner is dashboard-local only

  return (
    <>
    <header className="app-header global-header">
      <div className="app-header-inner">
        <div className="brand-left">
          <div className="brand-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6ee7b7" />
                  <stop offset="50%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <path d="M12 2l8.485 4.243v8.514L12 22l-8.485-6.243V6.243L12 2z" fill="url(#hexGrad)" />
            </svg>
          </div>
          <div className="brand-text">SMART APARTMENT</div>
        </div>

        <div className="header-actions">
          <div className="quick-actions-header" role="toolbar" aria-label="Quick actions">
            {navItems.map(item => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
              // Use a stable unique key. Prefer item.id -> item.to -> item.key
              const key = item.id || item.to || item.key || item.label;
              return (
                <button
                  key={key}
                  className={'qa-btn' + (isActive ? ' active' : '')}
                  onClick={() => navigate(item.to)}
                  title={item.label}
                >
                  {item.key === 'dashboard' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 13h8V3H3v10zM3 21h8v-6H3v6zM13 21h8V11h-8v10zM13 3v6h8V3h-8z" fill="#fff"/></svg>}
                  <span className="qa-label">{item.label}</span>
                </button>
              );
            })}
          </div>

          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Refresh</button>
    <button className="btn btn-ghost" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/property-manager-login'; }}>Logout</button>

        </div>
      </div>
    </header>
  {/* scanner is dashboard-local only; QuickScannerModal handled in dashboard component */}
    </>
  );
};

export default GlobalHeader;
