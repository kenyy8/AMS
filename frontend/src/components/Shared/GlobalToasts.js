import React, { useEffect, useState } from 'react';
import Toast from './Toast';

const GlobalToasts = () => {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Date.now() + Math.random();
      const { message, type, duration } = e.detail || {};
      setToasts(prev => [{ id, message, type: type || 'info', duration: duration || 3500 }, ...prev]);
    };
    window.addEventListener('app:toast', h);
    return () => window.removeEventListener('app:toast', h);
  }, []);

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    // container sits below navbar; navbar height may be ~56px. increase zIndex to sit above content but below any app chrome if needed
    <div aria-hidden style={{ position: 'fixed', inset: 0, top: 0, left: 0, right: 0, pointerEvents: 'none', zIndex: 2099 }}>
      <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', zIndex: 2100, width: '100%', display: 'flex', justifyContent: 'center', padding: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 240, maxWidth: 720 }}>
          {toasts.map(t => (
            <Toast key={t.id} id={t.id} message={t.message} type={t.type} duration={t.duration} onClose={remove} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default GlobalToasts;
