import React from 'react';

// ScanResult: UI-only component. Receives `scannedData` prop with shape:
// { tenant: {...}, bills: [...], payment_history: [...] }
// It must never display internal DB ids.
const ScanResult = ({ open = false, onClose = () => {}, scannedData = null }) => {
  if (!open) return null;

  const tenant = scannedData?.tenant || null;
  const bills = Array.isArray(scannedData?.bills) ? scannedData.bills : [];
  const payments = Array.isArray(scannedData?.payment_history) ? scannedData.payment_history : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: 900, maxWidth: '96vw', maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', background: '#fff', borderRadius: 10, padding: 16, marginTop: 64 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Tenant Scan Result</h3>
          <div>
            <button className="btn btn-outline-secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        {!tenant && <div style={{ marginTop: 12 }}>No tenant data available.</div>}

        {tenant && (
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: '0 0 260px', padding: 12, borderRadius: 8, background: '#f8fafc' }}>
              <div style={{ fontWeight: 800 }}>{tenant.name || tenant.tenant_name || 'Unnamed Tenant'}</div>
              <div style={{ color: '#475569', fontSize: 13 }}>{tenant.email || tenant.contact || ''}</div>
              <div style={{ marginTop: 8, fontSize: 13 }}><strong>Apartment:</strong> {tenant.apartment_number || tenant.apartment || 'N/A'}</div>
              {/* Do NOT display internal DB ids; omit Tenant ID from UI */}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Current Bills</div>
                  {bills.length === 0 && <div style={{ color: '#475569' }}>No current bills</div>}
                  {bills.map((b, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderBottom: '1px solid #e6eef6' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{b.bill_type || 'UNKNOWN'}</div>
                        <div style={{ fontSize: 12, color: '#475569' }}>{b.due_date ? new Date(b.due_date).toLocaleDateString() : 'No due date'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>₱{Number(b.amount || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 12, color: b.status && b.status.toLowerCase().includes('paid') ? '#10b981' : '#ef4444' }}>{b.status || 'pending'}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ width: 320 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Payment History</div>
                  {payments.length === 0 && <div style={{ color: '#475569' }}>No payment history</div>}
                  {payments.map((p, idx) => (
                    <div key={idx} style={{ padding: 8, borderBottom: '1px solid #eef2ff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>₱{Number(p.amount_paid || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 12, color: '#475569' }}>{p.payment_type}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{p.paid_at ? new Date(p.paid_at).toLocaleString() : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Backwards-compatible named export used in a couple of places: QuickScannerModal
export const QuickScannerModal = ScanResult;
export default ScanResult;
