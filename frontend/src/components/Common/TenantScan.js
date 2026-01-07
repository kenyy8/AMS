import React, { useEffect, useState } from 'react';
import SafeScanner from './SafeScanner';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';

// TenantScan: tenant-facing scanner component. Must only handle tenant login.
const TenantScan = ({ onClose } = {}) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setError(''); }, []);

  const handleScan = async (result) => {
    if (!result) return;
    const raw = result[0]?.rawValue || result;
    setLoading(true); setError('');
    try {
      let payload;
      try { payload = JSON.parse(raw); } catch (e) { payload = raw; }
      const resp = await axios.post('/api/qr-codes/scan', { qr_data: payload });
      if (resp?.data?.tenant) {
        showToast('Tenant QR processed', 'success');
        try { window.dispatchEvent(new CustomEvent('app:qr-resolved', { detail: resp.data })); } catch (e) {}
      } else {
        showToast('QR did not resolve to a tenant', 'info');
      }
    } catch (err) {
      console.error('TenantScan scan error', err);
      setError('Failed to process QR code.');
      showToast('Failed to process QR', 'error');
    }
    setLoading(false);
    if (typeof onClose === 'function') onClose();
  };

  const handleError = (err) => { console.error('TenantScan error', err); setError('Scanner error — allow camera permission and try again.'); };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div style={{ width: 360, maxWidth: '92vw', height: 360, background: '#000', padding: 6, borderRadius: 8, overflow: 'hidden' }}>
        <SafeScanner onScan={handleScan} onError={handleError} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn btn-light" type="button" onClick={() => { if (onClose) onClose(); }}>Cancel</button>
      </div>
    </div>
  );
};

export default TenantScan;
