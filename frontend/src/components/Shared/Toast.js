import React, { useEffect } from 'react';

const variant = (type) => {
  if (type === 'success') return { border: '#10b981', accent: '#0ea5a4' };
  if (type === 'error') return { border: '#ef4444', accent: '#f97316' };
  return { border: '#60a5fa', accent: '#3b82f6' };
};

const Toast = ({ id, message, type = 'info', duration = 3500, onClose }) => {
  useEffect(() => {
    const t = setTimeout(() => onClose && onClose(id), duration);
    return () => clearTimeout(t);
  }, [id, duration, onClose]);

  const v = variant(type);
  return (
    <div style={{
      background: '#ffffff',
      border: `1px solid ${v.border}`,
      padding: '10px 12px',
      borderRadius: 10,
      boxShadow: '0 10px 24px rgba(2,6,23,0.12)',
      minWidth: 260,
      marginBottom: 10,
      color: '#0f1724',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }}>
      <div style={{ width: 10, height: 36, background: v.accent, borderRadius: 6 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{message}</div>
      </div>
      <button aria-label="close" onClick={() => onClose && onClose(id)} style={{ border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}>✕</button>
    </div>
  );
};

export default Toast;
