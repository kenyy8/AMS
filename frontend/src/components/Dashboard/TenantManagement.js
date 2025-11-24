import React, { useEffect, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';

const TenantManagement = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    name: '',
    email: '',
    phone: '',
  apartment_id: '', 
    tenant_id: '',
    password: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [selectedTenantIds, setSelectedTenantIds] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit' | 'view'
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, aRes] = await Promise.all([
          axios.get('/api/tenants'),
          axios.get('/api/apartments')
        ]);
        setTenants(tRes.data);
        setApartments(aRes.data);
      } catch (e) {
        console.error('Failed to load tenant data', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const generateTenantId = () => {
    // New logic: ApartmentNumber-Initials
    const apt = apartments.find(a => a.id === tenantForm.apartment_id);
    const aptNum = apt ? apt.apartment_number : '';
    const name = (tenantForm.name || '').trim();
    let initials = '';
    if (name) {
      const parts = name.split(/\s+/);
      const first = parts[0] || '';
      const last = parts[parts.length - 1] || '';
      initials = (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    const id = aptNum && initials ? `${aptNum}-${initials}` : '';
    setTenantForm(prev => ({ ...prev, tenant_id: id }));
  };

  // Keep tenant_id in sync when name or apartment changes
  useEffect(() => {
    // compute immediately using latest state
    const apt = apartments.find(a => a.id === tenantForm.apartment_id);
    const aptNum = apt ? apt.apartment_number : '';
    const name = (tenantForm.name || '').trim();
    let initials = '';
    if (name) {
      const parts = name.split(/\s+/);
      const first = parts[0] || '';
      const last = parts[parts.length - 1] || '';
      initials = (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    const id = aptNum && initials ? `${aptNum}-${initials}` : '';
    // Only update if different to avoid re-renders
    if (tenantForm.tenant_id !== id) {
      setTenantForm(prev => ({ ...prev, tenant_id: id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantForm.name, tenantForm.apartment_id, apartments]);

  const createTenant = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
          let resp;
          if (modalMode === 'edit' && selectedTenantId) {
            resp = await axios.put(`/api/tenants/${selectedTenantId}`, tenantForm);
          } else {
            resp = await axios.post('/api/tenants', tenantForm);
          }
      // server returns created tenant row
      const created = resp.data;
      console.debug('TenantManagement: created tenant response', created);
      // ensure created tenant has apartment_number for immediate display
      // If server returned a full tenant row, append it and mark apartment occupied locally.
      if (created && created.name) {
        if (created.apartment_id && !created.apartment_number) {
          const aptId = Number(created.apartment_id);
          const found = apartments.find(a => a.id === aptId);
          if (found) created.apartment_number = found.apartment_number;
          // mark apartment locally as occupied
          setApartments(prev => prev.map(a => a.id === aptId ? ({ ...a, status: 'occupied' }) : a));
        }
        // If editing, replace the existing tenant row; otherwise prepend
        if (modalMode === 'edit' && created.id) {
          setTenants(prev => prev.map(t => t.id === created.id ? created : t));
        } else {
          setTenants(prev => [created, ...prev]);
        }
      } else {
        // fallback: server returned only id or incomplete object -> refresh tenants from server
        try {
          const tRes = await axios.get('/api/tenants');
          setTenants(tRes.data);
        } catch (e) {
          console.warn('Failed to refresh tenants after create', e);
        }
      }
      // Sync tenant name into meter devices for the same apartment to keep UI in sync
      try {
        const aptId = created && (created.apartment_id || created.apartment || tenantForm.apartment_id);
        const tenantName = created && created.name ? created.name : (tenantForm.name || '');
        if (aptId && tenantName) {
          try {
            const devResp = await axios.get('/api/meter-devices');
            const devList = devResp.data && devResp.data.devices ? devResp.data.devices : devResp.data || [];
            const toUpdate = devList.filter(d => String(d.apartment_id) === String(aptId));
            if (toUpdate.length > 0) {
              await Promise.all(toUpdate.map(d => {
                // If tenant_name already matches, skip
                if ((d.tenant_name || '') === tenantName) return Promise.resolve();
                // Preserve all fields; only update tenant_name
                const payload = { ...d, tenant_name: tenantName };
                return axios.put(`/api/meter-devices/${d.id}`, payload).catch(err => { console.warn('Failed to update device tenant_name', d.id, err); });
              }));
              try { localStorage.setItem('meterDevicesUpdated', Date.now().toString()); } catch (e) {}
            }
          } catch (e) {
            console.warn('Failed to load meter devices for tenant sync', e);
          }
        }
      } catch (e) {
        console.warn('Tenant-device sync error', e);
      }

      // notify other components (cross-tab) to refresh
      try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
      setTenantForm({ name: '', email: '', phone: '', apartment_id: '', tenant_id: '', password: '' });
          // close modal and notify user
          setShowModal(false);
          setSelectedTenantId(null);
          setModalMode('create');
          showToast(modalMode === 'edit' ? 'Tenant updated' : 'Tenant created', 'success');
    } catch (e) {
      console.error('Create tenant failed', e);
    }
    setCreating(false);
  };
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, loading: false });

  const deleteTenant = (id) => {
    setConfirmState({
      open: true,
      title: 'Delete Tenant',
      message: 'Are you sure you want to delete this tenant? This cannot be undone.',
      loading: false,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }));
        try {
          const resp = await axios.delete(`/api/tenants/${id}`);
          // refresh tenants and apartments to stay in sync
          try {
            const [tRes, aRes] = await Promise.all([axios.get('/api/tenants'), axios.get('/api/apartments')]);
            setTenants(tRes.data);
            setApartments(aRes.data);
          } catch (e) {
            console.warn('Failed to refresh after delete', e);
          }
          try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
          showToast('Tenant deleted', 'success');
        } catch (e) {
          console.error('Delete tenant failed', e);
          showToast('Failed to delete tenant', 'error');
        }
        setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
      }
    });
  };

  const toggleTenantStatus = async (id, tenant) => {
    try {
      const isPaused = tenant && (tenant.is_paused || tenant.is_paused === 1 || tenant.status === 'paused');
      const action = isPaused ? 'resume' : 'pause';
      // Call the pause endpoint which updates tenant.is_paused and bill statuses server-side
      await axios.post(`/api/tenants/${id}/pause`, { action });
      // Refresh tenants and apartments to pick up authoritative flags
      const [tRes, aRes] = await Promise.all([axios.get('/api/tenants'), axios.get('/api/apartments')]);
      setTenants(tRes.data);
      setApartments(aRes.data);
      try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}

      // notify bills list to refresh so statuses show immediately
      try { localStorage.setItem('billsUpdated', Date.now().toString()); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('billsUpdated')); } catch (e) {}
    } catch (e) {
      console.error('Update tenant status failed', e);
      showToast('Failed to change tenant pause state', 'error');
    }
  };

  if (loading) return <div className="container-fluid"><div className="text-center">Loading tenants...</div></div>;

  return (
    <div className="container-fluid position-relative px-4">
  {/* Global toasts are handled by GlobalToasts mounted at app root */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: translateY(-6px) scale(.98); opacity:0 } to { transform: translateY(0) scale(1); opacity:1 } }
  .tm-modal-card .card-header { padding: 8px 10px; font-size: 15px; }
  .tm-modal-card .card-body { padding: 8px 10px; }
  .tm-modal-card .form-label { font-size: 12px; margin-bottom: 4px; }
  .tm-modal-card .form-control { padding: 6px 8px; font-size: 13px; }
  .tm-modal-card .input-group .btn { padding: 6px 8px; font-size: 12px; }
  .tm-modal-card .mb-3 { margin-bottom: 6px !important; }
  .tm-modal-card .btn { padding: 6px 8px; font-size: 13px; }
        @media (min-width: 768px) {
          .tm-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .tm-modal-full { grid-column: 1 / -1; }
        }
      `}</style>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Tenant Management</h2>
      </div>

      {/* Floating Add Tenant button */}
  {/* Floating add button removed - using toolbar above table instead */}

      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between">
              <div>All Tenants</div>
              {/* Toolbar */}
              <div>
                <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => { setModalMode('create'); setTenantForm({ name: '', email: '', phone: '', apartment_id: '', tenant_id: '', password: '' }); setShowModal(true); }}>+ Add Tenant</button>
                {/* Removed global Edit button; per-row edit buttons added to each row for clarity */}
                <button className="btn btn-sm btn-outline-warning me-2" onClick={async () => {
                  if (selectedTenantIds.length === 0) return showToast('Select one or more tenants to Pause/Activate', 'error');
                  // determine target status: if all paused -> activate, else pause
                  const selected = tenants.filter(t => selectedTenantIds.includes(t.id));
                  const allPaused = selected.every(t => t.status === 'paused');
                  const target = allPaused ? 'active' : 'paused';
                  setConfirmState({
                    open: true,
                    title: `${target === 'paused' ? 'Pause' : 'Activate'} Tenants`,
                    message: `${target === 'paused' ? 'Pause' : 'Activate'} selected tenants?`,
                    loading: false,
                    onConfirm: async () => {
                      setConfirmState(prev => ({ ...prev, loading: true }));
                      try {
                        for (const t of selected) {
                          const action = target === 'paused' ? 'pause' : 'resume';
                          await axios.post(`/api/tenants/${t.id}/pause`, { action });
                        }
                        const [tRes, aRes] = await Promise.all([axios.get('/api/tenants'), axios.get('/api/apartments')]);
                        setTenants(tRes.data);
                        setApartments(aRes.data);
                        try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
                        setSelectedTenantIds([]);
                        showToast(`${target === 'paused' ? 'Paused' : 'Activated'} selected tenants`, 'success');
                      } catch (e) {
                        console.error('Bulk status change failed', e);
                        showToast('Failed to change status for selected tenants', 'error');
                      }
                      setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                    }
                  });
                }}>Pause</button>
                <button className="btn btn-sm btn-outline-danger" onClick={async () => {
                  if (selectedTenantIds.length === 0) return showToast('Select one or more tenants to delete', 'error');
                  setConfirmState({
                    open: true,
                    title: 'Delete Tenants',
                    message: `Delete ${selectedTenantIds.length} tenant(s)? This cannot be undone.`,
                    loading: false,
                    onConfirm: async () => {
                      setConfirmState(prev => ({ ...prev, loading: true }));
                      try {
                        for (const id of selectedTenantIds) {
                          await axios.delete(`/api/tenants/${id}`);
                        }
                        const [tRes, aRes] = await Promise.all([axios.get('/api/tenants'), axios.get('/api/apartments')]);
                        setTenants(tRes.data);
                        setApartments(aRes.data);
                        try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
                        setSelectedTenantIds([]);
                      } catch (e) {
                        console.error('Bulk delete failed', e);
                        showToast('Failed to delete selected tenants', 'error');
                      }
                      setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                    }
                  });
                }}>Delete</button>
              </div>
            </div>
            <div className="card-body">
              {tenants.length === 0 ? (
                <p className="text-muted">No tenants found</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-striped">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input type="checkbox" checked={selectedTenantIds.length === tenants.length && tenants.length > 0} onChange={(e) => {
                            if (e.target.checked) { setSelectedTenantIds(tenants.map(t => t.id)); setSelectedTenantId(null); }
                            else { setSelectedTenantIds([]); setSelectedTenantId(null); }
                          }} />
                        </th>
                        <th>Name</th>
                        <th>Tenant ID</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Apartment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.sort((a,b)=>{ // active first, paused last
                        const aPaused = a.is_paused || a.status === 'paused';
                        const bPaused = b.is_paused || b.status === 'paused';
                        if (aPaused === bPaused) return 0;
                        return aPaused ? 1 : -1;
                      }).map(tenant => {
                        const checked = selectedTenantIds.includes(tenant.id);
                        const isPaused = tenant.is_paused || tenant.status === 'paused';
                        return (
                          <tr key={tenant.id} style={{ background: checked ? 'rgba(13,110,253,0.04)' : isPaused ? '#f8f9fa' : 'transparent', color: isPaused ? '#6c757d' : 'inherit' }}>
                            <td style={{ width: 40 }}>
                              <input type="checkbox" checked={checked} onChange={(e) => {
                                if (e.target.checked) {
                                  const next = [...selectedTenantIds, tenant.id];
                                  setSelectedTenantIds(next);
                                  // if only one selected, keep selectedTenantId in sync
                                  setSelectedTenantId(next.length === 1 ? tenant.id : null);
                                } else {
                                  const next = selectedTenantIds.filter(id => id !== tenant.id);
                                  setSelectedTenantIds(next);
                                  setSelectedTenantId(next.length === 1 ? next[0] : null);
                                }
                              }} />
                            </td>
                            <td>{tenant.name}</td>
                            <td>{tenant.tenant_id}</td>
                            <td>{tenant.email}</td>
                            <td>{tenant.phone}</td>
                            <td>{tenant.apartment_number || 'Not assigned'}</td>
                            <td style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span className={"badge " + (isPaused ? 'bg-warning text-dark' : tenant.status === 'active' ? 'bg-success' : 'bg-secondary')}>
                                {isPaused ? 'paused' : tenant.status}
                              </span>
                              <button type="button" title="Edit Tenant" className="btn btn-sm btn-outline-secondary" onClick={async () => {
                                try {
                                  const resp = await axios.get('/api/tenants');
                                  const list = resp.data || [];
                                  const t = list.find(item => Number(item.id) === Number(tenant.id));
                                  if (!t) return showToast('Tenant not found', 'error');
                                  setModalMode('edit');
                                  setSelectedTenantId(tenant.id);
                                  setTenantForm({
                                    name: t.name || '',
                                    email: t.email || '',
                                    phone: t.phone || '',
                                    apartment_id: t.apartment_id || '',
                                    tenant_id: t.tenant_id || '',
                                    password: t.password || ''
                                  });
                                  setShowModal(true);
                                } catch (e) {
                                  console.error('Failed to fetch tenant for row edit', e);
                                  showToast('Failed to load tenant details', 'error');
                                }
                              }}>
                                ✏️
                              </button>
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

      {/* Modal overlay */}
      {showModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '8px', animation: 'fadeIn 160ms ease-in' }}>
            <div className="card tm-modal-card" style={{ width: '100%', maxWidth: 460, margin: '0 auto', boxShadow: '0 10px 28px rgba(2,6,23,0.22)', borderRadius: 8, transform: 'scale(1)', animation: 'scaleIn 160ms ease-out' }}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Add New Tenant</strong>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>x</button>
            </div>
            <div className="card-body" style={{ padding: '8px 10px' }}>
      <form onSubmit={createTenant}>
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={tenantForm.name} 
        onChange={e => setTenantForm(prev => ({ ...prev, name: e.target.value }))}
                    required 
        readOnly={modalMode === 'view'}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={tenantForm.email} 
                    onChange={e => setTenantForm(prev => ({ ...prev, email: e.target.value }))}
                    required 
                    readOnly={modalMode === 'view'}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Phone</label>
                  <input 
                    type="tel" 
                    className="form-control" 
                    value={tenantForm.phone} 
                    onChange={e => setTenantForm(prev => ({ ...prev, phone: e.target.value }))}
                    required 
                    readOnly={modalMode === 'view'}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Apartment</label>
                  <select 
                    className="form-select" 
                    value={tenantForm.apartment_id} 
              onChange={e => {
                        const val = e.target.value ? Number(e.target.value) : '';
                        setTenantForm(prev => ({ ...prev, apartment_id: val }));
                      }}
                    required
                    disabled={modalMode === 'view'}
                  >
                    <option value="">Select apartment</option>
                      {apartments.sort((a,b) => (a.status === 'occupied') - (b.status === 'occupied')).map(apt => (
                        <option key={apt.id} value={apt.id} disabled={apt.status === 'occupied'} style={apt.status === 'occupied' ? {color: '#6c757d'} : {}}>
                          {apt.apartment_number} - {apt.building} {apt.status === 'occupied' ? ' (occupied)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Tenant ID</label>
                  <div className="input-group">
                    <input 
                      type="text" 
                      className="form-control" 
                      value={tenantForm.tenant_id} 
                      readOnly
                      required 
                    />
                    <button className="btn btn-outline-secondary" type="button" onClick={generateTenantId} disabled={modalMode === 'view'}>
                      Generate
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={tenantForm.status || 'active'} onChange={e => setTenantForm(prev => ({ ...prev, status: e.target.value }))} disabled={modalMode === 'view'}>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <div className="input-group">
                    <input 
                      type={passwordVisible ? 'text' : 'password'} 
                      className="form-control" 
                      value={tenantForm.password || ''} 
                      onChange={e => setTenantForm(prev => ({ ...prev, password: e.target.value }))}
                      required={modalMode !== 'edit' ? true : false}
                      readOnly={modalMode === 'view'}
                    />
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setPasswordVisible(v => !v)}>{passwordVisible ? 'Hide' : 'Show'}</button>
                  </div>
                  {modalMode === 'edit' && !tenantForm.password && (
                    <div className="form-text text-muted">No password set</div>
                  )}
                </div>
                <div className="d-flex">
                  <button className="btn btn-secondary me-2" type="button" onClick={() => { setShowModal(false); setModalMode('create'); setSelectedTenantIds([]); }}>Cancel</button>
                  <button className="btn btn-primary flex-grow-1" type="submit" disabled={creating || modalMode === 'view'}>
                    {creating ? (modalMode === 'edit' ? 'Updating...' : 'Creating...') : (modalMode === 'edit' ? 'Update Tenant' : 'Create Tenant')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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

export default TenantManagement;
