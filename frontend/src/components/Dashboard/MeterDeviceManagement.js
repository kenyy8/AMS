import React, { useEffect, useState } from 'react';
// styles consolidated into App.css
import { createPortal } from 'react-dom';
import axios from '../../axiosConfig';
// displayBillType not used in this component
import { showToast } from '../../toastService';
import { formatMeterNumber, formatCurrencyPeso } from '../../utils/numberFormat';
// QR generation removed from Meter device management; QR handled in QRCodeGenerator component

const MeterDeviceManagement = () => {
  // navigation not required in this component
  const [devices, setDevices] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [tenants, setTenants] = useState([]);
  // const [tenantBills, setTenantBills] = useState([]); // Removed tenant bills state
  // Top-level monthly rates (editable)
  const [electricityRate, setElectricityRate] = useState(0);
  const [waterRate, setWaterRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const todayIso = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({ apartment_id: '', apartment_floor: '', apartment_number: '', apartment_building: '', meter_type: 'Electricity Meter', type: 'meter', previous_reading: '', present_reading: '', reading_date: todayIso });
  // QR generation state removed

  const refresh = async () => {
    try {
      // fetch devices, apartments, and tenants in parallel so we can enrich device rows
      const [d, a, t] = await Promise.all([
        axios.get('/api/meter-devices'),
        axios.get('/api/apartments'),
        axios.get('/api/tenants')
      ]);
      // backend may return { devices, pairs } or plain array
      const payload = d.data && d.data.devices ? d.data.devices : d.data;
      // persist to localStorage so UI can recover if backend is down
      try { localStorage.setItem('meterDevices', JSON.stringify(d.data || [])); } catch (e) {}
      setApartments(a.data || []);
      setTenants(t.data || []);
      // enrich devices with tenant_name and apartment_number where possible
      const enriched = (payload || []).map(dev => {
        const aptId = dev.apartment_id || dev.apartmentId || (dev.apartment_id === 0 ? dev.apartment_id : null);
        const tenant = (t.data || []).find(x => String(x.apartment_id) === String(aptId) || String(x.id) === String(aptId));
        const apartment = (a.data || []).find(x => String(x.id) === String(aptId));
        // build a display string Floor | Number | Building when apartment record available
        const apartmentDisplay = apartment ? `${apartment.floor || ''}${apartment.floor ? ' | ' : ''}${apartment.apartment_number || apartment.number || ''}${(apartment.building || '') ? ' | ' + apartment.building : ''}` : (dev.apartment_number || dev.apartment_number === 0 ? String(dev.apartment_number) : null);
        return {
          ...dev,
          tenant_name: dev.tenant_name || (tenant && tenant.name) || dev.tenant_name || null,
          apartment_number: apartmentDisplay
        };
      });
      setDevices(enriched);
    } catch (e) {
      console.warn('Failed to fetch devices from API, falling back to localStorage', e);
      try {
        const raw = localStorage.getItem('meterDevices');
        const saved = raw ? JSON.parse(raw) : [];
        // try to enrich saved devices with known tenants/apartments if available
        let enrichedSaved = saved || [];
        try {
          const t = await axios.get('/api/tenants');
          const a = await axios.get('/api/apartments');
          enrichedSaved = (enrichedSaved || []).map(dev => {
            const aptId = dev.apartment_id || dev.apartmentId || null;
            const tenant = (t.data || []).find(x => String(x.apartment_id) === String(aptId) || String(x.id) === String(aptId));
            const apartment = (a.data || []).find(x => String(x.id) === String(aptId));
            const apartmentDisplay = apartment ? `${apartment.floor || ''}${apartment.floor ? ' | ' : ''}${apartment.apartment_number || apartment.number || ''}${(apartment.building || '') ? ' | ' + apartment.building : ''}` : (dev.apartment_number || '');
            return {
              ...dev,
              tenant_name: dev.tenant_name || (tenant && tenant.name) || null,
              apartment_number: apartmentDisplay
            };
          });
        } catch (inner) {}
        setDevices(enrichedSaved || []);
      } catch (pe) {
        setDevices([]);
      }
      // still try to load apartments/tenants separately
      try {
        const a = await axios.get('/api/apartments');
        setApartments(a.data);
      } catch (ae) { setApartments([]); }
      try {
        const t = await axios.get('/api/tenants');
        setTenants(t.data);
      } catch (te) { setTenants([]); }
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await refresh();
      } catch (e) {
        setError('Failed to load devices');
      } finally {
        setLoading(false);
      }
    };
    load();
    // optional auto-refresh: refresh devices every 15 seconds
    const poll = setInterval(() => { try { refresh(); } catch(e){} }, 15000);
    return () => { clearInterval(poll); };
  }, []);

  // Listen for cross-tab/local updates when tenants or devices change so UI can refresh instantly
  useEffect(() => {
    const handler = (e) => {
      if (!e) return;
      try {
        const key = e.key;
        if (!key) return;
        if (key === 'meterDevicesUpdated' || key === 'apartmentsUpdated' || key === 'billsUpdated') {
          try { refresh(); } catch (re) {}
        }
      } catch (er) {}
    };
    window.addEventListener('storage', handler);
    // fallback: poll localStorage flag to catch same-tab updates
    let last = localStorage.getItem('meterDevicesUpdated') || '';
    const pollFlag = setInterval(() => {
      try {
        const cur = localStorage.getItem('meterDevicesUpdated') || '';
        if (cur && cur !== last) { last = cur; try { refresh(); } catch(e){} }
      } catch (e) {}
    }, 2500);
    return () => { window.removeEventListener('storage', handler); clearInterval(pollFlag); };
  }, []);

  // load persistent rates from localStorage and try backend
  useEffect(() => {
    const loadRates = async () => {
      try {
        // try localStorage first
        const e = localStorage.getItem('electricityRate');
        const w = localStorage.getItem('waterRate');
        if (e !== null) setElectricityRate(Number(e));
        if (w !== null) setWaterRate(Number(w));
        // try backend rates if available
        try {
          const r = await axios.get('/api/meter-devices/settings/rates');
          if (r && r.data) {
            setElectricityRate(Number(r.data.electricity_rate || r.data.electricity_rate === 0 ? r.data.electricity_rate : r.data.electricityRate || 0));
            setWaterRate(Number(r.data.water_rate || r.data.water_rate === 0 ? r.data.water_rate : r.data.waterRate || 0));
            localStorage.setItem('electricityRate', String(Number(r.data.electricity_rate || r.data.electricity_rate === 0 ? r.data.electricity_rate : r.data.electricityRate || 0)));
            localStorage.setItem('waterRate', String(Number(r.data.water_rate || r.data.water_rate === 0 ? r.data.water_rate : r.data.waterRate || 0)));
          }
        } catch (be) {
          // ignore backend failures
        }
      } catch (err) {
        // ignore
      }
    };
    loadRates();
  }, []);

  const saveRates = async (eRate, wRate) => {
    try {
      localStorage.setItem('electricityRate', String(eRate));
      localStorage.setItem('waterRate', String(wRate));
      // attempt to persist to backend if endpoint exists
      try {
        await axios.post('/api/settings/rates', { electricityRate: eRate, waterRate: wRate });
      } catch (be) {
        // ignore backend persistence failures
      }
    } catch (err) {
      // ignore
    }
  };

  // editable/collapsible rates UI state
  // eslint-disable-next-line no-unused-vars
  // eslint-disable-next-line no-unused-vars
  const [editingRates, setEditingRates] = useState(false);
  const [tempElectricity, setTempElectricity] = useState(electricityRate);
  const [tempWater, setTempWater] = useState(waterRate);

  useEffect(() => {
    setTempElectricity(electricityRate);
    setTempWater(waterRate);
  }, [electricityRate, waterRate]);

  // eslint-disable-next-line no-unused-vars
  const startEditRates = () => setEditingRates(true);
  // eslint-disable-next-line no-unused-vars
  const cancelEditRates = () => { setTempElectricity(electricityRate); setTempWater(waterRate); setEditingRates(false); };
  const confirmSaveRates = async () => {
    const e = Number(tempElectricity || 0);
    const w = Number(tempWater || 0);
    setElectricityRate(e);
    setWaterRate(w);
    await saveRates(e, w);
    // persist server-side if endpoint exists
    try {
  await axios.post('/api/meter-devices/settings/rates', { electricity_rate: e, water_rate: w });
    } catch (err) {
      // ignore
    }
    setEditingRates(false);
  };

  const createDevice = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  setCreating(true);
  setError('');
    try {
      // compute usage and total cost
      const prev = Number(form.previous_reading || 0);
      const pres = Number(form.present_reading || 0);
  const usage = Math.max(0, pres - prev);
      // determine rate using the top-level monthly rates
      let r = form.meter_type && form.meter_type.includes('Electric') ? Number(electricityRate || 0) : Number(waterRate || 0);
      const total = parseFloat((usage * r).toFixed(2));
      // include apartment breakdown fields for display and potential backend storage
      const payload = {
        meter_type: form.meter_type,
        type: form.type,
        apartment_id: form.apartment_id ? Number(form.apartment_id) : null,
        apartment_floor: form.apartment_floor || undefined,
        apartment_number: form.apartment_number || undefined,
        apartment_building: form.apartment_building || undefined,
        previous_reading: prev,
        present_reading: pres,
        consumption: usage,
        rate: r,
        total_cost: total,
        reading_date: form.reading_date ? new Date(form.reading_date).toISOString() : undefined
      };
  // resp intentionally ignored; server response not required to continue
  // eslint-disable-next-line no-unused-vars
  const resp = await axios.post('/api/meter-devices', payload);
  // refresh authoritative server data so tenant/apartment mapping remains correct
  await refresh();
  // reset form on success
  setForm({ apartment_id: '', apartment_floor: '', apartment_number: '', apartment_building: '', meter_type: 'Electricity Meter', type: 'meter', previous_reading: '', present_reading: '', reading_date: todayIso });
  setCreating(false);
  return true;
    } catch (err) {
      console.error('Create device error', err.response || err);
      const status = err?.response?.status;
      // If server error (5xx) or no response, fallback to local add so UI works
      if (!err.response || (status >= 500 && status < 600)) {
        try {
          const prev = Number(form.previous_reading || 0);
          const pres = Number(form.present_reading || 0);
          const usage = Math.max(0, pres - prev);
          const r = form.meter_type && form.meter_type.includes('Electric') ? Number(electricityRate || 0) : Number(waterRate || 0);
          const total = parseFloat((usage * r).toFixed(2));
          const localId = `local-${Date.now()}`;
          // try to resolve tenant/apartment info for display
          const tenant = tenants.find(t => String(t.apartment_id) === String(form.apartment_id) || String(t.id) === String(form.apartment_id));
          const aptRec = apartments.find(a => String(a.id) === String(form.apartment_id));
          const aptDisplay = aptRec ? `${aptRec.floor || ''}${aptRec.floor ? ' | ' : ''}${aptRec.apartment_number || aptRec.number || ''}${(aptRec.building || '') ? ' | ' + aptRec.building : ''}` : `${form.apartment_floor ? form.apartment_floor + ' | ' : ''}${form.apartment_number || ''}${form.apartment_building ? ' | ' + form.apartment_building : ''}`;
          const deviceObj = {
            id: localId,
            meter_type: form.meter_type,
            type: form.type,
            apartment_id: form.apartment_id || null,
            apartment_number: aptDisplay,
            tenant_name: tenant?.name || null,
            previous_reading: prev,
            present_reading: pres,
            // consumption is calculated on server as present_reading - previous_reading
            consumption: usage,
            rate: r,
            total_cost: total,
            last_updated: new Date().toISOString()
          };
          setDevices(prev => {
            const next = [deviceObj, ...prev];
            try { localStorage.setItem('meterDevices', JSON.stringify(next)); } catch (se) {}
            return next;
          });
          setForm({ apartment_id: '', apartment_floor: '', apartment_number: '', apartment_building: '', meter_type: 'Electricity Meter', type: 'meter', previous_reading: '', present_reading: '', reading_date: todayIso });
          setError('');
          setCreating(false);
          return true;
        } catch (inner) {
          setError(inner.message || 'Create device failed');
        }
      } else {
        setError(err.response?.data?.message || err.message || 'Create device failed');
      }
    }
    setCreating(false);
    return false;
  };

  // eslint-disable-next-line no-unused-vars
  const updateDevice = async (dev, changes) => {
    setError('');
    try {
  // Only send the changed fields to avoid accidentally overwriting identity/relationship fields
  await axios.put(`/api/meter-devices/${dev.id}`, changes);
      // refresh authoritative server data so tenant/apartment mapping remains correct
      await refresh();
    } catch (e) {
      setError(e.response?.data?.message || 'Update device failed');
    }
  };

  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, loading: false });

  const deleteDevice = (id) => {
    setConfirmState({
      open: true,
      title: 'Delete Device',
      message: 'Delete this device? This cannot be undone.',
      loading: false,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }));
        setError('');
        try {
          await axios.delete(`/api/meter-devices/${id}`);
          setDevices(prev => prev.filter(d => d.id !== id));
          showToast('Device deleted', 'success');
        } catch (e) {
          const msg = e.response?.data?.message || 'Delete device failed';
          setError(msg);
          showToast(msg, 'error');
        }
        setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
      }
    });
  };

  // Update Reading modal state
  const [showModal, setShowModal] = useState(false);
  const [modalDevice, setModalDevice] = useState(null);
  const [modalValue, setModalValue] = useState('');
  // UI state: search, create modal, rates modal, and enhanced edit modal fields
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalPrev, setModalPrev] = useState('');
  const [modalPresent, setModalPresent] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [modalConsumption, setModalConsumption] = useState('');
  const [modalTotalCost, setModalTotalCost] = useState('');

  const openUpdateModal = (device) => {
  setModalDevice(device);
  // show the previous reading as the device's current present_reading (previous <- present)
  const pres = device.present_reading ?? '';
  // helper to strip unnecessary trailing zeros like .000
  const strip = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    // convert to string removing trailing zeros after decimal point
    let s = n.toString();
    if (s.indexOf('.') >= 0) s = s.replace(/\.0+$|(?:([0-9]*[1-9])0+$)/, '$1');
    return s;
  };
  setModalPrev(strip(pres));
  // present should start empty for the new reading
  setModalPresent('');
  // try to prefill date from last_updated or now (date-only)
  const d = device.last_updated || device.updated_at || device.recorded_at || new Date().toISOString();
  try { setModalDate(new Date(d).toISOString().slice(0,10)); } catch(e) { setModalDate(new Date().toISOString().slice(0,10)); }
  setModalValue('');
  setShowModal(true);
  };

  // eslint-disable-next-line no-unused-vars
  const openEditModal = (device) => {
    setModalDevice(device);
    setModalPrev(device.previous_reading ?? '');
    setModalPresent(device.present_reading ?? '');
  const d = device.last_updated || device.updated_at || device.recorded_at || new Date().toISOString();
  try { setModalDate(new Date(d).toISOString().slice(0,10)); } catch(e) { setModalDate(new Date().toISOString().slice(0,10)); }
    setModalValue(device.present_reading || '');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setModalDevice(null);
    setModalPrev(''); setModalPresent(''); setModalValue(''); setModalDate('');
  };

  const submitEditReading = async () => {
    if (!modalDevice) return;
    const prev = Number(modalPrev || 0);
    const pres = Number(modalPresent || modalValue || 0);
    if (!Number.isFinite(prev) || !Number.isFinite(pres)) { setError('Invalid readings'); return; }
    if (pres < prev) { setError('Present reading must be >= previous reading'); return; }
    // recalc consumption and total using device rate or global rates
    const consumption = Math.max(0, pres - prev);
    const rate = modalDevice?.rate ?? (modalDevice?.meter_type && modalDevice.meter_type.toString().toLowerCase().includes('elect') ? Number(electricityRate || 0) : Number(waterRate || 0));
    const total_cost = Number((consumption * Number(rate || 0)).toFixed(2));
    // prepare payload matching backend expectations
    const payload = {
  previous_reading: Number(prev || 0),
  present_reading: Number(pres || 0),
  consumption: Number(consumption || 0),
  rate: Number(rate || 0),
  total_cost: Number(total_cost || 0),
  // convert local datetime-local value to ISO string for backend and include last_updated alias
  reading_date: modalDate ? new Date(modalDate).toISOString() : undefined,
  last_updated: modalDate ? new Date(modalDate).toISOString() : undefined
    };
    try {
      // send only the fields to update
      await axios.put(`/api/meter-devices/${modalDevice.id}`, payload);
  // refresh authoritative server data so tenant/apartment mapping remains correct
  await refresh();
  showToast('Reading updated', 'success');
  closeEditModal();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save edits';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalDevice(null);
    setModalValue('');
  };

  // close modal on ESC key for better UX
  React.useEffect(() => {
    if (!showModal) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showModal]);

  const submitUpdateReading = async () => {
    if (!modalDevice) return;
    const value = Number(modalValue);
    if (isNaN(value)) { setError('Invalid reading'); return; }
    try {
  // include optional reading date if provided
  const lastUpdatedIso = modalDate ? new Date(modalDate).toISOString() : undefined;
  await axios.put(`/api/meter-devices/update-reading/${modalDevice.id}`, { presentReading: value, lastUpdated: lastUpdatedIso });
      await refresh();
  closeModal();
  showToast('Reading updated', 'success');
    } catch (e) {
  const msg = e.response?.data?.message || 'Failed to update reading';
  setError(msg);
  showToast(msg, 'error');
    }
  };

  // helpers for grouping/sorting and paused detection
  const isPaused = (d) => {
    // treat non-active statuses as 'paused' for display purposes
    if (!d) return false;
    const s = (d.status || d.tenant_status || d.tenant?.status || '').toString().toLowerCase();
    if (s === 'active') return false;
    return true;
  };

  // Format a date-like value to MM/DD/YYYY
  const formatDateOnly = (raw) => {
    if (!raw) return '-';
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }
    } catch (e) {}
    const s = String(raw).split('T')[0];
    const parts = s.split('-');
    if (parts.length === 3) return `${parts[1].padStart(2,'0')}/${parts[2].padStart(2,'0')}/${parts[0]}`;
    return String(raw);
  };

  const filterDevices = (list) => {
    const q = (searchTerm || '').toString().trim().toLowerCase();
    if (!q) return list;
    return list.filter(d => {
      const tn = (d.tenant_name || '').toString().toLowerCase();
      const apt = (d.apartment_number || d.unit || d.apartment_id || '').toString().toLowerCase();
      const mt = (d.meter_type || d.type || '').toString().toLowerCase();
      return tn.includes(q) || apt.includes(q) || mt.includes(q);
    });
  };

  const getGroupedDevices = () => {
    const list = filterDevices(devices || []);
    const byType = { electricity: [], water: [], other: [] };
    for (const d of list) {
      const mt = (d.meter_type || d.type || '').toString().toLowerCase();
      if (mt.includes('elect')) byType.electricity.push(d);
      else if (mt.includes('water')) byType.water.push(d);
      else byType.other.push(d);
    }
    const sortFn = (a,b) => {
      const aActive = ((a.status || a.tenant_status || a.tenant?.status) === 'active');
      const bActive = ((b.status || b.tenant_status || b.tenant?.status) === 'active');
      if (aActive !== bActive) return aActive ? -1 : 1;
      const an = (a.tenant_name || a.apartment_number || '').toString().toLowerCase();
      const bn = (b.tenant_name || b.apartment_number || '').toString().toLowerCase();
      return an.localeCompare(bn);
    };
    byType.electricity.sort(sortFn);
    byType.water.sort(sortFn);
    byType.other.sort(sortFn);
    return byType;
  };

  // live calculation for enhanced modal
  React.useEffect(() => {
    const prev = Number(modalPrev || 0);
    const pres = Number(modalPresent || modalValue || 0);
    const usage = Math.max(0, pres - prev);
    setModalConsumption(formatMeterNumber(usage));
    // determine rate: prefer device rate, fallback to top-level rates
    const rate = modalDevice?.rate ?? (modalDevice?.meter_type && modalDevice.meter_type.toString().toLowerCase().includes('elect') ? Number(electricityRate || 0) : Number(waterRate || 0));
    const total = Number((usage * Number(rate || 0)).toFixed(2));
    setModalTotalCost(formatMeterNumber(total));
  }, [modalPrev, modalPresent, modalValue, modalDevice, electricityRate, waterRate]);

  // QR generation removed from this component; use QRCodeGenerator for QR operations

  if (loading) return <div className="container-fluid"><div className="text-center">Loading devices...</div></div>;

  return (
  <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
  <h2 className="m-0">Meter Device Management</h2>
  {/* Dashboard link removed in favor of top navigation */}
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {/* Search bar */}
      <div className="mb-3 mdm-search">
        <div className="input-group">
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-control" placeholder="Search tenant, apartment, device type or id" />
          <button className="btn btn-outline-secondary" onClick={() => { setSearchTerm(''); }}>Clear</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header mdm-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h6 className="m-0" style={{ marginRight: 8 }}>Devices</h6>
          </div>
          <div className="mdm-center">
            <span className="mdm-rate-small">Electricity (₱ / kWh): <strong>{formatCurrencyPeso(electricityRate)}</strong></span>
            <span style={{ marginLeft: 12 }} className="mdm-rate-small">Water (₱ / m³): <strong>{formatCurrencyPeso(waterRate)}</strong></span>
            <button className="btn btn-sm btn-outline-primary" style={{ marginLeft: 10 }} onClick={() => setShowRatesModal(true)}>Edit Rates</button>
          </div>
          <div>
            <button className="btn btn-primary mdm-create-btn" onClick={() => setShowCreateModal(true)}>Create Device</button>
          </div>
        </div>
        <div className="card-body">
          {devices.length === 0 ? (
            <p className="text-muted">No devices found</p>
          ) : (
            (() => {
              const groups = getGroupedDevices();
              const renderGroup = (title, items) => (
                <div key={title} style={{ marginBottom: 18 }}>
                  <h6 style={{ marginBottom: 8 }}>{title} ({items.length})</h6>
                  <div className="table-responsive">
                    <table className="table table-sm table-hover">
                      <thead className="table-light">
                        <tr style={{ textAlign: 'center' }}>
                          <th>Tenant</th>
                          <th>Apartment</th>
                          <th>Type</th>
                          <th>Previous</th>
                          <th>Present</th>
                          <th>Consumption</th>
                          <th>Rate</th>
                          <th>Total Cost</th>
                          <th>Updated</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(d => {
                          const paused = isPaused(d);
                          const rowStyle = paused ? { color: '#6c757d', opacity: 0.7 } : {};
                          return (
                            <tr key={d.id} style={rowStyle}>
                              <td style={{ textAlign: 'center' }}>{d.tenant_name || d.apartment_number || '-'}</td>
                              <td style={{ textAlign: 'center' }}>{d.apartment_number || '-'}</td>
                              <td style={{ textAlign: 'center' }}>{d.meter_type || d.type || '-'}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.previous_reading ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.present_reading ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.consumption ?? d.usage ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{d.rate != null ? formatCurrencyPeso(d.rate) : ''}</td>
                              <td style={{ textAlign: 'center' }}>{d.total_cost != null ? formatCurrencyPeso(d.total_cost) : ''}</td>
                              <td style={{ textAlign: 'center' }}>{d.last_updated ? formatDateOnly(d.last_updated) : '-'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div className="d-flex justify-content-center gap-2">
                                  <button type="button" className="btn btn-sm btn-outline-secondary mdm-icon-btn" title="Update Reading" onClick={() => openUpdateModal(d)}>
                                    <span aria-hidden="true">🔄</span>
                                  </button>
                                  {/* Edit action removed per UI update requirements */}
                                  <button type="button" className="btn btn-sm btn-outline-danger mdm-icon-btn" title="Delete" onClick={() => deleteDevice(d.id)}>
                                    <span aria-hidden="true">🗑️</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              return (
                <div>
                  {renderGroup('Electricity', groups.electricity)}
                  {renderGroup('Water', groups.water)}
                  {groups.other.length > 0 && renderGroup('Other', groups.other)}
                </div>
              );
            })()
          )}
        </div>
      </div>
      {/* Simple modal - lightweight implementation */}
      {/* Bootstrap modal (render into document.body to avoid stacking context issues) */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {/* Update Reading Modal (enhanced) */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: showModal ? 'auto' : 'none' }}>
            <div className={`modal fade ${showModal ? 'show' : ''}`} style={{ display: showModal ? 'block' : 'none', zIndex: 2010 }} tabIndex="-1" role="dialog" aria-hidden={!showModal}>
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document" style={{ transform: 'none' }}>
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Update Reading - {modalDevice?.tenant_name || modalDevice?.apartment_number}</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeModal}></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Previous Reading</label>
                      <input type="number" step="0.001" className="form-control" value={modalPrev} readOnly />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Present Reading</label>
                      <input autoFocus type="number" step="0.001" className="form-control" value={modalValue} onChange={e => { setModalValue(e.target.value); }} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Reading Date</label>
                      <input type="date" className="form-control" value={modalDate} onChange={e => setModalDate(e.target.value)} />
                    </div>
                      <div className="mb-3 d-flex gap-2">
                      <div style={{ flex: 1 }}>
                        <label className="form-label">Consumption</label>
                        <input className="form-control" value={modalConsumption} readOnly />
                      </div>
                      <div style={{ width: 140 }}>
                        <label className="form-label">Total Cost</label>
                        <input className="form-control" value={modalTotalCost ? formatCurrencyPeso(modalTotalCost) : ''} readOnly />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={async () => { await submitUpdateReading(); }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
            {showModal && (
              <div
                className="modal-backdrop fade show"
                style={{ zIndex: 2005, pointerEvents: 'auto' }}
                onClick={closeModal}
              />
            )}
          </div>

          {/* Create Device Modal */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: showCreateModal ? 'auto' : 'none' }}>
            <div className={`modal fade ${showCreateModal ? 'show' : ''}`} style={{ display: showCreateModal ? 'block' : 'none', zIndex: 2010 }} tabIndex="-1" role="dialog" aria-hidden={!showCreateModal}>
              <div className="modal-dialog modal-lg modal-dialog-centered" role="document" style={{ transform: 'none' }}>
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Create Device</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowCreateModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <form className="row g-3" onSubmit={async (e) => { e.preventDefault(); const ok = await createDevice(e); if (ok) setShowCreateModal(false); }}>
                      <div className="col-md-12">
                        <label className="form-label">Tenant (select)</label>
                        <select className="form-select" value={form.apartment_id ? String(form.apartment_id) : ''} onChange={(e) => {
                          const aptVal = e.target.value;
                          if (!aptVal) { setForm(prev => ({ ...prev, apartment_id: '', apartment_floor: '', apartment_number: '', apartment_building: '' })); return; }
                          try {
                            // try to find tenant and fill apartment details from apartments list when possible
                            const selTenant = tenants.find(t => String(t.apartment_id) === String(aptVal) || String(t.id) === String(aptVal));
                            const aptRec = apartments.find(a => String(a.id) === String(aptVal)) || (selTenant && apartments.find(a => String(a.id) === String(selTenant.apartment_id)));
                            if (selTenant || aptRec) {
                              const apt = aptRec || apartments.find(a => String(a.apartment_number) === String(selTenant.apartment_number));
                              setForm(prev => ({ ...prev, apartment_id: aptVal, apartment_floor: apt?.floor || selTenant?.floor || '', apartment_number: apt?.apartment_number || selTenant?.apartment_number || '', apartment_building: apt?.building || selTenant?.building || '' }));
                            } else {
                              setForm(prev => ({ ...prev, apartment_id: aptVal }));
                            }
                          } catch (err) {
                            // ignore
                          }
                        }}>
                          <option value="">Unassigned</option>
                          {tenants.map(t => (
                            <option key={t.id} value={t.apartment_id || t.id || ''}>{t.name} - {t.apartment_number || 'No Apt'}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Apartment</label>
                        <input className="form-control" value={`${form.apartment_floor ? form.apartment_floor + ' | ' : ''}${form.apartment_number || ''}${form.apartment_building ? ' | ' + form.apartment_building : ''}`} onChange={e => {
                          // allow manual override by parsing the input into components when possible (split on |)
                          const v = e.target.value || '';
                          const parts = v.split('|').map(p => p.trim());
                          setForm(prev => ({ ...prev, apartment_floor: parts[0] || '', apartment_number: parts[1] || parts[0] || '', apartment_building: parts[2] || '' }));
                        }} required />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Meter Type</label>
                        <select className="form-select" value={form.meter_type} onChange={e => setForm({ ...form, meter_type: e.target.value })}>
                          <option>Electricity Meter</option>
                          <option>Water Meter</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Reading Date</label>
                        <input type="date" className="form-control" value={form.reading_date} onChange={e => setForm({ ...form, reading_date: e.target.value })} />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Previous Reading <small className="text-muted">(kWh / m³)</small></label>
                        <input type="number" step="0.001" className="form-control" value={form.previous_reading} onChange={e => setForm({ ...form, previous_reading: e.target.value })} />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Present Reading <small className="text-muted">(kWh / m³)</small></label>
                        <input type="number" step="0.001" className="form-control" value={form.present_reading} onChange={e => setForm({ ...form, present_reading: e.target.value })} />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Consumption</label>
                        <input className="form-control" value={(() => { const p = Number(form.previous_reading||0); const q = Number(form.present_reading||0); return formatMeterNumber(Math.max(0, q - p)); })()} readOnly />
                      </div>
                      <div className="col-md-3 d-flex align-items-end">
                        <button className="btn btn-primary w-100" type="submit" disabled={creating}>{creating ? 'Saving...' : 'Save Meter Record'}</button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
            {showCreateModal && (
              <div className="modal-backdrop fade show" style={{ zIndex: 2005, pointerEvents: 'auto' }} onClick={() => setShowCreateModal(false)} />
            )}
          </div>

          {/* Edit Modal (dedicated) */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: showEditModal ? 'auto' : 'none' }}>
            <div className={`modal fade ${showEditModal ? 'show' : ''}`} style={{ display: showEditModal ? 'block' : 'none', zIndex: 2010 }} tabIndex="-1" role="dialog" aria-hidden={!showEditModal}>
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document" style={{ transform: 'none' }}>
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Edit Reading - {modalDevice?.tenant_name || modalDevice?.apartment_number}</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeEditModal}></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Previous Reading</label>
                      <input type="number" step="0.001" className="form-control" value={modalPrev} onChange={e => setModalPrev(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Present Reading</label>
                      <input autoFocus type="number" step="0.001" className="form-control" value={modalPresent} onChange={e => setModalPresent(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Reading Date</label>
                      <input type="date" className="form-control" value={modalDate} onChange={e => setModalDate(e.target.value)} />
                    </div>
          <div className="mb-3 d-flex gap-2">
                      <div style={{ flex: 1 }}>
                        <label className="form-label">Consumption</label>
                        <input className="form-control" value={modalConsumption} readOnly />
                      </div>
                      <div style={{ width: 140 }}>
                        <label className="form-label">Total Cost</label>
            <input className="form-control" value={modalTotalCost ? formatCurrencyPeso(modalTotalCost) : ''} readOnly />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={closeEditModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitEditReading}>Save</button>
                  </div>
                </div>
              </div>
            </div>
            {showEditModal && (
              <div className="modal-backdrop fade show" style={{ zIndex: 2005, pointerEvents: 'auto' }} onClick={closeEditModal} />
            )}
          </div>

          {/* Rates Modal */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: showRatesModal ? 'auto' : 'none' }}>
            <div className={`modal fade ${showRatesModal ? 'show' : ''}`} style={{ display: showRatesModal ? 'block' : 'none', zIndex: 2010 }} tabIndex="-1" role="dialog" aria-hidden={!showRatesModal}>
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document" style={{ transform: 'none' }}>
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Edit Rates</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowRatesModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Electricity Rate (₱ / kWh)</label>
                      <input type="number" step="0.01" className="form-control" value={tempElectricity} onChange={e => setTempElectricity(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Water Rate (₱ / m³)</label>
                      <input type="number" step="0.01" className="form-control" value={tempWater} onChange={e => setTempWater(e.target.value)} />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" onClick={() => setShowRatesModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={async () => { await confirmSaveRates(); setShowRatesModal(false); }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
            {showRatesModal && (
              <div className="modal-backdrop fade show" style={{ zIndex: 2005, pointerEvents: 'auto' }} onClick={() => setShowRatesModal(false)} />
            )}
          </div>
        </>, document.body
      )}
          {/* Confirmation modal (replaces window.confirm) */}
          {confirmState.open && (
            <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}>
              <div className="card" style={{ width: '100%', maxWidth: 520, boxShadow: '0 8px 24px rgba(2,6,23,0.18)', borderRadius: 8, animation: 'scaleIn 160ms ease-out' }}>
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="mb-1">{confirmState.title}</h5>
                      <div className="text-muted small">{confirmState.message}</div>
                    </div>
                    <div>
                      <button className="btn btn-sm btn-light" onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false })}>&times;</button>
                    </div>
                  </div>
                  <div className="mt-3 d-flex justify-content-end">
                    <button className="btn btn-secondary me-2" onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false })} disabled={confirmState.loading}>Cancel</button>
                    <button className="btn btn-danger" onClick={() => { if (confirmState.onConfirm) confirmState.onConfirm(); }} disabled={confirmState.loading}>{confirmState.loading ? 'Working...' : 'Confirm'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </div>
  );
};

export default MeterDeviceManagement;
