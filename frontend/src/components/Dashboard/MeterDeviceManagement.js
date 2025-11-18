import React, { useEffect, useState } from 'react';
import './MeterDeviceManagement.css';
import { createPortal } from 'react-dom';
import { useNavigate, NavLink } from 'react-router-dom';
import axios from '../../axiosConfig';
import { displayBillType } from '../../utils/billTypes';
import { showToast } from '../../toastService';
import { formatMeterNumber } from '../../utils/numberFormat';
// QR generation removed from Meter device management; QR handled in QRCodeGenerator component

const MeterDeviceManagement = () => {
  const navigate = useNavigate();
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
  const [form, setForm] = useState({ device_id: '', meter_type: 'Electricity Meter', type: 'meter', apartment_id: '', previous_reading: '', present_reading: '' });
  // QR generation state removed

  const refresh = async () => {
    try {
      const [d, a] = await Promise.all([
  axios.get('/api/meter-devices'),
        axios.get('/api/apartments')
      ]);
  // backend may return { devices, pairs } or plain array
  const payload = d.data && d.data.devices ? d.data.devices : d.data;
  setDevices(payload);
      // persist to localStorage so UI can recover if backend is down
  try { localStorage.setItem('meterDevices', JSON.stringify(d.data || [])); } catch (e) {}
      setApartments(a.data);
      try {
        const t = await axios.get('/api/tenants');
        setTenants(t.data);
      } catch (e) {
        setTenants([]);
      }
    } catch (e) {
      console.warn('Failed to fetch devices from API, falling back to localStorage', e);
      try {
  const raw = localStorage.getItem('meterDevices');
        const saved = raw ? JSON.parse(raw) : [];
        setDevices(saved || []);
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
  const [editingRates, setEditingRates] = useState(false);
  const [tempElectricity, setTempElectricity] = useState(electricityRate);
  const [tempWater, setTempWater] = useState(waterRate);

  useEffect(() => {
    setTempElectricity(electricityRate);
    setTempWater(waterRate);
  }, [electricityRate, waterRate]);

  const startEditRates = () => setEditingRates(true);
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
    e.preventDefault();
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
      // ensure device_id unique in current list; append timestamp if duplicate
      let deviceId = form.device_id || `dev-${Date.now() % 100000}-${Math.floor(Math.random()*9000)}`;
      if (devices.find(d => d.device_id === deviceId)) deviceId = `${deviceId}-${Date.now()}`;
  const payload = { device_id: deviceId, meter_type: form.meter_type, type: form.type, apartment_id: form.apartment_id || null, previous_reading: prev, present_reading: pres, consumption: usage, rate: r, total_cost: total };
  await axios.post('/api/meter-devices', payload);
      await refresh();
      // after successful save to backend, refresh already saved to localStorage
      setForm({ device_id: '', meter_type: 'Electricity Meter', type: 'meter', apartment_id: '', previous_reading: '', present_reading: '' });
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
          const deviceObj = {
            id: localId,
            device_id: form.device_id || localId,
            meter_type: form.meter_type,
            type: form.type,
            apartment_id: form.apartment_id || null,
            apartment_number: tenant?.apartment_number || (apartments.find(a => String(a.id) === String(form.apartment_id))?.number) || '',
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
          setForm({ device_id: '', meter_type: 'Electricity Meter', type: 'meter', apartment_id: '', previous_reading: '', present_reading: '' });
          setError('');
        } catch (inner) {
          setError(inner.message || 'Create device failed');
        }
      } else {
        setError(err.response?.data?.message || err.message || 'Create device failed');
      }
    }
    setCreating(false);
  };

  const updateDevice = async (dev, changes) => {
    setError('');
    try {
  await axios.put(`/api/meter-devices/${dev.id}`, { ...dev, ...changes });
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
  setModalPrev(device.previous_reading ?? '');
  setModalPresent(device.present_reading ?? '');
  // try to prefill date from last_updated or now
  const d = device.last_updated || device.updated_at || device.recorded_at || new Date().toISOString();
  // make a simple ISO-local datetime for input if possible
  try { setModalDate(new Date(d).toISOString().slice(0,16)); } catch(e) { setModalDate(new Date().toISOString().slice(0,16)); }
  setModalValue(device.present_reading || '');
  setShowModal(true);
  };

  const openEditModal = (device) => {
    setModalDevice(device);
    setModalPrev(device.previous_reading ?? '');
    setModalPresent(device.present_reading ?? '');
    const d = device.last_updated || device.updated_at || device.recorded_at || new Date().toISOString();
    try { setModalDate(new Date(d).toISOString().slice(0,16)); } catch(e) { setModalDate(new Date().toISOString().slice(0,16)); }
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
    if (isNaN(pres)) { setError('Invalid present reading'); return; }
    try {
      await axios.put(`/api/meter-devices/${modalDevice.id}`, { ...modalDevice, previous_reading: prev, present_reading: pres, last_updated: modalDate });
      await refresh();
      closeEditModal();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save edits');
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
  await axios.put(`/api/meter-devices/update-reading/${modalDevice.id}`, { presentReading: value });
      await refresh();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update reading');
    }
  };

  // helpers for grouping/sorting and paused detection
  const isPaused = (d) => {
    // check common fields for a paused/disabled tenant or device
    if (!d) return false;
    const s = (d.status || d.tenant_status || d.tenant?.status || '').toString().toLowerCase();
    if (s === 'paused' || s === 'inactive' || s === 'disabled') return true;
    if (d.paused || d.is_paused) return true;
    return false;
  };

  const filterDevices = (list) => {
    const q = (searchTerm || '').toString().trim().toLowerCase();
    if (!q) return list;
    return list.filter(d => {
      const tn = (d.tenant_name || '').toString().toLowerCase();
      const apt = (d.apartment_number || d.unit || d.apartment_id || '').toString().toLowerCase();
      const mt = (d.meter_type || d.type || '').toString().toLowerCase();
      return tn.includes(q) || apt.includes(q) || mt.includes(q) || (d.device_id||'').toString().toLowerCase().includes(q);
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
      const pa = isPaused(a); const pb = isPaused(b);
      if (pa !== pb) return pa ? 1 : -1;
      const an = (a.tenant_name || a.device_id || '').toString().toLowerCase();
      const bn = (b.tenant_name || b.device_id || '').toString().toLowerCase();
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

      {/* Top toolbar: title (left), rates (center), create (right) */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="m-0">Devices</h3>
        </div>
        <div className="text-center">
          <div style={{fontSize:14}}>Electricity (₱ / kWh): <strong>{Number(electricityRate || 0).toFixed(2)}</strong></div>
          <div style={{fontSize:14}}>Water (₱ / m³): <strong>{Number(waterRate || 0).toFixed(2)}</strong></div>
          <div style={{marginTop:6}}>
            <button className="btn btn-sm btn-outline-primary" onClick={() => setShowRatesModal(true)}>Edit Rates</button>
          </div>
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Create Device</button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-3">
        <div className="input-group">
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-control" placeholder="Search tenant, apartment, device type or id" />
          <button className="btn btn-outline-secondary" onClick={() => { setSearchTerm(''); }}>Clear</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Devices</div>
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
                              <td style={{ textAlign: 'center' }}>{d.tenant_name || d.device_id}</td>
                              <td style={{ textAlign: 'center' }}>{d.apartment_number || '-'}</td>
                              <td style={{ textAlign: 'center' }}>{d.meter_type || d.type || '-'}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.previous_reading ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.present_reading ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{formatMeterNumber(d.consumption ?? d.usage ?? '')}</td>
                              <td style={{ textAlign: 'center' }}>{d.rate != null ? formatMeterNumber(d.rate) : ''}</td>
                              <td style={{ textAlign: 'center' }}>{d.total_cost != null ? formatMeterNumber(d.total_cost) : ''}</td>
                              <td style={{ textAlign: 'center' }}>{d.last_updated ? new Date(d.last_updated).toLocaleString() : '-'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div className="d-flex justify-content-center gap-2">
                                  <button className="btn btn-sm btn-outline-secondary" onClick={() => openUpdateModal(d)}>Update Reading</button>
                                  <button className="btn btn-sm btn-outline-secondary" onClick={() => openEditModal(d)}>Edit</button>
                                  <button className="btn btn-sm btn-outline-danger" onClick={() => deleteDevice(d.id)}>Delete</button>
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
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document">
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Update Reading - {modalDevice?.tenant_name || modalDevice?.device_id}</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeModal}></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Previous Reading</label>
                      <input type="number" step="0.001" className="form-control" value={modalPrev} onChange={e => setModalPrev(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Present Reading</label>
                      <input autoFocus type="number" step="0.001" className="form-control" value={modalPresent || modalValue} onChange={e => { setModalPresent(e.target.value); setModalValue(e.target.value); }} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Reading Date</label>
                      <input type="datetime-local" className="form-control" value={modalDate} onChange={e => setModalDate(e.target.value)} />
                    </div>
                    <div className="mb-3 d-flex gap-2">
                      <div style={{ flex: 1 }}>
                        <label className="form-label">Consumption</label>
                        <input className="form-control" value={modalConsumption} readOnly />
                      </div>
                      <div style={{ width: 140 }}>
                        <label className="form-label">Total Cost</label>
                        <input className="form-control" value={modalTotalCost} readOnly />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                    <button className="btn btn-primary" onClick={async () => {
                      // submit updated reading, previous and optionally date
                      const prev = Number(modalPrev || 0);
                      const pres = Number(modalPresent || modalValue || 0);
                      if (isNaN(pres)) { setError('Invalid present reading'); return; }
                      try {
                        await axios.put(`/api/meter-devices/${modalDevice.id}`, { ...modalDevice, previous_reading: prev, present_reading: pres, last_updated: modalDate });
                        await refresh();
                        closeModal();
                      } catch (err) {
                        setError(err.response?.data?.message || 'Failed to update reading');
                      }
                    }}>Save</button>
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
              <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Create Device</h5>
                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowCreateModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    <form className="row g-3" onSubmit={(e) => { createDevice(e); setShowCreateModal(false); }}>
                      <div className="col-md-12">
                        <label className="form-label">Tenant (select)</label>
                        <select className="form-select" value={form.apartment_id ? String(form.apartment_id) : ''} onChange={async (e) => {
                          const tenantId = e.target.value;
                          if (!tenantId) { setForm({ ...form, apartment_id: '' }); return; }
                          try {
                            const tResp = await axios.get('/api/tenants');
                            const found = tResp.data.find(t => String(t.id) === String(tenantId));
                            if (found) {
                              const safeName = (found.name || '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
                              const aptNum = found.apartment_number || found.apartment_id || 'NA';
                              const genId = `APT${aptNum}_${safeName}`;
                              setForm(prev => ({ ...prev, apartment_id: found.apartment_id || '', device_id: prev.device_id || genId }));
                            } else setForm(prev => ({ ...prev, apartment_id: '' }));
                          } catch (err) {}
                        }}>
                          <option value="">Unassigned</option>
                          {tenants.map(t => (
                            <option key={t.id} value={t.id}>{t.name} - {t.apartment_number || 'No Apt'}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Device ID</label>
                        <input className="form-control" value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })} required />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Meter Type</label>
                        <select className="form-select" value={form.meter_type} onChange={e => setForm({ ...form, meter_type: e.target.value })}>
                          <option>Electricity Meter</option>
                          <option>Water Meter</option>
                        </select>
                      </div>
                      <div className="col-md-4" />
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
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document">
                <div className="modal-content" style={{ pointerEvents: 'auto' }}>
                  <div className="modal-header">
                    <h5 className="modal-title">Edit Reading - {modalDevice?.tenant_name || modalDevice?.device_id}</h5>
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
                      <input type="datetime-local" className="form-control" value={modalDate} onChange={e => setModalDate(e.target.value)} />
                    </div>
                    <div className="mb-3 d-flex gap-2">
                      <div style={{ flex: 1 }}>
                        <label className="form-label">Consumption</label>
                        <input className="form-control" value={modalConsumption} readOnly />
                      </div>
                      <div style={{ width: 140 }}>
                        <label className="form-label">Total Cost</label>
                        <input className="form-control" value={modalTotalCost} readOnly />
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
              <div className="modal-dialog modal-sm modal-dialog-centered" role="document">
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
