import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';
import { formatMeterNumber } from '../../utils/numberFormat';

// We'll measure the navbar at runtime to avoid a white gap between navbar and modal
const overlayStyleBase = {
  position: 'fixed', left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)', zIndex: 3000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  transition: 'opacity 220ms ease'
};

const modalBase = {
  width: 'min(820px, 96%)', maxHeight: '85vh', overflow: 'hidden',
  background: '#fff', borderRadius: 8, padding: 0, boxShadow: '0 8px 36px rgba(0,0,0,0.28)'
};

const smallFormulaStyle = { fontSize: 12, color: '#666', marginLeft: 8 };

const ScanModal = ({ open, onClose, tenantPayload }) => {
  const [latestBill, setLatestBill] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBills, setSelectedBills] = useState(new Set());
  const [showPastDue, setShowPastDue] = useState(false);
  const [showPaidHistory, setShowPaidHistory] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState(overlayStyleBase);
  const [modalStyle, setModalStyle] = useState(modalBase);

  const tenantId = tenantPayload && (tenantPayload.tenant && (tenantPayload.tenant.id || tenantPayload.tenantId) || tenantPayload.tenant_id || tenantPayload.tenantId);

  const loadBills = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const resp = await axios.get('/api/bills');
      const bills = Array.isArray(resp.data) ? resp.data : [];
      const tenantBills = bills.filter(b => String(b.tenant_id) === String(tenantId));
      const sorted = tenantBills.slice().sort((a, b) => new Date(b.due_date || b.created_at || 0) - new Date(a.due_date || a.created_at || 0));
      setHistory(sorted);
      setLatestBill(sorted[0] || null);
    } catch (err) {
      console.error('Failed to load tenant bills for scan modal', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    loadBills();
  }, [open, loadBills]);

  // compute navbar height dynamically to position overlay exactly below header
  useEffect(() => {
    const compute = () => {
      try {
        const header = document.querySelector('.app-header') || document.querySelector('header');
        const h = header ? header.getBoundingClientRect().height : 72;
        // put overlay top at navbar bottom so modal does not overlap nav
        setOverlayStyle({ ...overlayStyleBase, top: `${h}px`, alignItems: 'flex-start' });
        // modal maxHeight stays at 85vh but ensure it fits under navbar by reducing available height
        const avail = Math.min(window.innerHeight - h - 24, Math.round(window.innerHeight * 0.85));
        setModalStyle({ ...modalBase, maxHeight: `${avail}px` });
      } catch (e) {
        setOverlayStyle({ ...overlayStyleBase, top: '72px', alignItems: 'flex-start' });
        setModalStyle({ ...modalBase, maxHeight: '85vh' });
      }
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // render guard: only render modal content when open

  const formatCurrency = (v) => (v === null || v === undefined) ? '0' : Number(v).toLocaleString();

  const totalDue = history.filter(b => (b.status || '').toLowerCase() !== 'paid').reduce((s, b) => s + (Number(b.amount) || 0), 0);

  const markAsPaid = async (bill) => {
    if (!bill || !bill.id) return;
    setLoading(true);
    try {
      await axios.patch(`/api/bills/${bill.id}/status`, { status: 'paid' });
      showToast('Payment updated successfully', 'success');
      setHistory(prev => prev.map(x => x.id === bill.id ? { ...x, status: 'paid' } : x));
      window.dispatchEvent(new CustomEvent('app:refresh-dashboard'));
    } catch (err) {
      console.error('Failed to mark bill paid', err);
      showToast('Failed to update payment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const markSelectedAsPaid = async () => {
    if (selectedBills.size === 0) return showToast('No bills selected', 'info');
    const ids = Array.from(selectedBills);
    setLoading(true);
    try {
      for (const id of ids) {
        try { await axios.patch(`/api/bills/${id}/status`, { status: 'paid' }); } catch (e) { console.error('Failed to mark bill', id, e); }
      }
      setHistory(prev => prev.map(b => ids.includes(b.id) ? { ...b, status: 'paid' } : b));
      setSelectedBills(new Set());
      setSelectAll(false);
      showToast('Selected bills marked as paid', 'success');
      window.dispatchEvent(new CustomEvent('app:refresh-dashboard'));
    } catch (err) {
      console.error('Bulk payment error', err);
      showToast('Failed to update selected payments', 'error');
    } finally { setLoading(false); }
  };

  const renderLatest = () => {
    if (!latestBill) return <div className="text-muted">No bills available for this tenant</div>;
    const dateStr = latestBill.due_date ? new Date(latestBill.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date(latestBill.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const tenantName = (tenantPayload && tenantPayload.tenant && (tenantPayload.tenant.name || tenantPayload.tenant_name)) || 'Unknown';
    const apartment = tenantPayload && tenantPayload.tenant ? `${tenantPayload.tenant.apartment_number || tenantPayload.tenant.apartment || ''}${tenantPayload.tenant.floor ? ', ' + tenantPayload.tenant.floor + 'st Floor' : ''}${tenantPayload.tenant.building ? ', ' + tenantPayload.tenant.building : ''}`.replace(/(^,\s|,\s$)/, '').trim() : '';

    const rent = history.find(b => (b.bill_type || '').toLowerCase().includes('rent'))?.amount || (latestBill.bill_type === 'rent' ? latestBill.amount : 0);
    const electricBill = history.find(b => (b.bill_type || '').toLowerCase().includes('electric'));
    const waterBill = history.find(b => (b.bill_type || '').toLowerCase().includes('water'));

  const electricDisplay = electricBill ? `${formatMeterNumber(electricBill.previous_reading || '') || 100} - ${formatMeterNumber(electricBill.current_reading || '') || 150} = ${formatMeterNumber(Math.abs((Number(electricBill.current_reading || 150) - Number(electricBill.previous_reading || 100))))} x ${formatMeterNumber(electricBill.unit_rate || 14)}kwh = ${formatCurrency(electricBill.amount)}` : `100 - 150 = 50 x 14kwh = ${formatCurrency((50 * 14))}`;
  const waterDisplay = waterBill ? `${formatMeterNumber(waterBill.previous_reading || '') || 100} - ${formatMeterNumber(waterBill.current_reading || '') || 150} = ${formatMeterNumber(Math.abs((Number(waterBill.current_reading || 150) - Number(waterBill.previous_reading || 100))))} x ${formatMeterNumber(waterBill.unit_rate || 60)} = ${formatCurrency(waterBill.amount)}` : `100 - 150 = 50 x 60 = ${formatCurrency((50 * 60))}`;

    const total = Number(rent || 0) + Number(electricBill ? electricBill.amount : (50 * 14)) + Number(waterBill ? waterBill.amount : (50 * 60));

    return (
      <div>
        <div style={{ marginBottom: 8 }}><strong>Date:</strong> {dateStr}</div>
        <div style={{ marginBottom: 8 }}><strong>Tenant:</strong> {tenantName}</div>
        <div style={{ marginBottom: 8 }}><strong>Apartment:</strong> {apartment || 'N/A'}</div>
        <div style={{ marginBottom: 8 }}><strong>Rent:</strong> {formatCurrency(rent)}</div>
        <div style={{ marginBottom: 8 }}><strong>Electric:</strong> {electricDisplay}</div>
        <div style={{ marginBottom: 8 }}><strong>Water:</strong> {waterDisplay}</div>

        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700 }}>
          Total: {formatCurrency(total)} <span style={smallFormulaStyle}>({formatCurrency(rent)}+{formatCurrency(electricBill ? electricBill.amount : (50 * 14))}+{formatCurrency(waterBill ? waterBill.amount : (50 * 60))})</span>
        </div>
      </div>
    );
  };

  // helpers for sections
  const currentMonthBills = () => {
    const now = new Date();
    return history.filter(b => {
      if (!b.due_date) return false;
      const d = new Date(b.due_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (b.status || '').toLowerCase() !== 'paid';
    });
  };

  const pastDueBills = () => {
    const now = new Date();
    return history.filter(b => {
      if (!b.due_date) return false;
      const d = new Date(b.due_date);
      return (d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())) && (b.status || '').toLowerCase() !== 'paid';
    });
  };

  const paidBills = () => history.filter(b => (b.status || '').toLowerCase() === 'paid');

  // Refs + dynamic max-height for smooth accordion animation
  const pastRef = useRef(null);
  const paidRef = useRef(null);
  const [pastMax, setPastMax] = useState('0px');
  const [paidMax, setPaidMax] = useState('0px');

  useEffect(() => {
    // when show toggles or history updates, adjust max-height to content height
    const adjust = () => {
      if (pastRef.current) {
        setPastMax(showPastDue ? `${pastRef.current.scrollHeight}px` : '0px');
      }
      if (paidRef.current) {
        setPaidMax(showPaidHistory ? `${paidRef.current.scrollHeight}px` : '0px');
      }
    };
    // small timeout allows DOM to render child content before measuring
    const t = setTimeout(adjust, 40);
    return () => clearTimeout(t);
  }, [showPastDue, showPaidHistory, history]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div style={{ ...modalStyle, marginTop: 18, display: 'flex', flexDirection: 'column' }} role="dialog" aria-modal="true">
        {/* header (fixed inside modal) */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ margin: 0 }}>Tenant Billing Preview</h5>
          <button className="btn btn-ghost" onClick={() => onClose && onClose()}>Close</button>
        </div>

        {/* body (scrollable) */}
        <div style={{ overflowY: 'auto', padding: 16, flex: '1 1 auto' }}>
          <div style={{ paddingBottom: 8 }}>
            {loading ? <div className="text-muted">Loading...</div> : renderLatest()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Total Due</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{formatCurrency(totalDue)}</div>
          </div>

          <hr />

          <div style={{ paddingRight: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h6 style={{ margin: 0 }}>Billing</h6>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={selectAll} onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectAll(checked);
                    const now = new Date();
                    const curIds = history.filter(b => {
                      if (!b.due_date) return false;
                      const d = new Date(b.due_date);
                      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (b.status || '').toLowerCase() !== 'paid';
                    }).map(b => b.id);
                    setSelectedBills(checked ? new Set(curIds) : new Set());
                  }} />
                  <span className="small text-muted">Select All</span>
                </label>
                <button className="btn btn-success btn-sm" onClick={markSelectedAsPaid} disabled={loading || selectedBills.size === 0}>{loading ? 'Saving...' : 'Mark Selected as Paid'}</button>
              </div>
            </div>

            {/* Current Month */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Current Due (This Month)</div>
              {(() => {
                const cur = currentMonthBills();
                if (cur.length === 0) return <div className="text-muted">No bills due this month</div>;
                return cur.map(b => (
                  <div key={b.id} className={`d-flex justify-content-between align-items-center py-2 border-bottom ${b.status === 'paid' ? 'text-muted' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.status !== 'paid' && (
                        <input type="checkbox" checked={selectedBills.has(b.id)} onChange={(e) => {
                          const s = new Set(selectedBills);
                          if (e.target.checked) s.add(b.id); else s.delete(b.id);
                          setSelectedBills(s);
                          const curIds = currentMonthBills().map(bb => bb.id);
                          setSelectAll(curIds.every(id => s.has(id)));
                        }} />
                      )}
                      <div>
                        <div style={{ fontWeight: 700, textDecoration: b.status === 'paid' ? 'line-through' : 'none', color: b.status === 'paid' ? '#6b7280' : undefined }}>{b.bill_type || b.description || 'Bill'}</div>
                        <div className="small text-muted">Due: {b.due_date ? new Date(b.due_date).toLocaleDateString() : ''}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{formatMeterNumber(b.amount)}</div>
                      <div className="small text-muted">{b.status === 'paid' ? 'Paid' : ''}</div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Past Due */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowPastDue(s => !s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ transform: showPastDue ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}>▶</div>
                  <div style={{ fontWeight: 700 }}>Past Due Bills</div>
                </div>
                <div className="small text-muted">{showPastDue ? 'Hide' : 'Show'}</div>
              </div>
              <div style={{ overflow: 'hidden', transition: 'max-height 260ms ease', maxHeight: pastMax }}>
                <div ref={pastRef}>
                  {pastDueBills().length === 0 ? <div className="text-muted">No past due bills</div> : pastDueBills().map(b => (
                    <div key={b.id} className={`d-flex justify-content-between align-items-center py-2 border-bottom ${b.status === 'paid' ? 'text-muted' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {b.status !== 'paid' && (
                          <input type="checkbox" checked={selectedBills.has(b.id)} onChange={(e) => {
                            const s = new Set(selectedBills);
                            if (e.target.checked) s.add(b.id); else s.delete(b.id);
                            setSelectedBills(s);
                          }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{b.bill_type || b.description || 'Bill'}</div>
                          <div className="small text-muted">Due: {b.due_date ? new Date(b.due_date).toLocaleDateString() : ''}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{formatMeterNumber(b.amount)}</div>
                        <div className="small text-muted">{b.status === 'paid' ? 'Paid' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Paid History */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowPaidHistory(s => !s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ transform: showPaidHistory ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}>▶</div>
                  <div style={{ fontWeight: 700 }}>Paid Bills History</div>
                </div>
                <div className="small text-muted">{showPaidHistory ? 'Hide' : 'Show'}</div>
              </div>
              <div style={{ overflow: 'hidden', transition: 'max-height 260ms ease', maxHeight: paidMax }}>
                <div ref={paidRef}>
                  {paidBills().length === 0 ? <div className="text-muted">No paid bills</div> : paidBills().map(b => (
                    <div key={b.id} className="d-flex justify-content-between align-items-center py-2 border-bottom text-muted" style={{ opacity: 0.8 }}>
                      <div>
                        <div style={{ fontWeight: 700, textDecoration: 'line-through', color: '#6b7280' }}>{b.bill_type || b.description || 'Bill'}</div>
                        <div className="small text-muted">Paid on: {b.paid_at ? new Date(b.paid_at).toLocaleDateString() : (b.updated_at ? new Date(b.updated_at).toLocaleDateString() : '')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>{formatMeterNumber(b.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* footer (fixed inside modal) */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => onClose && onClose()}>Close</button>
          <button className="btn btn-success" onClick={() => markAsPaid(latestBill)} disabled={loading || !latestBill}>{loading ? 'Saving...' : 'Mark Latest as Paid'}</button>
        </div>
      </div>
    </div>
  );
};

export default ScanModal;
