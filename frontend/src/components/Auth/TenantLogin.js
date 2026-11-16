import React, { useState } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import SafeScanner from '../Common/SafeScanner';
// tenant quick-scan removed here to avoid showing empty admin modal

const TenantLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // scanner modal state removed; quick-scan uses a portal handled elsewhere
  // scanner modal flag currently only toggled via setter; keep state for future modal wiring
  // eslint-disable-next-line no-unused-vars
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrPreview, setQrPreview] = useState(null); // holds tenant info from QR
  const navigate = useNavigate();
  const loginFromScan = async result => {
    const raw = result?.[0]?.rawValue;
    if (!raw || scanning) return;
    setScanning(true);
    try {
      const res = await axios.post('/api/qr-sessions', { qr_data: raw });
      localStorage.removeItem('user');
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('tenant', JSON.stringify(res.data.user));
      setScannerModalOpen(false);
      navigate('/tenant-dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to read Smart ID');
      setScannerModalOpen(false);
    } finally { setScanning(false); }
  };

  // quick scan modal removed to keep tenant login focused; use manual login instead

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
                  localStorage.removeItem('user');
                  if (res.data && res.data.token) {
                    localStorage.setItem('token', res.data.token);
                    localStorage.setItem('tenant', JSON.stringify(res.data.user));
                    navigate('/tenant-dashboard');
                  } else {
                    setError('Login failed');
                  }
                } catch (err) {
                  if (process.env.NODE_ENV !== 'production') console.error('Tenant login failed');
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

                {scannerModalOpen && <div role="dialog" aria-label="Scan Smart ID" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 3000, padding: 24 }}><div style={{ maxWidth: 420, margin: 'auto', background: '#fff', padding: 16 }}><h3>Scan Smart ID</h3><SafeScanner onScan={loginFromScan} onError={() => setError('Allow camera access to scan your Smart ID.')} /><button className="btn btn-secondary" onClick={() => setScannerModalOpen(false)}>Close</button></div></div>}
        </div>
      </div>
    </div>
  );
};

export default TenantLogin;
