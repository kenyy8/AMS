import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';

const QRCodeGenerator = () => {
  // navigate not used in this component
  // separate QR state for tenant and device to avoid mixing outputs
  const [tenantQrCode, setTenantQrCode] = useState('');
  const [tenantGeneratedQR, setTenantGeneratedQR] = useState(null);
  // device-related state removed per UI update
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  // legacy single generatedQR removed to keep tenant/device QR separate
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewModal, setViewModal] = useState(false);
  const [viewModalData, setViewModalData] = useState(null);
  // simple in-memory cache for generated QR data URLs to avoid regenerating on scroll
  const qrCacheRef = useRef({});

  useEffect(() => {
    loadTenants();
  }, []);

  // loadMeterDevices removed

  const loadTenants = async () => {
    try {
      const res = await axios.get('/api/tenants');
      const list = Array.isArray(res.data) ? res.data : [];
      // Generate small QR previews locally (do not modify DB)
      const withPreviews = await Promise.all(list.map(async t => {
        try {
          const id = t.id || t.tenant_id || '';
          const tokenPayload = { type: 'tenant_token', tenant_id: id, tenant_name: t.name || t.fullname || '', apartment: t.apartment_number || t.apartment || '' };
          // reuse cache if available
          if (qrCacheRef.current[id]) return { ...t, qr_preview: qrCacheRef.current[id] };
          const qr = await QRCode.toDataURL(JSON.stringify(tokenPayload), { width: 140 });
          qrCacheRef.current[id] = qr;
          return { ...t, qr_preview: qr };
        } catch (e) {
          return { ...t, qr_preview: null };
        }
      }));
      setTenants(withPreviews);
    } catch (err) {
      console.warn('Failed to load tenants for QR generator', err);
      setTenants([]);
    }
  };

  const generateTenantBillsQR = async () => {
  if (!selectedTenant) return showToast('Select a tenant', 'info');
    try {
      // fetch bills for tenant, fallback to all bills then filter
      let res;
      try {
        res = await axios.get(`/api/bills?tenantId=${selectedTenant}`);
      } catch (e) {
        // fallback: fetch all and filter client-side
        const all = await axios.get('/api/bills');
        res = { data: (all.data || []).filter(b => String(b.tenant_id || b.tenant || b.tenantId) === String(selectedTenant)) };
      }
      const bills = Array.isArray(res.data) ? res.data : [];
      // collect rent, water, electricity and total
      const rent = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('rent')).reduce((s,b)=>s+(Number(b.amount)||0),0);
      const water = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('water')).reduce((s,b)=>s+(Number(b.amount)||0),0);
      const electricity = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('electric')).reduce((s,b)=>s+(Number(b.amount)||0),0);
      const total = rent + water + electricity;
      // compute due date range
      const dates = bills.map(b => b.due_date).filter(Boolean).map(d=>new Date(d)).filter(d=>!isNaN(d));
      const dateRange = dates.length ? { start: new Date(Math.min(...dates)).toISOString(), end: new Date(Math.max(...dates)).toISOString() } : { start: null, end: null };

      // Build a minimal tenant token (only tenant id, name, email) to display on generation
      const tenantObj = tenants.find(t=>String(t.id)===String(selectedTenant) || String(t.tenant_id)===String(selectedTenant)) || { id: selectedTenant };
  // produce a minimal token containing tenant name and apartment (no email)
  const tokenPayload = { type: 'tenant_token', tenant_id: tenantObj.id || tenantObj.tenant_id || selectedTenant, tenant_name: tenantObj.name || tenantObj.fullname || '', apartment: tenantObj.apartment_number || tenantObj.apartment || '' };

      // Prefer server-side token creation so scans can securely fetch bills from DB
      try {
        const createResp = await axios.post('/api/qr-codes/create-tenant-token', { tenant_id: tokenPayload.tenant_id });
        if (createResp?.data?.token && createResp?.data?.qr_url) {
          const data = { qr_url: createResp.data.qr_url, token: createResp.data.token, tenant: tokenPayload, totals: { rent, electricity, water, total }, date_range: dateRange };
          setTenantGeneratedQR({ qr_url: createResp.data.qr_url, token: createResp.data.token, tenant: tokenPayload });
          setTenantQrCode(createResp.data.qr_url);
          openGenModal(data);
          return;
        }
      } catch (createErr) {
        // server might not expose creation; we'll fallback to generating a QR embedding the minimal tokenPayload
        console.debug('Server create-tenant-token not available, falling back to local token QR', createErr?.message || createErr);
      }

      // local fallback: encode minimal tenant token (this includes tenant_id so server can lookup bills when scanned)
      const dataStr = JSON.stringify(tokenPayload);
      const dataUrl = await QRCode.toDataURL(dataStr, { width: 300 });
  const localData = { qr_url: dataUrl, qr_data: tokenPayload, tenant: tokenPayload, totals: { rent, electricity, water, total }, date_range: dateRange };
  setTenantGeneratedQR({ qr_url: dataUrl, qr_data: tokenPayload });
  setTenantQrCode(dataUrl);
  openGenModal(localData);
    } catch (err) {
      console.error('Failed to generate tenant bills QR', err);
    showToast('Failed to generate tenant bills QR', 'error');
    }
  };

  // generateDeviceQR removed

  // Scanner logic removed from this page: scanning remains in Dashboard QRCodeScanner component

  // updateDeviceReading removed

  // Modal state and refs for outside click / esc handling
  const [showGenModal, setShowGenModal] = useState(false);
  const [genModalData, setGenModalData] = useState(null);
  const genModalRef = useRef();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowGenModal(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);


  const openGenModal = (data) => {
    setGenModalData(data);
    setShowGenModal(true);
  };

  const openViewModal = (data) => {
    setViewModalData(data);
    setViewModal(true);
  };

  return (
  <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">QR Code Generator</h2>
        <div>
          {/* Dashboard link removed in favor of top navigation */}
          <button className="btn btn-outline-primary" onClick={async () => {
            try { await loadTenants(); } catch(e){}
            setTenantGeneratedQR(null);
            setTenantQrCode('');
            setSearch('');
            showToast('QR Generator refreshed', 'success');
          }}>Refresh</button>
        </div>
      </div>

      {/* QR Code Generator: search + tenant card list */}
      <div className="row">
        <div className="col-12 mb-3">
          <div className="input-group">
            <input className="form-control" placeholder="Search by name, unit, or tenant id" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" onClick={()=>setSearch('')}>Clear</button>
          </div>
        </div>

        <div className="col-12">
          <div className="row">
            {tenants
              .filter(t => {
                if (!search) return true;
                const s = search.toString().toLowerCase();
                return ((t.name||t.fullname||'').toString().toLowerCase().includes(s) || (t.apartment_number||t.apartment||'').toString().toLowerCase().includes(s) || (t.id||t.tenant_id||'').toString().toLowerCase().includes(s));
              })
              .map(t => (
                <div className="col-md-4 mb-3" key={t.id || t.tenant_id}>
                  <div className="card h-100">
                    <div className="card-body d-flex flex-column">
                      <div>
                        <h6 className="mb-1">{t.name || t.fullname || `Tenant ${t.id||t.tenant_id}`}</h6>
                        <div className="text-muted small">{t.apartment_number || t.apartment || 'Unit N/A'}</div>
                      </div>
                      <div className="mt-3 d-flex align-items-center">
                        <div style={{width:72,height:72,flex:'0 0 72px'}}>
                          {t.qr_preview ? (
                            <img alt="qr" src={t.qr_preview} style={{width:72,height:72,objectFit:'contain'}} />
                          ) : (
                            <div style={{width:72,height:72,display:'flex',alignItems:'center',justifyContent:'center',color:'#999',fontSize:12}}>QR</div>
                          )}
                        </div>
                        <div className="ms-3">
                          <div className="d-flex gap-2">
                            <button className="btn btn-sm btn-outline-primary" onClick={async()=>{
                              try{
                                const id = t.id || t.tenant_id || '';
                                const tokenPayload = { type: 'tenant_token', tenant_id: id, tenant_name: t.name || t.fullname || '', apartment: t.apartment_number || t.apartment || '' };
                                // prefer cached preview
                                let dataUrl = qrCacheRef.current[id] || t.qr_preview;
                                if (!dataUrl) {
                                  dataUrl = await QRCode.toDataURL(JSON.stringify(tokenPayload), { width: 420 });
                                  qrCacheRef.current[id] = dataUrl;
                                }
                                openViewModal({ qr_url: dataUrl, tenant: { ...tokenPayload, id } });
                              }catch(e){ console.error('Failed to generate QR', e); showToast('Failed to generate QR', 'error'); }
                            }}>View QR</button>
                            <button className="btn btn-sm btn-success" onClick={async()=>{
                              try{
                                const tokenPayload = { type: 'tenant_token', tenant_id: t.id || t.tenant_id || '', tenant_name: t.name || t.fullname || '', apartment: t.apartment_number || t.apartment || '' };
                                const dataUrl = await QRCode.toDataURL(JSON.stringify(tokenPayload), { width: 800 });
                                // trigger download
                                const link = document.createElement('a');
                                link.href = dataUrl;
                                link.download = `tenant-${tokenPayload.tenant_id || t.id}-qr.png`;
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                showToast('QR downloaded', 'success');
                              }catch(e){ console.error('Failed to download QR', e); showToast('Failed to download QR', 'error'); }
                            }}>Download QR</button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto text-end small text-muted">ID: {t.id || t.tenant_id || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Modals for generation and scanning results */}
      {showGenModal && genModalData && (
        <div className="qr-modal-overlay" onClick={(e) => { if (e.target.classList.contains('qr-modal-overlay')) { setShowGenModal(false); } }}>
          <div className="qr-modal" ref={genModalRef} role="dialog" aria-modal="true">
            <div className="qr-modal-body text-center">
              <h5>Generated Tenant QR</h5>
              <div className="my-3">
                <img src={genModalData.qr_url} alt="Generated QR" style={{maxWidth:260}} />
              </div>
              <div><strong>{genModalData.tenant?.tenant_name || genModalData.tenant?.name}</strong></div>
              <div className="text-muted">{genModalData.tenant?.apartment || genModalData.tenant?.apartment_number || '-'}</div>
              <div className="mt-3">
                <div><strong>Summary</strong></div>
                <div>Rent: {genModalData.totals?.rent || '-'} • Electricity: {genModalData.totals?.electricity || '-'} • Water: {genModalData.totals?.water || '-'} • Total: {genModalData.totals?.total || '-'}</div>
              </div>
              <div className="mt-4 d-flex justify-content-center gap-2">
                <button className="btn btn-secondary" onClick={() => setShowGenModal(false)}>Close</button>
                {genModalData.qr_url && <a className="btn btn-success" href={genModalData.qr_url} download={`tenant-${genModalData.tenant?.tenant_id || genModalData.tenant?.id}-qr.png`}>Download QR</a>}
              </div>
            </div>
          </div>
        </div>
      )}

  {/* Scan modal removed from this page - scanning is handled in Dashboard QRCodeScanner */}

      {viewModal && viewModalData && (
        <div className="qr-modal-overlay" onClick={(e) => { if (e.target.classList.contains('qr-modal-overlay')) { setViewModal(false); } }}>
          <div className="qr-modal" role="dialog" aria-modal="true">
            <div className="qr-modal-body text-center">
              <h5>Tenant QR</h5>
              <div className="my-3">
                <img src={viewModalData.qr_url} alt="Tenant QR" style={{maxWidth:320}} />
              </div>
              <div><strong>{viewModalData.tenant?.tenant_name || viewModalData.tenant?.name || '-'}</strong></div>
              <div className="text-muted">{viewModalData.tenant?.apartment || viewModalData.tenant?.apartment_number || '-'}</div>
              <div className="text-muted small">ID: {viewModalData.tenant?.tenant_id || viewModalData.tenant?.id || '-'}</div>
              <div className="mt-4 d-flex justify-content-center gap-2">
                <button className="btn btn-secondary" onClick={() => setViewModal(false)}>Close</button>
                <button className="btn btn-success" onClick={async()=>{
                  try{
                    const id = viewModalData.tenant?.tenant_id || viewModalData.tenant?.id || '';
                    // try cached larger QR first
                    let dataUrl = qrCacheRef.current[`${id}_large`];
                    if (!dataUrl) {
                      // if small preview exists use it, else generate large
                      if (viewModalData.qr_url && viewModalData.qr_url.startsWith('data:')) {
                        dataUrl = viewModalData.qr_url;
                      } else {
                        const tokenPayload = { type: 'tenant_token', tenant_id: id, tenant_name: viewModalData.tenant?.tenant_name || viewModalData.tenant?.name || '', apartment: viewModalData.tenant?.apartment || viewModalData.tenant?.apartment_number || '' };
                        dataUrl = await QRCode.toDataURL(JSON.stringify(tokenPayload), { width: 800 });
                      }
                      qrCacheRef.current[`${id}_large`] = dataUrl;
                    }
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = `tenant-${id}-qr.png`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    showToast('QR downloaded', 'success');
                  }catch(e){ console.error('Download failed', e); showToast('Failed to download QR', 'error'); }
                }}>Download QR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qr-modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; backdrop-filter: blur(6px); animation: fadeIn .18s ease; z-index:1050; }
        .qr-modal{ background:#fff; border-radius:8px; max-width:520px; width:90%; box-shadow:0 8px 24px rgba(0,0,0,0.2); transform:translateY(0); animation: slideUp .18s ease; }
        .qr-modal-body{ padding:20px; }
        @keyframes fadeIn{ from{ opacity:0 } to{ opacity:1 } }
        @keyframes slideUp{ from{ transform:translateY(8px); opacity:0 } to{ transform:translateY(0); opacity:1 } }
      `}</style>

    </div>
  );
};

export default QRCodeGenerator;
