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
  const [topDevices, setTopDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantQRUrl, setTenantQRUrl] = useState("");
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const tenantCardRef = useRef(null);
  const meterCardRef = useRef(null);

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

  // adjust meter card height to match tenant info card
  useEffect(() => {
    const applyHeight = () => {
      try {
        if (tenantCardRef.current && meterCardRef.current) {
          const h = tenantCardRef.current.offsetHeight;
          meterCardRef.current.style.minHeight = h + 'px';
        }
      } catch (e) {}
    };
    // apply on mount and when window resizes
    applyHeight();
    window.addEventListener('resize', applyHeight);
    return () => window.removeEventListener('resize', applyHeight);
  }, [tenant, loading]);

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
      // normalize incoming device update to keys 'water' or 'electricity'
      const deviceTypeRaw = data.deviceType || data.device_type || data.type || data.meter_type || '';
      const raw = String(deviceTypeRaw).toLowerCase();
      let key = deviceTypeRaw;
      if (raw.includes('elect')) key = 'electricity';
      else if (raw.includes('water')) key = 'water';
      else if (data.device_id && data.device_id.toString().toLowerCase().includes('elec')) key = 'electricity';
      else if (data.device_id && data.device_id.toString().toLowerCase().includes('wat')) key = 'water';

      const payload = {
        reading: data.present_reading || data.current_reading || data.reading || data.presentReading || null,
        lastUpdated: data.last_reading_date || data.last_updated || data.reading_date || data.timestamp || null,
        raw: data
      };

      setMeterData(prev => ({
        ...prev,
        [key]: payload
      }));
    });
  };

  const fetchMeterReadings = async (tenantData) => {
    if (!tenantData) return;
    try {
      const resp = await axios.get('/api/meter-devices');
      const devices = Array.isArray(resp.data) ? resp.data : (resp.data && resp.data.devices ? resp.data.devices : []);
      const aptId = tenantData.apartment_id || tenantData.apartment || tenantData.apartment_number || null;
      const filtered = devices.filter(d => {
        try {
          if (!aptId) return false;
          if (String(d.apartment_id) === String(aptId)) return true;
          if (String(d.apartment_number) === String(aptId)) return true;
          return false;
        } catch (e) { return false; }
      });

      const next = {};
      filtered.forEach(d => {
        const t = (d.meter_type || d.type || '').toString().toLowerCase();
        const key = t.includes('elect') ? 'electricity' : (t.includes('water') ? 'water' : null);
        if (!key) return;
        next[key] = {
          reading: d.present_reading || d.current_reading || d.presentReading || d.reading || null,
          lastUpdated: d.last_reading_date || d.last_updated || d.reading_date || null,
          raw: d
        };
      });

      setMeterData(prev => ({ ...prev, ...next }));
    } catch (err) {
      console.warn('Failed to fetch meter devices for tenant:', err);
    }
  };

  const fetchTopDevices = async (tenantData) => {
    if (!tenantData) return setTopDevices([]);
    try {
      const tenantId = tenantData.id || tenantData.tenant_id;
      const aptId = tenantData.apartment_id || tenantData.apartment || tenantData.apartment_number;

      // load devices to build a lookup map (used by BillManagement)
      const devResp = await axios.get('/api/meter-devices');
      const devices = Array.isArray(devResp.data) ? devResp.data : (devResp.data && devResp.data.devices ? devResp.data.devices : []);
      const devMap = {};
      devices.forEach(d => {
        if (!d) return;
        if (d.device_id) devMap[String(d.device_id)] = d;
        if (d.id) devMap[String(d.id)] = d;
        if (d.apartment_number) devMap[`apt:${String(d.apartment_number)}`] = d;
        if (d.apartment_id) devMap[`aptid:${String(d.apartment_id)}`] = d;
      });

      // Try several ways to fetch meter history. Some backends filter by different query names.
      const tryFetch = async (params) => {
        const q = new URLSearchParams(params || {});
        const url = '/api/meter-devices/meter-history' + (q.toString() ? ('?' + q.toString()) : '');
        const r = await axios.get(url);
        // support multiple envelope shapes: array, { rows: [...] }, { data: [...] }, { history: [...] }
        if (Array.isArray(r.data)) return r.data;
        if (r.data && Array.isArray(r.data.rows)) return r.data.rows;
        if (r.data && Array.isArray(r.data.data)) return r.data.data;
        if (r.data && Array.isArray(r.data.history)) return r.data.history;
        return [];
      };

      let rows = await tryFetch({});
      if ((!rows || rows.length === 0) && tenantId) rows = await tryFetch({ tenant: tenantId });
      if ((!rows || rows.length === 0) && tenantId) rows = await tryFetch({ tenantId: tenantId });
      if ((!rows || rows.length === 0) && aptId) rows = await tryFetch({ apartment: aptId });
      if ((!rows || rows.length === 0) && aptId) rows = await tryFetch({ apartment_id: aptId });
      if ((!rows || rows.length === 0) && aptId) rows = await tryFetch({ apartmentNumber: aptId });

      // build a set of device ids that belong to this tenant (by apartment) to help matching history rows
      const tenantDeviceIds = new Set();
      devices.forEach(d => {
        try {
          const matchesApt = aptId && (String(d.apartment_id) === String(aptId) || String(d.apartment_number) === String(aptId) || String(d.apartment) === String(aptId));
          if (matchesApt) {
            if (d.device_id) tenantDeviceIds.add(String(d.device_id));
            if (d.id) tenantDeviceIds.add(String(d.id));
          }
        } catch (e) {}
      });

      // enrich rows with normalized fields and attach matched device when possible
      const enriched = rows.map(r => {
        const prev = r.previous_reading || r.previous || r.prev || r.previousReading || r.previous_reading_value || null;
        const pres = r.present_reading || r.present || r.presentReading || r.present_reading_value || r.current_reading || r.reading || null;
        const consumption = (r.consumption != null) ? r.consumption : ((pres != null && prev != null) ? (Number(pres) - Number(prev)) : null);
        const rate = r.rate || r.unit_rate || r.price || r.rate_per_unit || null;
        const total = r.total_cost || r.total || r.amount || ((consumption != null && rate != null) ? (Number(consumption) * Number(rate)) : null);
        const updated = r.last_reading_date || r.last_updated || r.reading_date || r.timestamp || null;
  const matchedDevice = r.device && r.device.device_id ? devMap[String(r.device.device_id)] : (r.device_id ? devMap[String(r.device_id)] : (r.id ? devMap[String(r.id)] : (r.apartment_number ? devMap[`apt:${String(r.apartment_number)}`] : null)));
        const type = r.meter_type || r.type || (matchedDevice && (matchedDevice.meter_type || matchedDevice.type)) || '';
        return {
          raw: r,
          previous: prev,
          present: pres,
          consumption,
          rate,
          total,
          updated,
          type,
          device: matchedDevice
        };
      });

      // filter to ensure rows belong to this tenant's devices (defensive)
  const filtered = enriched.filter(e => {
        const r = e.raw;
        try {
          // check tenant ids if present
          if (tenantId) {
            if (r.tenant && (r.tenant.id || r.tenant.tenant_id)) {
              const tid = r.tenant.id || r.tenant.tenant_id;
              if (String(tid) === String(tenantId)) return true;
            }
            if (r.tenant_id && String(r.tenant_id) === String(tenantId)) return true;
            if (r.tenantId && String(r.tenantId) === String(tenantId)) return true;
          }
          // check device/apartment relations
          if (aptId) {
            if (e.device && (String(e.device.apartment_id) === String(aptId) || String(e.device.apartment_number) === String(aptId))) return true;
            if (r.apartment_id && String(r.apartment_id) === String(aptId)) return true;
            if (r.apartment_number && String(r.apartment_number) === String(aptId)) return true;
          }
          // match by device id if we have tenant device ids
          if (tenantDeviceIds.size > 0) {
            const cand = (r.device_id || (r.device && (r.device.device_id || r.device.id)) || r.id);
            if (cand && tenantDeviceIds.has(String(cand))) return true;
          }
          // fallback: keep if no clear tenant/apartment info
          if (!tenantId && !aptId) return true;

          // last-resort heuristic: string-match tenantId or aptId inside the raw row
          try {
            const s = JSON.stringify(r || {}).toLowerCase();
            if (tenantId && String(s).includes(String(tenantId).toLowerCase())) return true;
            if (aptId && String(s).includes(String(aptId).toLowerCase())) return true;
          } catch (e) {}

          return false;
        } catch (e) { return false; }
      });

      // pick the most recent row per meter type (water, electricity)
      const byType = {};
      filtered.forEach(e => {
        const rawType = (e.type || '').toString().toLowerCase();
        const key = rawType.includes('elect') ? 'electricity' : (rawType.includes('water') ? 'water' : null);
  const updatedTs = new Date((e.updated) || (e.raw && (e.raw.last_reading_date || e.raw.last_updated || e.raw.timestamp || e.raw.reading_date)) || 0).getTime();
        if (!key) return;
  if (!byType[key] || updatedTs > new Date((byType[key].updated) || (byType[key].raw && (byType[key].raw.last_reading_date || byType[key].raw.last_updated || byType[key].raw.timestamp || byType[key].raw.reading_date)) || 0).getTime()) {
          // normalize updated to an ISO string or null
          e.updated = e.updated ? new Date(e.updated).toISOString() : (e.raw && (e.raw.last_reading_date || e.raw.last_updated || e.raw.timestamp || e.raw.reading_date) ? new Date(e.raw.last_reading_date || e.raw.last_updated || e.raw.timestamp || e.raw.reading_date).toISOString() : null);
          byType[key] = e;
        }
      });

      const result = [];
      if (byType.water) result.push(byType.water);
      if (byType.electricity) result.push(byType.electricity);

      setTopDevices(result);
    } catch (e) {
      console.warn('Failed to fetch top devices:', e);
      setTopDevices([]);
    }
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

  // Present Bill: only bills for current month with status Pending and younger than 30 days
  const presentPendingBills = () => {
    const now = new Date();
    return bills.filter(b => {
      const dt = parseBillDate(b);
      if (!dt) return false;
      // must be current month
      if (!isSameMonth(dt, now)) return false;

      // compute age and ignore if older than or equal to 30 days (these become Overdue)
      const ageMs = now.getTime() - dt.getTime();
      const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (days >= 30) return false;

      // exclude bills that are already paid/settled
      const st = (b.status || '').toString().toLowerCase();
      if (st === 'paid' || st === 'settled') return false;

      // only include main bill types
      const t = (b.bill_type || '').toString().toLowerCase();
      const canonical = t.includes('rent') ? 'rent' : t.includes('water') ? 'water' : (t.includes('electric') ? 'electricity' : 'other');
      return ['rent','water','electricity'].includes(canonical);
    });
  };

  // Overdue bills: bills from previous months with status Overdue
  const overduePastBills = () => {
    const now = new Date();
    return bills.filter(b => {
      const dt = parseBillDate(b);
      if (!dt) return false; // cannot determine age
      // exclude current month
      if (isSameMonth(dt, now)) return false;

      // only include bills older than or equal to ~30 days
      const ageMs = now.getTime() - dt.getTime();
      const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (days < 30) return false;

      // exclude bills that are already paid/settled
      const st = (b.status || '').toString().toLowerCase();
      if (st === 'paid' || st === 'settled') return false;

      // include only main bill types
      const t = (b.bill_type || '').toString().toLowerCase();
      const canonical = t.includes('rent') ? 'rent' : t.includes('water') ? 'water' : (t.includes('electric') ? 'electricity' : 'other');
      return ['rent','water','electricity'].includes(canonical);
    }).sort((a,b) => (parseBillDate(b) || new Date(0)) - (parseBillDate(a) || new Date(0)));
  };

  // Payment History: all tenant payments (status paid)
  const paymentHistory = () => {
    return bills.filter(b => {
      try {
        const st = (b.status || '').toString().toLowerCase();
        return st === 'paid' || st === 'settled' || (b.payment && (b.payment.status === 'paid' || b.payment.status === 'settled'));
      } catch (e) { return false; }
    }).sort((a,b) => (parseBillDate(b) || new Date(0)) - (parseBillDate(a) || new Date(0)));
  };

  const fetchTenantQR = async (tenantData) => {
    if (!tenantData || !tenantData.tenant_id) return setTenantQRUrl('');
    try {
      // Try to fetch QR data for tenant (qr generator endpoint)
      const r = await axios.get(`/api/qr-codes/${tenantData.tenant_id}`);
      // If backend returned a ready-to-use image/data URL, use it
      if (r.data && (r.data.qr_url || r.data.qr_code || r.data.qr)) {
        setTenantQRUrl(r.data.qr_url || r.data.qr_code || r.data.qr);
        return;
      }

      // If backend returned tenant info only, build the same QR payload the generator uses
      const tenantInfo = r.data || {};
      const qrPayload = {
        tenant_id: tenantInfo.tenant_id || tenantData.tenant_id || tenantData.id,
        name: tenantInfo.name || tenantData.name || tenantData.fullname || '',
        apartment_id: tenantInfo.apartment_id || tenantData.apartment_id || tenantData.apartment || '',
        portal_url: '/tenant/'
      };
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), { width: 140 });
      setTenantQRUrl(qrDataUrl);
    } catch (e) {
      console.error('Failed to load/generate tenant QR', e);
      // fallback: attempt to create a small token QR from tenant id
      try {
        const fallbackPayload = JSON.stringify({ tenant_id: tenantData.tenant_id || tenantData.id });
        const fallbackDataUrl = await QRCode.toDataURL(fallbackPayload, { width: 120 });
        setTenantQRUrl(fallbackDataUrl);
      } catch (e2) {
        setTenantQRUrl('');
      }
    }
  };

  const refreshAll = async (tenantDataArg) => {
    setLoading(true);
    const tenantData = tenantDataArg || JSON.parse(localStorage.getItem('tenant') || '{}');
    setTenant(tenantData);
    await Promise.all([
      fetchTenantQR(tenantData),
      tenantData.id ? fetchBills(tenantData.id) : Promise.resolve(),
  tenantData.apartment_id ? Promise.resolve().then(() => setupSocketConnection(tenantData.apartment_id)) : Promise.resolve(),
  fetchMeterReadings(tenantData),
  fetchTopDevices(tenantData)
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
          <div className="card" ref={tenantCardRef}>
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
                <p><strong>Move-In Date:</strong> {tenant.move_in_date || tenant.moveInDate ? new Date(tenant.move_in_date || tenant.moveInDate).toLocaleDateString() : '—'}</p>
                <p><strong>Status:</strong> {tenant.status ? tenant.status : (tenant.active === false ? 'inactive' : 'active')}</p>
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
          <div className="card" ref={meterCardRef}>
            <div className="card-header">
              <h5>Meter Device Status</h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-6 text-center">
                  <p><strong>Water</strong></p>
                  {meterData.water && meterData.water.reading != null ? (
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatMeterNumber(meterData.water.reading)}</div>
                      <div className="text-muted small">{meterData.water.lastUpdated ? new Date(meterData.water.lastUpdated).toLocaleString() : 'No timestamp'}</div>
                    </div>
                  ) : (
                    <div className="text-muted">No reading</div>
                  )}
                </div>
                <div className="col-6 text-center">
                  <p><strong>Electricity</strong></p>
                  {meterData.electricity && meterData.electricity.reading != null ? (
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatMeterNumber(meterData.electricity.reading)}</div>
                      <div className="text-muted small">{meterData.electricity.lastUpdated ? new Date(meterData.electricity.lastUpdated).toLocaleString() : 'No timestamp'}</div>
                    </div>
                  ) : (
                    <div className="text-muted">No reading</div>
                  )}
                </div>
              </div>
              {/* Top 3 latest device updates for this tenant */}
              <div className="mt-4">
                <h6 className="mb-2">Latest Device Updates</h6>
                {topDevices.length === 0 ? (
                  <div className="text-muted small">No recent device updates</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Previous</th>
                          <th>Present</th>
                          <th>Consumption</th>
                          <th>Rate</th>
                          <th>Total Cost</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topDevices.map((d, idx) => {
                          // d is enriched: { previous, present, consumption, rate, total, updated, type, device, raw }
                          const prev = d.previous != null ? d.previous : '';
                          const pres = d.present != null ? d.present : '';
                          const consumption = d.consumption != null ? d.consumption : '';
                          const rate = d.rate != null ? d.rate : '';
                          const total = d.total != null ? d.total : '';
                          const updated = d.updated || null;
                          const type = d.type || '';
                          const key = (d.device && (d.device.id || d.device.device_id)) || (d.raw && (d.raw.id || d.raw.device_id)) || idx;
                          return (
                            <tr key={key}>
                              <td>{type || '\u2014'}</td>
                              <td>{prev !== '' ? prev : '\u2014'}</td>
                              <td>{pres !== '' ? pres : '\u2014'}</td>
                              <td>{consumption !== '' ? formatMeterNumber(consumption) : '\u2014'}</td>
                              <td>{rate !== '' ? rate : '\u2014'}</td>
                              <td>{total !== '' ? formatMeterNumber(total) : '\u2014'}</td>
                              <td className="text-muted small">{updated ? new Date(updated).toLocaleString() : '\u2014'}</td>
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

      <div className="row">
        <div className="col-md-6 mb-4">
          <div className="card">
            <div className="card-header">
              <h5>Present Bill</h5>
            </div>
            <div className="card-body">
              {presentPendingBills().length === 0 ? (
                <p className="text-muted">No pending bills for the current month</p>
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
                      {presentPendingBills().map(bill => {
                        const dt = parseBillDate(bill);
                        // Always display Pending for items in this table
                        const status = { text: 'Pending', class: 'info' };
                        const tenantActive = (bill.tenant_status || (tenant && tenant.status)) === 'active';
                        return (
                          <tr key={bill.id || `${bill.bill_type}-${bill.due_date}` } style={{ background: !tenantActive ? '#f8f9fa' : 'transparent', color: !tenantActive ? '#6c757d' : 'inherit' }}>
                            <td>
                              <span className="badge bg-secondary">
                                {displayBillType(bill.bill_type)}
                              </span>
                            </td>
                            <td>{formatMeterNumber(getBillAmount(bill))}</td>
                            <td>{dt ? dt.toLocaleDateString() : '—'}</td>
                            <td>
                              <span className={"badge " + (!tenantActive ? 'bg-secondary' : 'bg-info')}>
                                {status.text}
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
              <h5>Overdue</h5>
            </div>
            <div className="card-body">
              {overduePastBills().length === 0 ? (
                <p className="text-muted">No overdue bills from previous months</p>
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
                      {overduePastBills().map(bill => {
                        const dt = parseBillDate(bill);
                        // Always display Overdue for items in this table
                        const status = { text: 'Overdue', class: 'danger' };
                        const tenantActive = (bill.tenant_status || (tenant && tenant.status)) === 'active';
                        return (
                          <tr key={bill.id || `${bill.bill_type}-${bill.due_date}` } style={{ background: !tenantActive ? '#f8f9fa' : 'transparent', color: !tenantActive ? '#6c757d' : 'inherit' }}>
                            <td>
                              <span className="badge bg-secondary">
                                {displayBillType(bill.bill_type)}
                              </span>
                            </td>
                            <td>{formatMeterNumber(getBillAmount(bill))}</td>
                            <td>{dt ? dt.toLocaleDateString() : '—'}</td>
                            <td>
                              <span className={"badge " + (!tenantActive ? 'bg-secondary' : 'bg-danger')}>
                                {status.text}
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

      <div className="row">
        <div className="col-12 d-flex justify-content-center">
          <div className="card w-100">
            <div className="card-header">
              <h5>Payment History</h5>
            </div>
            <div className="card-body">
              {paymentHistory().length === 0 ? (
                <p className="text-muted">No payment history found</p>
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
                      {paymentHistory().map(bill => {
                        const dt = parseBillDate(bill);
                        const status = getBillStatus(dt || bill.due_date, bill.status);
                        const tenantActive = (bill.tenant_status || (tenant && tenant.status)) === 'active';
                        return (
                          <tr key={bill.id || `${bill.bill_type}-${bill.due_date}` } style={{ background: !tenantActive ? '#f8f9fa' : 'transparent', color: !tenantActive ? '#6c757d' : 'inherit' }}>
                            <td>
                              <span className="badge bg-secondary">
                                {displayBillType(bill.bill_type)}
                              </span>
                            </td>
                            <td>{formatMeterNumber(getBillAmount(bill))}</td>
                            <td>{dt ? dt.toLocaleDateString() : '—'}</td>
                            <td>
                              <span className={"badge " + (!tenantActive ? 'bg-secondary' : (status.class === 'success' ? 'bg-success' : status.class === 'danger' ? 'bg-danger' : status.class === 'warning' ? 'bg-warning' : 'bg-secondary'))}>
                                {status.text}
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
