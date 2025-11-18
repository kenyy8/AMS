import React, { useState } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import QuickScannerModal from '../Layout/QuickScannerModal';
import QRCodeScanner from '../Dashboard/QRCodeScanner';

const TenantLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // only modal is used now — scanner will render full-screen via portal
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState(null); // holds tenant info from QR
  const navigate = useNavigate();

  const handleQRResolved = (respData) => {
    if (respData && respData.tenant) {
      setQrPreview({ tenant: respData.tenant, bills: respData.bills || [] });
  setScannerModalOpen(false);
    } else {
      setError('QR did not resolve to a tenant');
    }
  };

  const handleScannerClose = () => { setScannerModalOpen(false); };

  // called by the embedded QuickScannerModal -> QRCodeScanner which sets scannedTenant
  // The scanner component posts to /api/qr-codes/scan and sets the tenant object in the response.
  // We add a small global event so the QuickScannerModal can pass the resolved data back here.
  React.useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.tenant) handleQRResolved(e.detail);
    };
    window.addEventListener('app:qr-resolved', handler);
    return () => window.removeEventListener('app:qr-resolved', handler);
  }, []);

  return (
    <div className="hero-center">
      <div className="container-narrow">
  <div className="card-glass" style={{ padding: 16, maxWidth: 820, margin: '18px auto', backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.78)', border: 'none', boxShadow: '0 18px 40px rgba(2,6,23,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0, color: '#1a1a1a', padding: '6px 8px' }}>Tenant Login</h2>
            <button className="btn btn-ghost" style={{ background: 'rgba(255,255,255,0.9)', color: '#0f172a', borderRadius: 8, boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }} onClick={() => navigate('/')}>Back to Home</button>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 420px', minWidth: 260 }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                try {
                  const res = await axios.post('/api/tenants/login', { email, password });
                  if (res.data && res.data.token) {
                    localStorage.setItem('token', res.data.token);
                    localStorage.setItem('tenant', JSON.stringify(res.data.user));
                    navigate('/tenant-dashboard');
                  } else {
                    setError('Login failed');
                  }
                } catch (err) {
                  console.error('Tenant login failed', err);
                  setError(err.response?.data?.message || 'Login failed');
                }
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label className="form-label" style={{ color: '#1a1a1a', fontWeight: 800, display: 'block', marginBottom: 6 }}>Email</label>
                      <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required style={{ background: '#fff', color: '#111827', padding: '10px 12px', borderRadius: 8 }} />
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <label className="form-label" style={{ color: '#1a1a1a', fontWeight: 800, display: 'block', marginBottom: 6 }}>Password</label>
                      <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required style={{ background: '#fff', color: '#111827', padding: '10px 12px', borderRadius: 8 }} />
                    </div>
                  </div>
                </div>

                {error && <div className="alert alert-danger" style={{ marginTop: 8 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                  <button className="btn btn-primary" type="submit" style={{ minWidth: 110, padding: '10px 16px' }}>Log In</button>
                  <div style={{ flex: 1 }} />
                </div>
              </form>
            </div>

            <div style={{ flex: '0 0 300px', minWidth: 220 }}>
              <div className="card-glass" style={{ padding: 12, borderRadius: 12, boxShadow: '0 12px 30px rgba(2,6,23,0.06)', background: 'rgba(255,255,255,0.95)', border: 'none' }}>
                <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 700, marginBottom: 8 }}>Quick Scan / Preview</div>
                {!qrPreview && (
                  <div style={{ color: '#475569', fontSize: 13 }}>Scan your Smart ID to preview tenant bills and login passwordlessly.</div>
                )}

                {qrPreview && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 800, color: '#1a1a1a' }}>{qrPreview.tenant.name}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{qrPreview.tenant.email}</div>
                    <div style={{ marginTop: 8 }}>
                      <strong style={{ color: '#0f172a' }}>Bills:</strong>
                      <div style={{ marginTop: 6 }}>
                        {qrPreview.bills.filter(b => ['rent','electricity','water'].includes((b.bill_type || '').toLowerCase())).map(b => (
                          <div key={b.id || b.bill_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#0f172a' }}>
                            <div>{b.bill_type}</div>
                            <div>{b.amount}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
                      <button className="btn btn-success" onClick={async () => {
                        try {
                          const tenantIdForToken = qrPreview.tenant.tenant_id || qrPreview.tenant.id;
                          if (!tenantIdForToken) return setError('Tenant identifier missing');
                          const resp = await axios.get(`/api/qr-tokens/${tenantIdForToken}`);
                          if (resp.data && resp.data.token) {
                            localStorage.setItem('token', resp.data.token);
                            localStorage.setItem('tenant', JSON.stringify(qrPreview.tenant));
                            navigate('/tenant-dashboard');
                          } else setError('Failed to obtain login token');
                        } catch (err) {
                          console.error('Token login failed', err);
                          setError(err.response?.data?.message || 'Passwordless login failed');
                        }
                      }}>Login</button>

                      <button className="btn btn-outline-secondary" onClick={() => setQrPreview(null)}>Clear</button>
                    </div>
                  </div>
                )}

                {/* place a Scan QR Code button under the preview text for discoverability */}
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-outline-primary" onClick={() => setScannerModalOpen(true)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8 }}>Open Scanner</button>
                </div>

                {/* scanner toggle is below the card now */}
              </div>
            </div>
            {/* inline scanner removed: scanner opens as full-screen modal */}
          </div>

          <QuickScannerModal open={scannerModalOpen} onClose={handleScannerClose} />
        </div>
      </div>
    </div>
  );
};

export default TenantLogin;
