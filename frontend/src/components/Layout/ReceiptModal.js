import React from 'react';
import ReactDOM from 'react-dom';

const ReceiptModal = ({ open, onClose, receipt }) => {
  if (!open || !receipt) return null;

  const { tenantName, apartment, dateStr, items, total, note } = receipt;

  const printableHtml = () => {
    const rows = items.map(it => `<tr><td style="padding:6px 8px">${it.label}</td><td style="padding:6px 8px; text-align:right">${it.value}</td></tr>`).join('');
    return `
      <html>
      <head>
        <title>Receipt</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding:20px; color:#111 }
          .header { display:flex; justify-content:space-between; align-items:center }
          .title { font-size:18px; font-weight:700 }
          table { width:100%; border-collapse:collapse; margin-top:12px }
          .total { font-size:20px; font-weight:800; margin-top:12px }
        </style>
      </head>
      <body>
        <div class="header"><div><div class="title">Receipt</div><div style="margin-top:8px">${tenantName}</div><div style="color:#666">${apartment || ''}</div></div><div>${dateStr}</div></div>
        <table>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="total">Total: ${total}</div>
        <div style="margin-top:18px;color:#666">${note || ''}</div>
      </body>
      </html>
    `;
  };

  const downloadReceipt = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    w.document.write(printableHtml());
    w.document.close();
    // give browser a moment to render then print
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error(e); } }, 200);
  };

  const modal = (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div style={{ width: 'min(720px,96%)', background: '#fff', borderRadius: 8, padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Receipt</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline-secondary" onClick={downloadReceipt}>Download / Print</button>
            <button className="btn btn-secondary" onClick={() => onClose && onClose()}>Close</button>
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 6 }}><strong>Date:</strong> {dateStr}</div>
          <div style={{ marginBottom: 6 }}><strong>Tenant:</strong> {tenantName}</div>
          {apartment && <div style={{ marginBottom: 6 }}><strong>Apartment:</strong> {apartment}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}><td style={{ padding: '6px 8px' }}>{it.label}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.value}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontWeight: 800, fontSize: 18 }}>Total: {total}</div>
          {note && <div style={{ marginTop: 8, color: '#666' }}>{note}</div>}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default ReceiptModal;
