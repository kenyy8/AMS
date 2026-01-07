import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../axiosConfig";
import { canonicalizeBillType, displayBillType } from '../../utils/billTypes';
import { showToast } from '../../toastService';
// styles consolidated into App.css
import { formatMeterNumber } from '../../utils/numberFormat';

const BillManagement = () => {
  // navigation is handled elsewhere in toolbar; keep navigate available for future actions
  // keep navigate available for toolbar actions; silence unused-var warning
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [bills, setBills] = useState([]);
  // split views
  const [pendingBills, setPendingBills] = useState([]);
  const [paidBills, setPaidBills] = useState([]);
  // pausedFilter removed: pause is now tenant-scoped via TenantManagement
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [creating, setCreating] = useState(false);
  const [bulkBillForm, setBulkBillForm] = useState({
    tenant_id: "",
    rent_amount: "0",
    water_amount: "0",
    electricity_amount: "0",
    due_date: ""
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editForm, setEditForm] = useState({
    bill_type: "",
    amount: "",
    due_date: ""
  });
  const [editingBill, setEditingBill] = useState(null);
  // use global toast service (showToast imported)

  // ✅ New state to store selected tenant
  const [selectedTenant, setSelectedTenant] = useState(null);
  // removed QR state: QR generation removed from Bills page
  // Billing history state for collapsible panel
  // eslint-disable-next-line no-unused-vars
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [deviceMap, setDeviceMap] = useState({});
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [historyEditRow, setHistoryEditRow] = useState(null);
  const [historyEditForm, setHistoryEditForm] = useState({
    tenant_name: '',
    apartment_number: '',
    meter_type: '',
    previous_reading: '',
    present_reading: '',
    consumption: '',
    rate: '',
    total_cost: '',
    recorded_at: ''
  });
  const [showHistoryDeleteConfirm, setShowHistoryDeleteConfirm] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null, loading: false });
  // Payment modal state
  // Global toolbar paid date (date-only). Default to today.
  const todayIso = (new Date()).toISOString().split('T')[0];
  const [globalPaidDate, setGlobalPaidDate] = useState(todayIso);
  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);

  // Filters & selection for batch actions
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState('all');
  // new filter for payment type (RENT or UTILITY) for payment history and exports
  const [filterPaymentType, setFilterPaymentType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortBy, setSortBy] = useState({ field: 'due_date', dir: 'asc' });
  // UI: collapsed state per bill type groups (pending & paid use same keys)
  const [expandedGroups, setExpandedGroups] = useState({ rent: false, water: false, electricity: false });
  // separate expand state for history groups
  const [expandedHistoryGroups, setExpandedHistoryGroups] = useState({ electricity: false, water: false });

  // initial load: tenants + all bills
  useEffect(() => {
    const load = async () => {
      try {
        const [tenantsRes, billsRes] = await Promise.all([
          axios.get('/api/tenants'),
          axios.get('/api/bills')
        ]);
        setTenants(tenantsRes.data);
  setBills(billsRes.data || []);
        // load payment history for Payment History table
        try {
          const ph = await axios.get('/api/payment-history');
          setPaymentHistoryRows(Array.isArray(ph.data) ? ph.data : []);
        } catch (e) {
          console.warn('Failed to load payment history', e);
        }
        console.debug('BillManagement: loaded tenants', tenantsRes.data.length, 'loaded bills', billsRes.data.length);
      } catch (e) {
        console.error('Failed to load bills data', e);
    showToast('Failed to load bills data', 'error');
      }
      setLoading(false);
    };
    load();
  }, []);

  // whenever selectedTenant changes, refresh the bills list appropriately
  // refreshBills is stable within this component lifecycle; suppress exhaustive-deps
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { refreshBills(); }, [selectedTenant]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // reload bills when other components signal an update (e.g., tenant pause/resume)
  const refreshBills = async () => {
    try {
      if (selectedTenant && selectedTenant.id) {
        const res = await axios.get(`/api/bills?tenantId=${selectedTenant.id}`);
        setBills(res.data || []);
      } else {
        // when no tenant is selected, fetch all bills instead of clearing the list
        const res = await axios.get('/api/bills');
        setBills(res.data || []);
      }
      // refresh payment history as well
      try {
        const ph = await axios.get('/api/payment-history');
        setPaymentHistoryRows(Array.isArray(ph.data) ? ph.data : []);
      } catch (e) {
        console.warn('Failed to refresh payment history', e);
      }
    } catch (e) {
      console.warn('Failed to refresh bills', e);
    }
  };

  // whenever bills change, split into pending vs paid
  useEffect(() => {
    const pending = (bills || []).filter(b => b.status !== 'paid');
    const paid = (bills || []).filter(b => b.status === 'paid');
    setPendingBills(pending);
    setPaidBills(paid);
  }, [bills]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'billsUpdated') {
        refreshBills();
      }
    };
    const onEvent = () => {
      refreshBills();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('billsUpdated', onEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('billsUpdated', onEvent);
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleTenantSelect = (tenantId) => {
  const id = typeof tenantId === 'string' ? parseInt(tenantId, 10) : tenantId;
  const tenant = tenants.find(t => t.id === id);
  setSelectedTenant(tenant || null);
  setBulkBillForm({ ...bulkBillForm, tenant_id: id });
  // Auto-fetch apartment rent and latest Meter readings for this tenant's apartment
  if (tenant) {
    (async () => {
      try {
        // fetch apartment details (rent) if tenant has apartment_id
        let rent = bulkBillForm.rent_amount || '0';
        if (tenant.apartment_id) {
          const aRes = await axios.get(`/api/apartments`);
          const apartments = Array.isArray(aRes.data) ? aRes.data : [];
          const found = apartments.find(a => String(a.id) === String(tenant.apartment_id));
          if (found && (found.rent_amount !== null && found.rent_amount !== undefined)) rent = String(found.rent_amount);
        }

  // fetch meter devices for tenant/apartment to get latest readings
          // backend exposes /api/meter-devices which may return devices array
        let water = bulkBillForm.water_amount || '0';
        let electricity = bulkBillForm.electricity_amount || '0';
        try {
            const devRes = await axios.get('/api/meter-devices');
          const payload = devRes.data && devRes.data.devices ? devRes.data.devices : devRes.data || [];
          // try to find devices linked to tenant's apartment
          const aptId = tenant.apartment_id;
          if (aptId) {
            const forApt = payload.filter(d => String(d.apartment_id) === String(aptId) || String(d.apartment_id) === String(tenant.apartment_id) || String(d.apartment_number) === String(tenant.apartment_number));
            // heuristic: electric device vs water device by meter_type or device.type
            const elec = forApt.find(d => (d.meter_type && d.meter_type.toLowerCase().includes('electric')) || (d.type && String(d.type).toLowerCase().includes('electric')));
            const wat = forApt.find(d => (d.meter_type && d.meter_type.toLowerCase().includes('water')) || (d.type && String(d.type).toLowerCase().includes('water')));
            if (elec) {
              // if device exposes total_cost or consumption or present_reading, try to use total_cost as amount or compute
              if (elec.total_cost !== null && elec.total_cost !== undefined) electricity = String(elec.total_cost);
              else if (elec.total !== null && elec.total !== undefined) electricity = String(elec.total);
              else if (elec.present_reading !== null && elec.present_reading !== undefined && elec.previous_reading !== null && elec.previous_reading !== undefined && elec.rate !== null && elec.rate !== undefined) {
                const usage = Math.max(0, Number(elec.present_reading) - Number(elec.previous_reading));
                electricity = String((usage * Number(elec.rate)).toFixed(2));
              } else if (elec.current_reading != null) electricity = String(elec.current_reading);
            }
            if (wat) {
              if (wat.total_cost !== null && wat.total_cost !== undefined) water = String(wat.total_cost);
              else if (wat.total !== null && wat.total !== undefined) water = String(wat.total);
              else if (wat.present_reading !== null && wat.present_reading !== undefined && wat.previous_reading !== null && wat.previous_reading !== undefined && wat.rate !== null && wat.rate !== undefined) {
                const usage = Math.max(0, Number(wat.present_reading) - Number(wat.previous_reading));
                water = String((usage * Number(wat.rate)).toFixed(2));
              } else if (wat.current_reading != null) water = String(wat.current_reading);
            }
          }
        } catch (e) {
            // ignore meter fetch errors — keep existing values
          console.warn('Failed to fetch meter devices for tenant autofill', e);
        }

        // update form with fetched values but keep fields editable
        setBulkBillForm(prev => ({ ...prev, tenant_id: id, rent_amount: rent, water_amount: water, electricity_amount: electricity }));
      } catch (err) {
        console.warn('Auto-fill on tenant select failed', err);
      }
    })();
  }
  };

  const createBulkBills = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setCreating(true);
    try {
      // create three bills for the selected tenant (rent, water, electricity)
      const tenantIdInt = parseInt(bulkBillForm.tenant_id, 10);
      const billsToCreate = [
        { tenant_id: tenantIdInt, bill_type: canonicalizeBillType('rent'), amount: Number(bulkBillForm.rent_amount), due_date: bulkBillForm.due_date },
        { tenant_id: tenantIdInt, bill_type: canonicalizeBillType('water'), amount: Number(bulkBillForm.water_amount), due_date: bulkBillForm.due_date },
        { tenant_id: tenantIdInt, bill_type: canonicalizeBillType('electricity'), amount: Number(bulkBillForm.electricity_amount), due_date: bulkBillForm.due_date }
      ].filter(bill => bill.amount > 0 && bill.tenant_id && bill.due_date);
      if (billsToCreate.length === 0) throw new Error("No valid bills to create");
      const resp = await axios.post("/api/bills/bulk", billsToCreate);
      console.debug('BillManagement: bulk create resp', resp.data);

      // optimistic update: refresh from server after creation
  await refreshBills();
  try { await loadBillingHistory(); } catch(_){}
  setShowCreateModal(false);
  setBulkBillForm(prev => ({ ...prev, rent_amount: '0', water_amount: '0', electricity_amount: '0', due_date: '' }));
  showToast(`Bills created successfully!`, 'success');
    } catch (e) {
      console.error("Create bulk bills failed", e);
  showToast("Failed to create bills. Please try again.", 'error');
    }
    setCreating(false);
  };

  // load billing history (can be filtered by selectedTenant)
  const loadBillingHistory = async () => {
    setHistoryLoading(true);
    try {
      const q = new URLSearchParams();
      if (selectedTenant && selectedTenant.id) q.append('tenant', selectedTenant.id);
      // fetch billing history and devices in parallel so we can infer missing meter types
      const [histRes, devRes] = await Promise.all([
  axios.get('/api/meter-devices/meter-history?' + q.toString()),
    axios.get('/api/meter-devices')
      ]);
      const devices = Array.isArray(devRes.data) ? devRes.data : (devRes.data && devRes.data.devices ? devRes.data.devices : []);
      // build map by device_id and by apartment_number for quick lookup
      const map = {};
      devices.forEach(d => {
        if (d.device_id) map[String(d.device_id)] = d;
        if (d.id) map[String(d.id)] = d;
        if (d.apartment_number) map[`apt:${String(d.apartment_number)}`] = d;
      });
      setDeviceMap(map);
      const rows = (histRes.data || []).map(r => {
        // Prefer reading_date when available (server may use different names). Normalize to recorded_at
        const copy = { ...r };
        if (r.reading_date && !r.recorded_at) {
          // reading_date may be date-only (YYYY-MM-DD) or full ISO; keep as-is
          copy.recorded_at = r.reading_date;
        }
        // try to infer meter_type from device map when missing
        const keyCandidates = [r.device_id, r.deviceId, r.id, `apt:${r.apartment_number}`, `apt:${r.apartment_id}`];
        for (const k of keyCandidates) {
          if (!k) continue;
          const dev = map[String(k)];
          if (dev && (dev.meter_type || dev.type)) { copy.inferred_meter_type = dev.meter_type || dev.type; break; }
        }
        return copy;
      });
      // Normalize recorded_at to date-only strings for UI convenience
      const normalized = rows.map(rr => {
        const out = { ...rr };
        const raw = out.recorded_at || out.updated_at || out.updatedAt || '';
        if (raw) {
          // If raw contains a time, parse and keep only the date portion
          try {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) out.recorded_at = d.toISOString().split('T')[0];
            else out.recorded_at = String(raw).split('T')[0];
          } catch (e) {
            out.recorded_at = String(raw).split('T')[0];
          }
        }
        return out;
      });
      setHistoryRows(normalized);
    } catch (e) {
      console.error('Failed to load billing history', e);
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // load billing history immediately on mount and when tenant changes
  useEffect(() => {
    loadBillingHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenant]);

  // friendly type for billing history rows (robust against different field names)
  const friendlyHistoryType = (row) => {
  const candidates = [];
  if (!row) return 'Unknown';
  // prefer inferred meter type (from devices lookup)
  if (row.inferred_meter_type) candidates.push(row.inferred_meter_type);
  // collect known field names
  ['meter_type','type','meterType','type_name','meter','meter_type_name','meter_type_display','meterTypeDisplay'].forEach(k => { if (row[k] !== null && row[k] !== undefined) candidates.push(row[k]); });
  if (row.device && row.device.type) candidates.push(row.device.type);
  // first non-empty candidate
  const raw = candidates.find(v => v !== undefined && v !== null && String(v).trim() !== '');
  const s = String(raw || '').toLowerCase();
  if (!s) return 'Unknown';
  if (s.includes('water')) return 'Water';
  if (s.includes('electric')) return 'Electricity';
  if (s.includes('elec')) return 'Electricity';
  if (s.includes('power')) return 'Electricity';
  // fallback: return cleaned/capitalized version
  const cleaned = String(raw).replace(/[_-]/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  // Format a date-like string to MM/DD/YYYY (prefer avoiding locale differences)
  const formatDateOnly = (raw) => {
    if (!raw) return '';
    try {
      // Accept ISO date or datetime or plain YYYY-MM-DD
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }
    } catch (e) {
      // fallback to manual split
    }
    const parts = String(raw).split('T')[0].split('-');
    if (parts.length >= 3) return `${parts[1].padStart(2,'0')}/${parts[2].padStart(2,'0')}/${parts[0]}`;
    return String(raw);
  };

  // Helper: infer payment_type from bill_type when payment_type is not present
  const inferPaymentType = (b) => {
    if (!b) return 'RENT';
    const t = (b.bill_type || b.type || '').toString().toLowerCase();
    if (t.includes('water') || t.includes('wtr')) return 'UTILITY';
    if (t.includes('electric') || t.includes('elec') || t.includes('power')) return 'UTILITY';
    return 'RENT';
  };

  const updateBill = async (e) => {
    e.preventDefault();
    try {
      // ensure bill_type is canonical before sending
      await axios.put(`/api/bills/${editingBill.id}`, {
        ...editForm,
        bill_type: canonicalizeBillType(editForm.bill_type),
        tenant_id: editingBill.tenant_id
      });
    setEditingBill(null);
    setEditForm({ bill_type: "", amount: "", due_date: "" });
  await refreshBills();
    showToast("Bill updated successfully!", 'success');
    } catch (e) {
      console.error("Update bill failed", e);
  showToast("Failed to update bill. Please try again.", 'error');
    }
  };

  // eslint-disable-next-line no-unused-vars
  const deleteBill = async (id) => {
    // use confirm modal instead of native confirm
    setConfirmState({
      open: true,
      title: 'Delete Bill',
      message: 'Are you sure you want to delete this bill? This cannot be undone.',
      loading: false,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }));
        try {
          await axios.delete(`/api/bills/${id}`);
          await refreshBills();
          try { await loadBillingHistory(); } catch(_){}
          showToast('Bill deleted successfully!', 'success');
        } catch (e) {
          console.error('Delete bill failed', e);
          showToast('Failed to delete bill. Please try again.', 'error');
        }
        setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
      }
    });
  };

  // eslint-disable-next-line no-unused-vars
  const markPaid = async (id) => {
    // Single bill mark paid uses bulk endpoint with globalPaidDate
    try {
  const b = bills.find(x => x.id === id) || pendingBills.find(x => x.id === id) || paidBills.find(x => x.id === id) || {};
  const t = (b.bill_type || b.type || '').toString().toLowerCase();
  const paymentType = (t.includes('water') || t.includes('electric')) ? 'UTILITY' : 'RENT';
  const payload = { bill_ids: [id], paid_at: globalPaidDate, payment_types: { [String(id)]: paymentType } };
  await axios.post('/api/bills/pay', payload);
      await refreshBills();
      showToast('Payment recorded.', 'success');
    } catch (err) {
      console.error('Mark paid failed', err);
      showToast('Failed to record payment. Please try again.', 'error');
      try { await refreshBills(); } catch(_){}
    }
  };

  // per-bill modal removed — payments are recorded via toolbar global date and bulk endpoint

  // eslint-disable-next-line no-unused-vars
  const undoMarkPaid = async (id) => {
    // revert status to pending
    try {
  // call DELETE pay endpoint to remove payment_history
  await axios.delete(`/api/bills/${id}/pay`);
  await refreshBills();
  showToast('Payment reverted and bill is now pending.', 'success');
    } catch (e) {
      console.error('Undo mark paid failed', e);
  showToast('Failed to revert payment. Please try again.', 'error');
      try { await refreshBills(); } catch (r) { console.warn('Failed to refresh bills after undo', r); }
    }
  };

  // batch operations
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (list) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      list.forEach(b => next.add(b.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // eslint-disable-next-line no-unused-vars
  const batchMarkPaid = async () => {
  if (selectedIds.size === 0) return showToast('No bills selected', 'info');
  setConfirmState({
    open: true,
    title: 'Mark Paid',
  message: `Mark ${selectedIds.size} bill(s) as paid (date: ${globalPaidDate})?`,
    loading: false,
      onConfirm: async () => {
      setConfirmState(prev => ({ ...prev, loading: true }));
      try {
    // build payment_types map to ensure utility/rent classification is preserved when recording
    const ids = Array.from(selectedIds);
    const payment_types = {};
    ids.forEach(id => {
      const b = bills.find(x => x.id === id) || pendingBills.find(x => x.id === id) || paidBills.find(x => x.id === id) || {};
      const t = (b.bill_type || b.type || '').toString().toLowerCase();
      payment_types[String(id)] = (t.includes('water') || t.includes('electric')) ? 'UTILITY' : 'RENT';
    });
    const payload = { bill_ids: ids, paid_at: globalPaidDate, payment_types };
    await axios.post('/api/bills/pay', payload);
        await refreshBills();
        clearSelection();
        showToast('Marked selected bills as paid', 'success');
      } catch (e) {
        console.error('Batch mark paid failed', e);
        showToast('Failed to mark some bills as paid', 'error');
        await refreshBills();
      }
      setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
    }
  });
  };

  // eslint-disable-next-line no-unused-vars
  const batchDelete = async () => {
  if (selectedIds.size === 0) return showToast('No bills selected', 'info');
  setConfirmState({
    open: true,
    title: 'Delete Bills',
    message: `Delete ${selectedIds.size} bill(s)? This cannot be undone.`,
    loading: false,
    onConfirm: async () => {
      setConfirmState(prev => ({ ...prev, loading: true }));
      try {
        await Promise.all(Array.from(selectedIds).map(id => axios.delete(`/api/bills/${id}`)));
        await refreshBills();
        clearSelection();
        try { await loadBillingHistory(); } catch(_){}
        showToast('Deleted selected bills', 'success');
      } catch (e) {
        console.error('Batch delete failed', e);
        showToast('Failed to delete some bills', 'error');
        await refreshBills();
      }
      setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
    }
  });
  };

  const exportCSV = () => {
    // simple CSV export of selected or all visible bills
    const rows = bills.filter(b => selectedIds.size === 0 || selectedIds.has(b.id));
  if (rows.length === 0) return showToast('No bills to export', 'info');
  const header = ['id','tenant','type','payment_type','amount','due_date','status'];
  const csv = [header.join(',')].concat(rows.map(r => [r.id, `"${r.tenant_name||''}"`, r.bill_type, (r.payment_type||inferPaymentType(r)), Number(r.amount).toFixed(2), r.due_date, r.status].join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bills_export.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleHistorySelect = (id) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllHistoryVisible = (list) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      list.forEach(r => next.add(r.id));
      return next;
    });
  };

  const clearHistorySelection = () => setSelectedHistoryIds(new Set());

  // eslint-disable-next-line no-unused-vars
  const openHistoryEdit = () => {
    const ids = Array.from(selectedHistoryIds);
    if (ids.length === 0) return showToast('Select one history record to edit', 'info');
    if (ids.length > 1) return showToast('Please select only one history record to edit', 'info');
    const row = historyRows.find(r => r.id === ids[0]);
  if (!row) return showToast('Selected history row not found', 'error');
    setHistoryEditRow(row);
    setHistoryEditForm({
      tenant_name: row.tenant_name || '',
      apartment_number: row.apartment_number || '',
      meter_type: row.meter_type || row.type || '',
  previous_reading: row.previous_reading !== null && row.previous_reading !== undefined ? String(row.previous_reading) : '',
  present_reading: row.present_reading !== null && row.present_reading !== undefined ? String(row.present_reading) : '',
  consumption: row.consumption !== null && row.consumption !== undefined ? String(row.consumption) : '',
  rate: row.rate !== null && row.rate !== undefined ? String(row.rate) : '',
  total_cost: row.total_cost !== null && row.total_cost !== undefined ? String(row.total_cost) : '',
      recorded_at: row.recorded_at || row.updated_at || ''
    });
  };

  // Save history edit: attempt to update device reading by device_id (creates new history entry server-side)
  const saveHistoryEdit = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!historyEditRow) return;
    try {
      // attempt to update reading via deviceId (compatibility endpoint)
      // Use date-only reading_date when available so server can set last_updated accordingly
      const deviceId = historyEditRow.device_id || historyEditRow.deviceId || historyEditRow.device_id_string;
      const reading = Number(historyEditForm.present_reading);
      const reading_date = historyEditForm.recorded_at ? String(historyEditForm.recorded_at) : undefined;
      // POST /api/meter-devices/reading expects deviceId and reading. Many servers support reading_date or timestamp.
      const body = { deviceId, reading };
      if (reading_date) body.reading_date = reading_date;
      await axios.post('/api/meter-devices/reading', body);
      // refresh history and clear selection/modal
      await loadBillingHistory();
      clearHistorySelection();
      setHistoryEditRow(null);
      showToast('History updated (new reading added).', 'success');
    } catch (err) {
      console.error('Failed to save history edit', err);
      // optimistic UI: update local state so user sees effect (normalize recorded_at to date-only)
      setHistoryRows(prev => prev.map(r => r.id === historyEditRow.id ? ({
        ...r,
        ...historyEditForm,
        recorded_at: historyEditForm.recorded_at ? String(historyEditForm.recorded_at).split('T')[0] : r.recorded_at
      }) : r));
      setHistoryEditRow(null);
      clearHistorySelection();
  showToast('Saved locally. Server update failed or not supported.', 'error');
    }
  };

  const confirmHistoryDelete = () => {
    if (selectedHistoryIds.size === 0) return showToast('Select at least one history record', 'info');
    setShowHistoryDeleteConfirm(true);
  };

  const performHistoryDelete = async () => {
    const ids = Array.from(selectedHistoryIds);
    setShowHistoryDeleteConfirm(false);
    try {
      // attempt server-side delete (may not be supported)
  await Promise.all(ids.map(id => axios.delete(`/api/meter-devices/meter-history/${id}`)));
      await loadBillingHistory();
      clearHistorySelection();
      showToast('Deleted history record(s)', 'success');
    } catch (err) {
      console.warn('Server-side delete failed for billing history, applying local removal', err);
      // fallback: remove locally so UI updates
      setHistoryRows(prev => prev.filter(r => !selectedHistoryIds.has(r.id)));
      clearHistorySelection();
  showToast('Removed locally; server delete may not be available.', 'info');
    }
  };

  // derived filtered lists
  const filteredPending = useMemo(() => {
    return pendingBills.filter(b => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const matchName = (b.tenant_name||'').toLowerCase().includes(q);
        const matchType = (displayBillType(b.bill_type)||'').toLowerCase().includes(q) || (b.bill_type||'').toLowerCase().includes(q);
        const matchDate = b.due_date ? new Date(b.due_date).toISOString().split('T')[0].includes(q) || new Date(b.due_date).toLocaleDateString().toLowerCase().includes(q) : false;
        if (!(matchName || matchType || matchDate)) return false;
      }
      if (filterType !== 'all' && canonicalizeBillType(filterType) !== b.bill_type) return false;
      if (filterStatus !== 'all' && filterStatus !== b.status) return false;
      if (dateFrom) {
        const d = new Date(b.due_date).toISOString().split('T')[0];
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(b.due_date).toISOString().split('T')[0];
        if (d > dateTo) return false;
      }
      return true;
    }).sort((a,b) => {
  // Demote non-active tenant bills to the bottom
  const aActive = a.tenant_status === 'active';
  const bActive = b.tenant_status === 'active';
  if (aActive !== bActive) return aActive ? -1 : 1;
      const dir = sortBy.dir === 'asc' ? 1 : -1;
      if (sortBy.field === 'due_date') return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * dir;
      if (sortBy.field === 'tenant') return ((a.tenant_name||'').localeCompare(b.tenant_name||'')) * dir;
      if (sortBy.field === 'amount') return (Number(a.amount) - Number(b.amount)) * dir;
  if (sortBy.field === 'payment_type') return (( (a.payment_type||inferPaymentType(a)) ).localeCompare((b.payment_type||inferPaymentType(b)) )) * dir;
      return 0;
    });
  }, [pendingBills, searchText, dateFrom, dateTo, filterType, filterStatus, sortBy]);

  const filteredPaid = useMemo(() => {
    return paidBills.filter(b => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const matchName = (b.tenant_name||'').toLowerCase().includes(q);
        const matchType = (displayBillType(b.bill_type)||'').toLowerCase().includes(q) || (b.bill_type||'').toLowerCase().includes(q);
        const matchDate = b.due_date ? new Date(b.due_date).toISOString().split('T')[0].includes(q) || new Date(b.due_date).toLocaleDateString().toLowerCase().includes(q) : false;
        if (!(matchName || matchType || matchDate)) return false;
      }
      if (filterType !== 'all' && canonicalizeBillType(filterType) !== b.bill_type) return false;
      if (filterStatus !== 'all' && filterStatus !== b.status) return false;
      if (dateFrom) {
        const d = new Date(b.due_date).toISOString().split('T')[0];
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(b.due_date).toISOString().split('T')[0];
        if (d > dateTo) return false;
      }
      return true;
    }).sort((a,b) => {
      const dir = sortBy.dir === 'asc' ? 1 : -1;
      if (sortBy.field === 'due_date') return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * dir;
      if (sortBy.field === 'tenant') return ((a.tenant_name||'').localeCompare(b.tenant_name||'')) * dir;
      if (sortBy.field === 'amount') return (Number(a.amount) - Number(b.amount)) * dir;
  if (sortBy.field === 'payment_type') return (( (a.payment_type||inferPaymentType(a)) ).localeCompare((b.payment_type||inferPaymentType(b)) )) * dir;
      return 0;
    });
  }, [paidBills, searchText, dateFrom, dateTo, filterType, filterStatus, sortBy]);

  // Derived payment history list (reads from paymentHistoryRows returned from /api/payment-history)
  /* eslint-disable react-hooks/exhaustive-deps */
  const filteredPaymentHistory = useMemo(() => {
    const rows = paymentHistoryRows || [];
    return rows.filter(ph => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const matchName = (ph.tenant_name||'').toLowerCase().includes(q) || String(ph.tenant_id||'').toLowerCase().includes(q);
        const matchType = (displayBillType(ph.bill_type)||'').toLowerCase().includes(q) || (ph.bill_type||'').toLowerCase().includes(q);
        const matchDate = ph.paid_at ? new Date(ph.paid_at).toISOString().split('T')[0].includes(q) : false;
        if (!(matchName || matchType || matchDate)) return false;
      }
  if (filterType !== 'all' && canonicalizeBillType(filterType) !== ph.bill_type) return false;
  if (filterPaymentType !== 'all' && String((ph.payment_type||'RENT')).toUpperCase() !== String(filterPaymentType).toUpperCase()) return false;
      if (dateFrom) {
        const d = ph.paid_at ? new Date(ph.paid_at).toISOString().split('T')[0] : '';
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = ph.paid_at ? new Date(ph.paid_at).toISOString().split('T')[0] : '';
        if (d > dateTo) return false;
      }
      return true;
    }).sort((a,b) => {
      const dir = sortBy.dir === 'asc' ? 1 : -1;
      if (sortBy.field === 'due_date') return (new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()) * dir;
      if (sortBy.field === 'tenant') return ((a.tenant_name||'').localeCompare(b.tenant_name||'')) * dir;
      if (sortBy.field === 'amount') return (Number(a.amount_paid) - Number(b.amount_paid)) * dir;
      return 0;
    });
  }, [paymentHistoryRows, searchText, dateFrom, dateTo, filterType, sortBy]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Helper: group bills by canonical type and sort by due date DESC by default for group display
  // Group bills into only the 3 valid categories and sort by due_date DESC
  const groupAndSort = (list) => {
    const groups = { rent: [], water: [], electricity: [] };
    (list || []).forEach(b => {
      const t = canonicalizeBillType(b.bill_type || b.type || '') || '';
      if (t === 'rent' || t === 'water' || t === 'electricity') groups[t].push(b);
      // intentionally ignore other types to remove 'Other Bills'
    });
    // sort each group by due_date DESC
    Object.keys(groups).forEach(k => {
      groups[k].sort((a,b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
    });
    return groups;
  };

  // When searching, we should override collapsed limiting and show all matching bills per requirement
  const shouldOverrideCollapse = Boolean(searchText && String(searchText).trim().length > 0) || filterType !== 'all' || dateFrom || dateTo;

  const toggleGroup = (group) => setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  const toggleHistoryGroup = (group) => setExpandedHistoryGroups(prev => ({ ...prev, [group]: !prev[group] }));

  // Bill-level pause/resume removed. Pause functionality is now tenant-scoped.

  if (loading) return <div className="container-fluid"><div className="text-center">Loading bills...</div></div>;

  return (
  <div className="container-fluid">
    {/* Local table overrides to ensure bill-group tables do not show white stripes */}
    <style>{`
      /* Target only tables inside bill-group-cards for safe overrides */
      .bill-group-card .bill-table, .bill-group-card .bill-table thead, .bill-group-card .bill-table tbody, .bill-group-card .bill-table tr { background-color: transparent !important; }
      .bill-group-card .bill-table td, .bill-group-card .bill-table th { background-color: transparent !important; vertical-align: middle; }
      /* keep a subtle row separator while the background is transparent */
      .bill-group-card .bill-table tbody tr td { border-bottom: 1px solid rgba(0,0,0,0.04); }
      /* ensure checkbox / first-cell sizing */
      .bill-group-card .bill-table td:first-child, .bill-group-card .bill-table th:first-child { padding-left: 12px; padding-right: 10px; width: 56px; text-align: center; }
    `}</style>

      {/* Create Bills modal (centered) */}
      {showCreateModal && (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreateModal(false)}>
          <div className="modal-dialog modal-md modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create Bills</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowCreateModal(false)}></button>
              </div>
              <form onSubmit={(e) => { createBulkBills(e); }}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Select Tenant</label>
                    <select className="form-select" value={bulkBillForm.tenant_id} onChange={(e) => handleTenantSelect(e.target.value)} required>
                      <option value="">Select apartment</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name} - {t.apartment_number}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Due Date</label>
                    <input type="date" className="form-control" value={bulkBillForm.due_date} onChange={(e) => setBulkBillForm(prev => ({ ...prev, due_date: e.target.value }))} required />
                  </div>
                  <div className="row">
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Rent Amount(PHP)</label>
                      <input type="number" className="form-control" value={bulkBillForm.rent_amount} onChange={(e) => setBulkBillForm(prev => ({ ...prev, rent_amount: e.target.value }))} min="0" step="0.01" />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Water Amount(PHP)</label>
                      <input type="number" className="form-control" value={bulkBillForm.water_amount} onChange={(e) => setBulkBillForm(prev => ({ ...prev, water_amount: e.target.value }))} min="0" step="0.01" />
                    </div>
                    <div className="col-md-4 mb-3">
                      <label className="form-label">Electricity Amount(PHP)</label>
                      <input type="number" className="form-control" value={bulkBillForm.electricity_amount} onChange={(e) => setBulkBillForm(prev => ({ ...prev, electricity_amount: e.target.value }))} min="0" step="0.01" />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary">Create Bills</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
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
      {/* Edit Modal (small, centered) */}
      {editingBill && (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setEditingBill(null)}>
          <div className="modal-dialog modal-sm modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Bill</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setEditingBill(null)}></button>
              </div>
              <form onSubmit={updateBill}>
                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label small">Tenant</label>
                    <input className="form-control" value={editingBill.tenant_name || editingBill.tenant_id} disabled />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small">Type</label>
                    <select className="form-select" value={editForm.bill_type} onChange={(e) => setEditForm(prev => ({ ...prev, bill_type: e.target.value }))}>
                      <option value="Rent">Rent</option>
                      <option value="Water">Water</option>
                      <option value="Electricity">Electricity</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label small">Amount</label>
                    <input type="number" className="form-control" value={editForm.amount} onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))} step="0.01" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small">Due Date</label>
                    <input type="date" className="form-control" value={editForm.due_date || ''} onChange={(e) => setEditForm(prev => ({ ...prev, due_date: e.target.value }))} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary btn-sm">Save</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingBill(null); setEditForm({ bill_type: '', amount: '', due_date: '' }); }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Payment modal: choose paid date and optionally amount */}
  {/* Per-bill payment modal removed — use the toolbar Mark Paid Date and bulk endpoints */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Bill Management</h2>
      </div>

  {/* Create modal and floating add button removed per redesign */}

      {/* Filters & toolbar */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label small">Search Tenant</label>
              <input className="form-control" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search by tenant name" />
            </div>
            <div className="col-md-2">
              <label className="form-label small">From</label>
              <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="form-label small">To</label>
              <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Bill Type</label>
              <select className="form-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All</option>
                <option value="rent">Rent</option>
                <option value="water">Water</option>
                <option value="electricity">Electricity</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Payment Type</label>
              <select className="form-select" value={filterPaymentType} onChange={(e) => setFilterPaymentType(e.target.value)}>
                <option value="all">All</option>
                <option value="RENT">Rent</option>
                <option value="UTILITY">Utility</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Status</label>
              <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="col-md-1 text-end">
              <button className="btn btn-outline-secondary" onClick={() => { setSearchText(''); setDateFrom(''); setDateTo(''); setFilterType('all'); setFilterStatus('all'); }}>Clear</button>
            </div>
          </div>
        </div>
      </div>

          {/* Top toolbar for batch actions - compact: only Export CSV placed above Pending Bills per task */}
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
                <button className="btn btn-outline-secondary me-2" onClick={exportCSV}>Export CSV</button>
                <button className="btn btn-primary me-2" onClick={() => setShowCreateModal(true)}>Create Bills</button>
                <label className="me-2 small">Mark Paid Date:</label>
                <input type="date" className="form-control d-inline-block" style={{ width: 180 }} value={globalPaidDate} onChange={(e) => setGlobalPaidDate(e.target.value)} />
              </div>
            <div>
              <label className="me-2 small">Sort:</label>
              <select className="form-select d-inline-block" style={{ width: 220 }} value={`${sortBy.field}:${sortBy.dir}`} onChange={(e) => { const [f,d] = e.target.value.split(':'); setSortBy({ field: f, dir: d }); }}>
                <option value="due_date:asc">Date ↑</option>
                <option value="due_date:desc">Date ↓</option>
                <option value="tenant:asc">Tenant ↑</option>
                <option value="tenant:desc">Tenant ↓</option>
                <option value="amount:asc">Amount ↑</option>
                <option value="amount:desc">Amount ↓</option>
                <option value="payment_type:asc">Payment Type ↑</option>
                <option value="payment_type:desc">Payment Type ↓</option>
              </select>
            </div>
          </div>

      {/* Pending Bills grouped by type */}
      <div className="card mb-3">
        <div className="card-header d-flex justify-content-between align-items-center">
          <div>Pending Bills</div>
          <div className="btn-toolbar">
            <div className="btn-group me-2">
              <button className="btn btn-success btn-sm" onClick={() => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return showToast('Select at least one bill', 'info');
                setConfirmState({
                  open: true,
                  title: 'Mark Paid',
                  message: `Mark ${ids.length} bill(s) as paid (date: ${globalPaidDate})?`,
                  loading: false,
                  onConfirm: async () => {
                    setConfirmState(prev => ({ ...prev, loading: true }));
                    try {
                      const payment_types = {};
                      ids.forEach(id => {
                        const b = bills.find(x => x.id === id) || pendingBills.find(x => x.id === id) || {};
                        const t = (b.bill_type || b.type || '').toString().toLowerCase();
                        payment_types[String(id)] = (t.includes('water') || t.includes('electric')) ? 'UTILITY' : 'RENT';
                      });
                      await axios.post('/api/bills/pay', { bill_ids: ids, paid_at: globalPaidDate, payment_types });
                      refreshBills(); clearSelection(); showToast('Marked as paid', 'success');
                    } catch (e) {
                      refreshBills(); showToast('Failed to mark some bills as paid', 'error');
                    }
                    setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                  }
                });
              }}>Mark Paid</button>
            </div>
            <div className="btn-group">
              <button className="btn btn-outline-danger btn-sm" onClick={() => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return showToast('Select at least one bill', 'info');
                setConfirmState({
                  open: true,
                  title: 'Delete Bills',
                  message: `Delete ${ids.length} bill(s)? This cannot be undone.`,
                  loading: false,
                  onConfirm: async () => {
                    setConfirmState(prev => ({ ...prev, loading: true }));
                    try {
                      await Promise.all(ids.map(id => axios.delete(`/api/bills/${id}`)));
                      refreshBills(); clearSelection(); showToast('Deleted', 'success');
                    } catch (e) {
                      refreshBills(); showToast('Failed to delete some bills', 'error');
                    }
                    setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                  }
                });
              }}>Delete</button>
            </div>
          </div>
        </div>
        <div className="card-body">
          {filteredPending.length === 0 ? (
            <p className="text-muted">No pending bills.</p>
          ) : (
            <div>
              {/* render grouped sections */}
              {(() => {
                const groups = groupAndSort(filteredPending);
                const order = ['rent','water','electricity'];
                return order.map(key => {
                  const list = groups[key] || [];
                  const label = key === 'rent' ? 'Rent Bills' : key === 'water' ? 'Water Bills' : 'Electricity Bills';
                  const icon = key === 'rent' ? '🏠' : key === 'water' ? '💧' : '⚡';
                  const cardClass = key === 'rent' ? 'bill-group-rent' : key === 'water' ? 'bill-group-water' : 'bill-group-electricity';
                  const isExpanded = !!expandedGroups[key];
                  const showAll = shouldOverrideCollapse || isExpanded;
                  const visible = showAll ? list : list.slice(0,3);
                  return (
                    <div className={`bill-group-card ${cardClass}`} key={`pending-group-${key}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="bill-group-label"><span className="bill-group-icon">{icon}</span> {label} <span className="small text-muted">({list.length})</span></div>
                        <div>
                          {list.length > 3 && !shouldOverrideCollapse && (
                            <button className="btn btn-sm btn-link" onClick={() => toggleGroup(key)}>{isExpanded ? 'View Less' : 'View More'}</button>
                          )}
                        </div>
                      </div>
                      {list.length === 0 ? (
                        <div className="text-muted small">No {label.toLowerCase()}.</div>
                      ) : (
                        <div className="table-responsive">
                          <table className="table bill-table table-hover">
                              <thead>
                              <tr>
                                <th style={{ width: 56 }}><input type="checkbox" onChange={(e) => { if (e.target.checked) selectAllVisible(list); else clearSelection(); }} checked={list.length>0 && list.every(b => selectedIds.has(b.id))} /></th>
                                <th>Tenant</th>
                                <th>Type</th>
                                <th>Payment Type</th>
                                <th>Amount</th>
                                <th>Due Date</th>
                                <th>Status</th>
                                <th style={{ width: 56, textAlign: 'center' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visible.map(bill => {
                                const tenantActive = bill.tenant_status === 'active';
                                const statusClass = bill.status === 'paid' ? 'paid' : bill.status === 'overdue' ? 'overdue' : 'pending';
                                return (
                                  <tr key={bill.id} className="bill-row" style={{ backgroundColor: !tenantActive ? '#f8f9fa' : 'transparent', color: !tenantActive ? '#6c757d' : 'inherit' }}>
                                    <td><input type="checkbox" checked={selectedIds.has(bill.id)} onChange={() => toggleSelect(bill.id)} /></td>
                                    <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span className="bill-row-icon">{icon}</span>
                                      <span style={{ flex: 1 }}>{bill.tenant_name || bill.tenant_id}</span>
                                    </td>
                                    <td>{displayBillType(bill.bill_type)}</td>
                                    <td>{(bill.payment_type || inferPaymentType(bill))}</td>
                                    <td>{formatMeterNumber(bill.amount)}</td>
                                    <td>{bill.due_date ? new Date(bill.due_date).toLocaleDateString() : ''}</td>
                                    <td>
                                      <span className={`status-badge ${statusClass}`}>{bill.status}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <button title="Edit" aria-label={`Edit bill ${bill.id}`} className="edit-icon" onClick={() => {
                                          setEditingBill(bill); setEditForm({ bill_type: displayBillType(bill.bill_type), amount: String(bill.amount), due_date: bill.due_date || '' });
                                        }}>
                                        ✏️
                                        <span className="visually-hidden">Edit</span>
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
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Paid Bills grouped by type */}
      <div className="card mb-5">
        <div className="card-header d-flex justify-content-between align-items-center">
          <div>Payment History</div>
          <div className="btn-toolbar">
            <div className="btn-group me-2">
              <button className="btn btn-warning btn-sm" onClick={() => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return showToast('Select at least one bill', 'info');
                setConfirmState({
                  open: true,
                  title: 'Revert Bills',
                  message: `Revert ${ids.length} bill(s) to unpaid?`,
                  loading: false,
                  onConfirm: async () => {
                    setConfirmState(prev => ({ ...prev, loading: true }));
                    try {
                      await axios.post('/api/bills/unpay', { bill_ids: ids });
                      refreshBills(); clearSelection(); showToast('Reverted', 'success');
                    } catch (e) {
                      refreshBills(); showToast('Failed to revert some bills', 'error');
                    }
                    setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                  }
                });
              }}>Unpaid</button>
            </div>
            <div className="btn-group">
              <button className="btn btn-outline-danger btn-sm" onClick={() => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return showToast('Select at least one bill', 'info');
                setConfirmState({
                  open: true,
                  title: 'Delete Bills',
                  message: `Delete ${ids.length} bill(s)? This cannot be undone.`,
                  loading: false,
                  onConfirm: async () => {
                    setConfirmState(prev => ({ ...prev, loading: true }));
                    try {
                      await Promise.all(ids.map(id => axios.delete(`/api/bills/${id}`)));
                      refreshBills(); clearSelection(); showToast('Deleted', 'success');
                    } catch (e) {
                      refreshBills(); showToast('Failed to delete some bills', 'error');
                    }
                    setConfirmState({ open: false, title: '', message: '', onConfirm: null, loading: false });
                  }
                });
              }}>Delete</button>
            </div>
          </div>
        </div>
        <div className="card-body">
          {filteredPaid.length === 0 ? (
            <p className="text-muted">No paid bills.</p>
          ) : (
            <div>
              {(() => {
                const groups = groupAndSort(filteredPaymentHistory.map(ph => ({
                  id: ph.bill_id,
                  // Prefer tenant name from tenants cache; fall back to any tenant_name on ph or tenant_id
                  tenant_name: (tenants && Array.isArray(tenants) ? (tenants.find(t => String(t.id) === String(ph.tenant_id)) || {}).name : null) || ph.tenant_name || ph.tenant_id,
                  bill_type: ph.bill_type,
                  amount: Number(ph.amount_paid || ph.amount || 0),
                  due_date: ph.due_date || ph.paid_at || '',
                  payment_paid_at: ph.paid_at,
                  status: 'paid'
                })));
                const order = ['rent','water','electricity'];
                return order.map(key => {
                  const list = groups[key] || [];
                  const label = key === 'rent' ? 'Rent Bills' : key === 'water' ? 'Water Bills' : 'Electricity Bills';
                  const icon = key === 'rent' ? '🏠' : key === 'water' ? '💧' : '⚡';
                  const cardClass = key === 'rent' ? 'bill-group-rent' : key === 'water' ? 'bill-group-water' : 'bill-group-electricity';
                  const isExpanded = !!expandedGroups[key];
                  const showAll = shouldOverrideCollapse || isExpanded;
                  const visible = showAll ? list : list.slice(0,3);
                  return (
                    <div className={`bill-group-card ${cardClass}`} key={`paid-group-${key}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="bill-group-label"><span className="bill-group-icon">{icon}</span> {label} <span className="small text-muted">({list.length})</span></div>
                        <div>
                          {list.length > 3 && !shouldOverrideCollapse && (
                            <button className="btn btn-sm btn-link" onClick={() => toggleGroup(key)}>{isExpanded ? 'View Less' : 'View More'}</button>
                          )}
                        </div>
                      </div>
                      {list.length === 0 ? (
                        <div className="text-muted small">No {label.toLowerCase()}.</div>
                      ) : (
                        <div className="table-responsive">
                          <table className="table bill-table table-hover">
                            <thead>
                              <tr>
                                <th style={{ width: 56 }}><input type="checkbox" onChange={(e) => { if (e.target.checked) selectAllVisible(list); else clearSelection(); }} checked={list.length>0 && list.every(b => selectedIds.has(b.id))} /></th>
                                <th>Tenant</th>
                                <th>Type</th>
                                <th>Payment Type</th>
                                <th>Amount</th>
                                <th>Paid Date</th>
                                <th>Status</th>
                                <th style={{ width: 56, textAlign: 'center' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visible.map(bill => {
                                const tenantActive = bill.tenant_status === 'active';
                                const statusClass = bill.status === 'paid' ? 'paid' : bill.status === 'overdue' ? 'overdue' : 'pending';
                                return (
                                  <tr key={bill.id} className="bill-row" style={{ backgroundColor: !tenantActive ? '#f8f9fa' : 'transparent', color: !tenantActive ? '#6c757d' : 'inherit' }}>
                                    <td><input type="checkbox" checked={selectedIds.has(bill.id)} onChange={() => toggleSelect(bill.id)} /></td>
                                    <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span className="bill-row-icon">{icon}</span>
                                      <span style={{ flex: 1 }}>{bill.tenant_name || bill.tenant_id}</span>
                                    </td>
                                    <td>{displayBillType(bill.bill_type)}</td>
                                    <td>{(paymentHistoryRows.find(ph => String(ph.bill_id) === String(bill.id)) || {}).payment_type || inferPaymentType(bill)}</td>
                                    <td>{formatMeterNumber(bill.amount)}</td>
                                    <td>{bill.payment_paid_at ? new Date(bill.payment_paid_at).toLocaleDateString() : ''}</td>
                                    <td><span className={`status-badge ${statusClass}`}>{bill.status}</span></td>
                                    <td style={{ textAlign: 'center' }}>
                                      <button title="Edit" aria-label={`Edit bill ${bill.id}`} className="edit-icon" onClick={() => {
                                          const b = bills.find(x => x.id === bill.id) || bill;
                                          setEditingBill(b); setEditForm({ bill_type: displayBillType(b.bill_type), amount: String(b.amount), due_date: b.due_date || '' });
                                        }}>
                                        ✏️
                                        <span className="visually-hidden">Edit</span>
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
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

  {/* Meter History section (Meter device updates) - grouped by meter type */}
      <div className="card mb-5">
        <div className="card-header d-flex justify-content-between align-items-center">
          <div>Meter History</div>
          <div className="d-flex align-items-center">
            <div className="btn-group me-2">
              <button className="btn btn-outline-danger btn-sm" onClick={confirmHistoryDelete}>Delete</button>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={loadBillingHistory}>{historyLoading ? 'Loading...' : 'Refresh'}</button>
          </div>
        </div>
        <div className="card-body">
          {historyRows.length === 0 ? (
            <p className="text-muted">No billing history found.</p>
          ) : (
            <div>
              {/* group history rows into electricity and water based on friendlyHistoryType */}
              {(() => {
                const groups = { electricity: [], water: [] };
                historyRows.forEach(r => {
                  const t = (friendlyHistoryType(r) || '').toLowerCase();
                  if (t.includes('water')) groups.water.push(r);
                  else groups.electricity.push(r);
                });
                const order = ['electricity','water'];
                return order.map(key => {
                  const list = groups[key] || [];
                  const label = key === 'electricity' ? 'Electricity Meter History' : 'Water Meter History';
                  const icon = key === 'electricity' ? '⚡' : '💧';
                  const isExpanded = !!expandedHistoryGroups[key];
                  const showAll = shouldOverrideCollapse || isExpanded;
                  const visible = showAll ? list : list.slice(0,3);
                  return (
                    <div className={`bill-group-card ${key === 'electricity' ? 'bill-group-electricity' : 'bill-group-water'}`} key={`hist-${key}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="bill-group-label"><span className="bill-group-icon">{icon}</span> {label} <span className="small text-muted">({list.length})</span></div>
                        <div>
                          {list.length > 3 && !shouldOverrideCollapse && (
                            <button className="btn btn-sm btn-link view-more-btn" onClick={() => toggleHistoryGroup(key)}>{isExpanded ? 'View Less' : 'View More'}</button>
                          )}
                        </div>
                      </div>
                      {list.length === 0 ? (
                        <div className="text-muted small">No {label.toLowerCase()}.</div>
                      ) : (
                        <div className="table-responsive">
                          <table className="table bill-table table-hover">
                            <thead>
                              <tr>
                                <th style={{ width: 56 }}><input type="checkbox" onChange={(e) => { if (e.target.checked) selectAllHistoryVisible(list); else clearHistorySelection(); }} checked={list.length>0 && list.every(r => selectedHistoryIds.has(r.id))} /></th>
                                <th>Tenant</th>
                                <th>Apartment</th>
                                <th>Type</th>
                                <th>Previous</th>
                                <th>Present</th>
                                <th>Consumption</th>
                                <th>Rate</th>
                                <th>Total Cost</th>
                                <th>Updated</th>
                                <th style={{ width: 56, textAlign: 'center' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visible.map(r => (
                                <tr key={r.id} className="bill-row" style={{ backgroundColor: 'transparent' }}>
                                  <td><input type="checkbox" checked={selectedHistoryIds.has(r.id)} onChange={() => toggleHistorySelect(r.id)} /></td>
                                  <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="bill-row-icon">{key === 'electricity' ? '⚡' : '💧'}</span>
                                    <span style={{ flex: 1 }}>{r.tenant_name}</span>
                                  </td>
                                  <td>{r.apartment_number || r.apartment_id}</td>
                                  <td>{friendlyHistoryType(r)}</td>
                                  <td>{r.previous_reading != null ? formatMeterNumber(r.previous_reading) : ''}</td>
                                  <td>{r.present_reading != null ? formatMeterNumber(r.present_reading) : ''}</td>
                                  <td>{r.consumption != null ? formatMeterNumber(r.consumption) : ''}</td>
                                  <td>{r.rate != null ? formatMeterNumber(r.rate) : ''}</td>
                                  <td>{r.total_cost != null ? formatMeterNumber(r.total_cost) : ''}</td>
                                  <td>{r.recorded_at ? formatDateOnly(r.recorded_at) : (r.updated_at ? formatDateOnly(r.updated_at) : '')}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button title="Edit" aria-label={`Edit history ${r.id}`} className="edit-icon" onClick={() => {
                                      setHistoryEditRow(r);
                                      setHistoryEditForm({
                                        tenant_name: r.tenant_name || '',
                                        apartment_number: r.apartment_number || '',
                                        meter_type: r.meter_type || r.type || '',
                                        previous_reading: r.previous_reading !== null && r.previous_reading !== undefined ? String(r.previous_reading) : '',
                                        present_reading: r.present_reading !== null && r.present_reading !== undefined ? String(r.present_reading) : '',
                                        consumption: r.consumption !== null && r.consumption !== undefined ? String(r.consumption) : '',
                                        rate: r.rate !== null && r.rate !== undefined ? String(r.rate) : '',
                                        total_cost: r.total_cost !== null && r.total_cost !== undefined ? String(r.total_cost) : '',
                                        recorded_at: r.recorded_at || r.updated_at || ''
                                      });
                                    }}>
                                      ✏️
                                      <span className="visually-hidden">Edit</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* History Edit Modal (centered, small) */}
      {historyEditRow && (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { setHistoryEditRow(null); }}>
          <div className="modal-dialog modal-lg modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 960 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Billing Record</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setHistoryEditRow(null)}></button>
              </div>
              <form onSubmit={saveHistoryEdit}>
                <div className="modal-body">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="mb-2">
                        <label className="form-label small">Tenant</label>
                        <input className="form-control" value={historyEditForm.tenant_name} onChange={(e) => setHistoryEditForm(prev => ({ ...prev, tenant_name: e.target.value }))} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label small">Apartment</label>
                        <input className="form-control" value={historyEditForm.apartment_number} onChange={(e) => setHistoryEditForm(prev => ({ ...prev, apartment_number: e.target.value }))} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label small">Type</label>
                        <select className="form-select" value={historyEditForm.meter_type} onChange={(e) => setHistoryEditForm(prev => ({ ...prev, meter_type: e.target.value }))}>
                          <option value="water_meter">Water</option>
                          <option value="electricity_meter">Electricity</option>
                        </select>
                      </div>
                      <div className="row">
                        <div className="col-6 mb-2">
                          <label className="form-label small">Previous</label>
                          <input type="number" step="0.001" className="form-control" value={historyEditForm.previous_reading} onChange={(e) => {
                            const v = e.target.value; setHistoryEditForm(prev => {
                              const present = Number(prev.present_reading || 0);
                              const previous = Number(v || 0);
                              const consumption = Number((present - previous).toFixed(3));
                              const rate = Number(prev.rate || 0);
                              const total = Number((consumption * rate).toFixed(2));
                              return { ...prev, previous_reading: v, consumption: String(consumption), total_cost: String(total) };
                            });
                          }} />
                        </div>
                        <div className="col-6 mb-2">
                          <label className="form-label small">Present</label>
                          <input type="number" step="0.001" className="form-control" value={historyEditForm.present_reading} onChange={(e) => {
                            const v = e.target.value; setHistoryEditForm(prev => {
                              const previous = Number(prev.previous_reading || 0);
                              const present = Number(v || 0);
                              const consumption = Number((present - previous).toFixed(3));
                              const rate = Number(prev.rate || 0);
                              const total = Number((consumption * rate).toFixed(2));
                              return { ...prev, present_reading: v, consumption: String(consumption), total_cost: String(total) };
                            });
                          }} />
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-2">
                        <label className="form-label small">Rate</label>
                        <input type="number" step="0.01" className="form-control" value={historyEditForm.rate} onChange={(e) => {
                          const v = e.target.value; setHistoryEditForm(prev => {
                            const rate = Number(v || 0);
                            const consumption = Number(prev.consumption || 0);
                            const total = Number((consumption * rate).toFixed(2));
                            return { ...prev, rate: v, total_cost: String(total) };
                          });
                        }} />
                      </div>
                      <div className="mb-2">
                        <label className="form-label small">Consumption</label>
                        <input type="number" step="0.001" className="form-control" value={historyEditForm.consumption} disabled />
                      </div>
                      <div className="mb-2">
                        <label className="form-label small">Total Cost</label>
                        <input type="number" step="0.01" className="form-control" value={historyEditForm.total_cost} disabled />
                      </div>
                      <div className="mb-2">
                        <label className="form-label small">Updated (date)</label>
                        <input type="date" className="form-control" value={historyEditForm.recorded_at ? (new Date(historyEditForm.recorded_at).toISOString().split('T')[0]) : ''} onChange={(e) => setHistoryEditForm(prev => ({ ...prev, recorded_at: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary btn-sm">Save</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setHistoryEditRow(null); }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation for history */}
      {showHistoryDeleteConfirm && (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowHistoryDeleteConfirm(false)}>
          <div className="modal-dialog modal-sm modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header"><h5 className="modal-title">Confirm Delete</h5></div>
              <div className="modal-body">Are you sure you want to delete the selected billing history record(s)? This action cannot be undone.</div>
              <div className="modal-footer">
                <button className="btn btn-danger btn-sm" onClick={performHistoryDelete}>Delete</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowHistoryDeleteConfirm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillManagement;
