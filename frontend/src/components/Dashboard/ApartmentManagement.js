import React, { useEffect, useState } from 'react';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';

const ApartmentManagement = () => {
  // navigation not used in this component
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  // modal form state (moved create UI into modal)
  const [modalForm, setModalForm] = useState({ apartment_number: '', floor: '', building: '', rent_amount: '' });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [selectedApartmentIds, setSelectedApartmentIds] = useState([]);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, loading: false });

  const refresh = async () => {
    const res = await axios.get('/api/apartments');
    setApartments(res.data);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await refresh();
      } catch (e) {
        setError('Failed to load apartments');
      } finally {
        setLoading(false);
      }
    };
    load();

    // listen for cross-component apartment updates (tenant create/delete)
    const handler = async (e) => {
      try {
        await refresh();
      } catch (_) {}
    };
    window.addEventListener('apartmentsUpdated', handler);
    const storageHandler = (ev) => {
      if (ev.key === 'apartmentsUpdated') {
        handler();
      }
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('apartmentsUpdated', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const createApartment = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const payload = { ...modalForm };
      const resp = await axios.post('/api/apartments', payload);
      const created = resp.data;
      setApartments(prev => [created, ...prev]);
  setModalForm({ apartment_number: '', floor: '', building: '', rent_amount: '' });
      setShowModal(false);
      try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
      showToast('Apartment created', 'success');
    } catch (e) {
      const msg = e.response?.data?.message || 'Create apartment failed';
      setError(msg);
      showToast(msg, 'error');
    }
    setCreating(false);
  };

  const updateApartment = async (id) => {
    setCreating(true);
    setError('');
    try {
      const payload = { ...modalForm };
      await axios.put(`/api/apartments/${id}`, payload);
      // update local state conservatively
      setApartments(prev => prev.map(a => (a.id === id ? ({ ...a, ...payload }) : a)));
      setShowModal(false);
      setEditingId(null);
      try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
      showToast('Apartment updated', 'success');
    } catch (e) {
      const msg = e.response?.data?.message || 'Update apartment failed';
      setError(msg);
      showToast(msg, 'error');
    }
    setCreating(false);
  };

  const saveApartment = async (e) => {
    e.preventDefault();
    if (modalMode === 'edit' && editingId) {
      await updateApartment(editingId);
    } else {
      await createApartment(e);
    }
  };

  // occupancy is now derived from tenants. Manual update removed.

  const deleteApartment = async (id) => {
    // open confirmation modal instead of window.confirm
    setConfirmState({
      open: true,
      title: 'Delete Apartment',
      message: `Delete apartment ${id}? This cannot be undone.`,
      loading: false,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }));
        setError('');
        try {
          await axios.delete(`/api/apartments/${id}`);
          setApartments(prev => prev.filter(a => a.id !== id));
          try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
          showToast('Apartment deleted', 'success');
        } catch (e) {
          const msg = e.response?.data?.message || 'Delete apartment failed';
          setError(msg);
          showToast(msg, 'error');
        }
        setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
      }
    });
  };

  // (manual occupancy controls removed) 

  const bulkDelete = async () => {
    if (selectedApartmentIds.length === 0) return showToast('Select one or more apartments', 'error');
    setConfirmState({
      open: true,
      title: 'Delete Apartments',
      message: `Delete ${selectedApartmentIds.length} apartment(s)? This cannot be undone.`,
      loading: false,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }));
        setError('');
        try {
          for (const id of selectedApartmentIds) {
            await axios.delete(`/api/apartments/${id}`);
          }
          await refresh();
          setSelectedApartmentIds([]);
          try { localStorage.setItem('apartmentsUpdated', Date.now().toString()); } catch (e) {}
          showToast('Deleted selected apartments', 'success');
        } catch (e) {
          console.error('Bulk delete failed', e);
          showToast('Failed to delete some apartments', 'error');
        }
        setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
      }
    });
  };

  if (loading) return <div className="container-fluid"><div className="text-center">Loading apartments...</div></div>;

  return (
  <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Apartment Management</h2>
  {/* Dashboard link removed in favor of top navigation */}
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      

      <div className="card">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="fw-bold">Apartments</div>
          <div className="d-flex gap-2 align-items-center">
            <button className="btn btn-sm btn-primary" onClick={() => { setModalForm({ apartment_number: '', floor: '', building: '', rent_amount: '' }); setShowModal(true); }}>
              + Add Apartment
            </button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => bulkDelete()} disabled={selectedApartmentIds.length === 0}>Delete</button>
            <div className="text-muted small ms-3">Selected: {selectedApartmentIds.length}</div>
          </div>
        </div>
        <div className="card-body">
          {apartments.length === 0 ? (
            <p className="text-muted">No apartments found</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={selectedApartmentIds.length === apartments.length && apartments.length > 0} onChange={(e) => {
                        if (e.target.checked) setSelectedApartmentIds(apartments.map(a => a.id));
                        else setSelectedApartmentIds([]);
                      }} />
                    </th>
                    <th>Floor</th>
                    <th>Number</th>
                    <th>Building</th>
                    <th>Rent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {apartments
                    .slice()
                    .sort((x, y) => {
                      if (x.status === 'occupied' && y.status !== 'occupied') return 1;
                      if (y.status === 'occupied' && x.status !== 'occupied') return -1;
                      return (x.apartment_number || '').localeCompare(y.apartment_number || '');
                    })
                    .map(a => {
                      const checked = selectedApartmentIds.includes(a.id);
                      return (
                        <tr key={a.id} style={a.status === 'occupied' ? { opacity: 0.6 } : { background: checked ? 'rgba(13,110,253,0.04)' : 'transparent' }}>
                          <td style={{ width: 40 }}>
                            <input type="checkbox" checked={checked} onChange={(e) => {
                              if (e.target.checked) setSelectedApartmentIds(prev => [...prev, a.id]);
                              else setSelectedApartmentIds(prev => prev.filter(id => id !== a.id));
                            }} />
                          </td>
                          <td>{a.floor ?? '—'}</td>
                          <td>{a.apartment_number}</td>
                          <td>{a.building ?? '—'}</td>
                          <td>{a.rent_amount}</td>
                          <td><span className={`badge bg-${a.status === 'occupied' ? 'secondary' : 'success'}`}>{a.status}</span></td>
                          <td style={{ width: 120 }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-outline-primary" title="Edit apartment" aria-label={`Edit apartment ${a.apartment_number || a.id}`} onClick={() => {
                                // open edit modal
                                setModalMode('edit');
                                setEditingId(a.id);
                                setModalForm({ apartment_number: a.apartment_number || '', floor: a.floor || '', building: a.building || '', rent_amount: a.rent_amount || '', status: a.status || 'available' });
                                setShowModal(true);
                              }}>✏️</button>
                              <button className="btn btn-sm btn-outline-danger" title="Delete apartment" aria-label={`Delete apartment ${a.apartment_number || a.id}`} onClick={() => deleteApartment(a.id)}>🗑</button>
                            </div>
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

      {/* Modal for adding apartment */}
      {showModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '8px', animation: 'fadeIn 160ms ease-in' }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, margin: '0 auto', boxShadow: '0 10px 28px rgba(2,6,23,0.22)', borderRadius: 8, transform: 'scale(1)', animation: 'scaleIn 160ms ease-out' }}>
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Add Apartment</strong>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowModal(false)}>x</button>
            </div>
            <div className="card-body">
              <form onSubmit={saveApartment}>
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label">Floor</label>
                    <input type="number" className="form-control" value={modalForm.floor} onChange={e => setModalForm(prev => ({ ...prev, floor: e.target.value }))} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Number</label>
                    <input className="form-control" value={modalForm.apartment_number} onChange={e => setModalForm(prev => ({ ...prev, apartment_number: e.target.value }))} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Building</label>
                    <input className="form-control" value={modalForm.building} onChange={e => setModalForm(prev => ({ ...prev, building: e.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Rent</label>
                    <input type="number" step="0.01" className="form-control" value={modalForm.rent_amount} onChange={e => setModalForm(prev => ({ ...prev, rent_amount: e.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={modalForm.status || 'available'} onChange={e => setModalForm(prev => ({ ...prev, status: e.target.value }))}>
                      <option value="available">available</option>
                      <option value="occupied">occupied</option>
                      <option value="maintenance">maintenance</option>
                    </select>
                  </div>
                  {/* status is derived from tenants; manual status field removed */}
                </div>
                <div className="mt-3 d-flex justify-content-end">
                  <button type="button" className="btn btn-secondary me-2" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? (modalMode === 'edit' ? 'Saving...' : 'Creating...') : (modalMode === 'edit' ? 'Save Changes' : 'Create Apartment')}</button>
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

export default ApartmentManagement;
