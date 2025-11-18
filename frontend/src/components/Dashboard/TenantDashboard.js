import React, { useState, useEffect, useRef } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import QRCode from 'qrcode';
import { displayBillType } from '../../utils/billTypes';
import { formatMeterNumber } from '../../utils/numberFormat';

const TenantDashboard = () => {
  const [tenant, setTenant] = useState(null);
  const [bills, setBills] = useState([]);
  const [meterData, setMeterData] = useState({});
  const [loading, setLoading] = useState(true);
  const [tenantQRUrl, setTenantQRUrl] = useState("");
  const navigate = useNavigate();
  const socketRef = useRef(null);

  useEffect(() => {
    // on mount, ensure tenant token exists and load data
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/tenant-login');
      return;
    }

    const tenantData = JSON.parse(localStorage.getItem('tenant') || '{}');
    setTenant(tenantData);
  // load all data (tenant QR, bills, and meter devices)
    refreshAll(tenantData);

    const onStorage = (e) => {
      if (e.key === 'billsUpdated') {
        if (tenantData && tenantData.id) fetchBills(tenantData.id);
      }
    };
    const onEvent = () => { if (tenantData && tenantData.id) fetchBills(tenantData.id); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('billsUpdated', onEvent);

    return () => {
      // cleanup socket on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const setupSocketConnection = (apartmentId) => {
    // close previous socket if exists
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch (e) {}
      socketRef.current = null;
    }

    const socket = io('http://localhost:5001');
    socketRef.current = socket;

    socket.emit('join-apartment', apartmentId);

    socket.on('meter-update', (data) => {
      setMeterData(prev => ({
        ...prev,
        [data.deviceType || data.device_type]: data
      }));
    });
  };

  const fetchBills = async (tenantId) => {
    try {
      const response = await axios.get(`/api/bills?tenantId=${tenantId}`);
      const data = Array.isArray(response.data) ? response.data : [];
      // filter server results defensively to only include bills for this tenant
      const filtered = data.filter(b => {
        try {
          const tid = tenantId;
          if (!tid) return false;
          // common field names used in different backends
          if (b.tenant_id && String(b.tenant_id) === String(tid)) return true;
          if (b.tenantId && String(b.tenantId) === String(tid)) return true;
          if (b.tenant && (b.tenant.id && String(b.tenant.id) === String(tid))) return true;
          if (b.tenant && (b.tenant.tenant_id && String(b.tenant.tenant_id) === String(tid))) return true;
          return false;
        } catch (e) {
          return false;
        }
      });
      setBills(filtered);
    } catch (err) {
      console.error('Error fetching bills:', err);
    }
  };

  // helper: pick a numeric amount from bill object
  const getBillAmount = (bill) => {
    return bill.amount || bill.total || bill.amt || bill.value || 0;
  };

  const parseBillDate = (bill) => {
    const d = bill.due_date || bill.date || bill.bill_date || bill.created_at || bill.timestamp;
    return d ? new Date(d) : null;
  };

  const isSameMonth = (d1, d2) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
  };

  const currentMonthBills = () => {
    const now = new Date();
    return bills.filter(b => {
      const dt = parseBillDate(b);
      if (!dt) return false;
      const c = isSameMonth(dt, now);
      // only include main bill types requested
      const t = (b.bill_type || '').toLowerCase();
      const canonical = t.includes('rent') ? 'rent' : t.includes('water') ? 'water' : (t.includes('electric') ? 'electricity' : 'other');
      return c && ['rent','water','electricity'].includes(canonical);
    });
  };

  const billingHistory = () => {
    const now = new Date();
    return bills
      .filter(b => {
        const dt = parseBillDate(b);
        if (!dt) return true; // keep ones without dates in history
        return !isSameMonth(dt, now);
      })
      .sort((a,b) => {
        const da = parseBillDate(a) || new Date(0);
        const db = parseBillDate(b) || new Date(0);
        return db - da; // recent first
      });
  };

  const fetchTenantQR = async (tenantData) => {
    if (!tenantData || !tenantData.tenant_id) return setTenantQRUrl('');
    try {
      const r = await axios.get(`/api/qr-tokens/${tenantData.tenant_id}`);
      const token = r.data && r.data.token ? r.data.token : null;
      if (!token) return setTenantQRUrl('');
      const dataUrl = await QRCode.toDataURL(token, { width: 120 });
      setTenantQRUrl(dataUrl);
    } catch (e) {
      console.error('Failed to generate tenant QR', e);
      setTenantQRUrl('');
    }
  };

  const refreshAll = async (tenantDataArg) => {
    setLoading(true);
    const tenantData = tenantDataArg || JSON.parse(localStorage.getItem('tenant') || '{}');
    setTenant(tenantData);
    await Promise.all([
      fetchTenantQR(tenantData),
      tenantData.id ? fetchBills(tenantData.id) : Promise.resolve(),
      tenantData.apartment_id ? Promise.resolve().then(() => setupSocketConnection(tenantData.apartment_id)) : Promise.resolve()
    ]).catch(err => console.error('Error during refreshAll:', err));
    setLoading(false);
  };

  const getBillStatus = (dueDate, status) => {
    if (status === 'paid') return { text: 'Paid', class: 'success' };
    if (status === 'overdue') return { text: 'Overdue', class: 'danger' };
    
    const due = new Date(dueDate);
    const today = new Date();
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return { text: 'Overdue', class: 'danger' };
    if (diffDays <= 3) return { text: 'Due Soon', class: 'warning' };
    return { text: 'Pending', class: 'info' };
  };

  if (loading) {
  return <div className="container-fluid"><div className="text-center">Loading...</div></div>;
  }

  if (!tenant) {
  return <div className="container-fluid"><div className="text-center">No tenant data found</div></div>;
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-4">
            <h1>Tenant Dashboard</h1>
            <div>
              <button className="btn btn-outline-secondary me-2" onClick={() => refreshAll()}>
                Refresh
              </button>
              <button className="btn btn-outline-secondary" onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('tenant');
                navigate('/');
              }}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Tenant Information</h5>
            </div>
            <div className="card-body d-flex align-items-start">
              <div style={{ flex: 1 }}>
                <p><strong>Name:</strong> {tenant.name}</p>
                <p><strong>Tenant ID:</strong> {tenant.tenant_id}</p>
                <p><strong>Email:</strong> {tenant.email}</p>
                <p><strong>Phone:</strong> {tenant.phone}</p>
                <p><strong>Apartment:</strong> {tenant.apartment_id}</p>
              </div>
              <div style={{ width: 140, marginLeft: 16, textAlign: 'center' }}>
                {tenantQRUrl && (
                  <img src={tenantQRUrl} alt="Tenant QR Code" className="img-fluid mb-2" style={{ maxWidth: 120 }} />
                )}
                <div className="text-muted small">Scan for login</div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Meter Device Status</h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-6 text-center">
                  <p><strong>Water</strong></p>
                  <span className={"badge " + (meterData.water ? 'bg-success' : 'bg-secondary')}>
                    {meterData.water ? 'Active' : 'Offline'}
                  </span>
                </div>
                <div className="col-6 text-center">
                  <p><strong>Electricity</strong></p>
                  <span className={"badge " + (meterData.electricity ? 'bg-success' : 'bg-secondary')}>
                    {meterData.electricity ? 'Active' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-6 mb-4">
          <div className="card">
            <div className="card-header">
              <h5>Present Bill</h5>
            </div>
            <div className="card-body">
              {currentMonthBills().length === 0 ? (
                <p className="text-muted">No current month bills found</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Bill Type</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentMonthBills().map(bill => {
                        const dt = parseBillDate(bill);
                        const status = getBillStatus(dt || bill.due_date, bill.status);
                        const tenantPaused = bill.tenant_is_paused || bill.tenant_status === 'paused' || (tenant && (tenant.is_paused || tenant.status === 'paused'));
                        return (
                          <tr key={bill.id || `${bill.bill_type}-${bill.due_date}` } style={{ background: tenantPaused ? '#f8f9fa' : 'transparent', color: tenantPaused ? '#6c757d' : 'inherit' }}>
                            <td>
                              <span className="badge bg-secondary">
                                {displayBillType(bill.bill_type)}
                              </span>
                            </td>
                            <td>{formatMeterNumber(getBillAmount(bill))}</td>
                            <td>{dt ? dt.toLocaleDateString() : '—'}</td>
                            <td>
                              <span className={"badge " + (tenantPaused ? 'bg-warning text-dark' : (status.class === 'success' ? 'bg-success' : status.class === 'danger' ? 'bg-danger' : status.class === 'warning' ? 'bg-warning' : 'bg-secondary'))}>
                                {tenantPaused ? 'paused' : status.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-6 mb-4">
          <div className="card">
            <div className="card-header">
              <h5>Billing History</h5>
            </div>
            <div className="card-body">
              {billingHistory().length === 0 ? (
                <p className="text-muted">No billing history found</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Bill Type</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingHistory().map(bill => {
                        const dt = parseBillDate(bill);
                        const status = getBillStatus(dt || bill.due_date, bill.status);
                        const tenantPaused = bill.tenant_is_paused || bill.tenant_status === 'paused' || (tenant && (tenant.is_paused || tenant.status === 'paused'));
                        return (
                          <tr key={bill.id || `${bill.bill_type}-${bill.due_date}` } style={{ background: tenantPaused ? '#f8f9fa' : 'transparent', color: tenantPaused ? '#6c757d' : 'inherit' }}>
                            <td>
                              <span className="badge bg-secondary">
                                {displayBillType(bill.bill_type)}
                              </span>
                            </td>
                            <td>{formatMeterNumber(getBillAmount(bill))}</td>
                            <td>{dt ? dt.toLocaleDateString() : '—'}</td>
                            <td>
                              <span className={"badge " + (tenantPaused ? 'bg-warning text-dark' : (status.class === 'success' ? 'bg-success' : status.class === 'danger' ? 'bg-danger' : status.class === 'warning' ? 'bg-warning' : 'bg-secondary'))}>
                                {tenantPaused ? 'paused' : status.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantDashboard;
