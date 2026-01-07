import React, { useEffect, useRef, useState } from 'react';
// useNavigate not needed in scanner component; navigation is controlled by parent
import axios from '../../axiosConfig';
import jsQR from 'jsqr';

// AdminScan: scanning logic only. Uses BarcodeDetector when available, falls back to video loop.


const AdminScan = ({ open = false, onClose = () => {}, onResult = null }) => {
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
	// some local state values are kept for future UI features. They intentionally
	// remain unused in the current build; silence eslint no-unused-vars for them.
	// eslint-disable-next-line no-unused-vars
	const [tenantData, setTenantData] = useState(null);
	const [isScanning, setIsScanning] = useState(false);
	// eslint-disable-next-line no-unused-vars
	const [scanSuccess, setScanSuccess] = useState(false);
	const [error, setError] = useState('');
	const detectorRef = useRef(null);
	const streamRef = useRef(null);
	const fileInputRef = useRef(null);
	const [showManualSearch, setShowManualSearch] = useState(false);
	const [manualQuery, setManualQuery] = useState('');
	const [manualMatches, setManualMatches] = useState([]);
	const [allTenants, setAllTenants] = useState(null);
	const [highlighted, setHighlighted] = useState(-1);
	// eslint-disable-next-line no-unused-vars
	const [drawerOpen, setDrawerOpen] = useState(false);
	// eslint-disable-next-line no-unused-vars
	const [drawerResult, setDrawerResult] = useState(null);
	// navigation handled by parent via onResult/onClose callbacks


const fetchTenantData = async (tenant) => {
	setError('');
	try {
		const tenantId = tenant.id || tenant.tenant_id || tenant.tenantId || null;
		const billsPromise = tenantId ? axios.get(`/api/bills?tenantId=${encodeURIComponent(String(tenantId))}`) : Promise.resolve({ data: [] });
		const paymentsPromise = tenantId ? axios.get(`/api/payment-history?tenantId=${encodeURIComponent(String(tenantId))}`) : Promise.resolve({ data: [] });
		const [bRes, pRes] = await Promise.all([billsPromise, paymentsPromise]);
		const billsRaw = Array.isArray(bRes.data) ? bRes.data : [];
		const tidStr = String(tenantId || '').trim();
		const bills = billsRaw.filter(b => {
			const bid = String(b.tenant_id || b.tenant || b.tenantId || b.tenant_id_string || '').trim();
			if (!tidStr) return false;
			return bid !== '' && bid === tidStr;
		});
		const payments = Array.isArray(pRes.data) ? pRes.data : [];

		const sanitizedBills = bills.map(b => ({
			bill_type: b.bill_type || b.type || b.name || 'UNKNOWN',
			amount: b.amount || b.bill_amount || 0,
			due_date: b.due_date || b.dueDate || b.date || null,
			status: b.status || (b.paid ? 'paid' : 'pending')
		}));

		const sanitizedPayments = payments.map(ph => ({
			amount_paid: ph.amount_paid || ph.amount || 0,
			paid_at: ph.paid_at || ph.paidAt || ph.date || null,
			payment_type: ph.payment_type || ph.paymentType || 'RENT'
		}));

		const result = { tenant, bills: sanitizedBills, payment_history: sanitizedPayments };
		// notify parent of result and close the scanner modal immediately
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(t => t.stop());
			streamRef.current = null;
		}
		setIsScanning(false);
		if (typeof onResult === 'function') onResult(result);
		onClose();
		setManualMatches([]);
		setShowManualSearch(false);
		// stop camera if running
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(t => t.stop());
			streamRef.current = null;
		}
		setIsScanning(false);
	} catch (err) {
		console.error('Fetch tenant data failed', err);
		setError('Failed to fetch tenant records');
	}
};


	// start/stop scanning based on `open` prop
	/*
	  The camera loop intentionally omits `handleDetected` from the dependency
	  array so the effect does not restart when handler identity changes.
	  Suppress the hook exhaustive deps rule for this block.
	*/
	/* eslint-disable react-hooks/exhaustive-deps */
	useEffect(() => {
		if (open) {
			setScanSuccess(false);
			setTenantData(null);
			setError('');
			// do not auto-start camera; wait for user to press Start
			setIsScanning(false);
		} else {
			setIsScanning(false);
			// stop camera immediately when modal closed
			if (streamRef.current) {
				streamRef.current.getTracks().forEach(t => t.stop());
				streamRef.current = null;
			}
		}
	}, [open]);

	useEffect(() => {
		let running = true;

		if (!isScanning) return () => { running = false; };

		const startCamera = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
				streamRef.current = stream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}

				if (window.BarcodeDetector && window.BarcodeDetector.getSupportedFormats) {
					try {
						const formats = await window.BarcodeDetector.getSupportedFormats();
						const useFormats = formats.includes('qr_code') ? ['qr_code'] : formats;
						detectorRef.current = new window.BarcodeDetector({ formats: useFormats });
					} catch (e) {
						detectorRef.current = null;
					}
				}

				const loop = async () => {
					if (!running) return;
					try {
						const v = videoRef.current;
						const c = canvasRef.current;
						if (v && c) {
							// wait until video has data
							if (v.readyState >= 2 && (v.videoWidth || v.videoHeight)) {
								const ctx = c.getContext('2d');
								c.width = v.videoWidth || 640;
								c.height = v.videoHeight || 480;
								ctx.drawImage(v, 0, 0, c.width, c.height);

								// First try BarcodeDetector when available
								if (detectorRef.current) {
									try {
										let detections = [];
										try {
											detections = await detectorRef.current.detect(v);
										} catch (e) {
											// fallback: try detect on ImageBitmap for reliability
											try {
												const bmp = await createImageBitmap(c);
												detections = await detectorRef.current.detect(bmp);
											} catch (e2) {
												// ignore
											}
										}
										if (detections && detections.length > 0) {
											const raw = detections[0].rawValue || detections[0].rawText || '';
											await handleDetected(raw);
											return;
										}
									} catch (err) {
										// ignore detector errors and fallback to jsQR
									}
								}

								// jsQR fallback
								try {
									const imageData = ctx.getImageData(0, 0, c.width, c.height);
									const code = jsQR(imageData.data, c.width, c.height);
									if (code && code.data) {
										await handleDetected(code.data);
										return;
									}
								} catch (e) {
									// ignore canvas read errors
								}
							}
						}
					} catch (e) {
						console.error('scan loop err', e);
					}
					// continuous scan delay > 0
					setTimeout(loop, 300);
				};

				loop();
			} catch (err) {
				console.error('Camera start failed', err);
				setError('Unable to access camera. Allow camera permission or use a supported browser.');
			}
		};

		startCamera();

		return () => {
			running = false;
			if (streamRef.current) {
				streamRef.current.getTracks().forEach(t => t.stop());
				streamRef.current = null;
			}
		};
	}, [isScanning]);

	const handleDetected = async (raw) => {
	 	if (!raw) return;
	 	// stop camera to avoid duplicate detections
	 	if (streamRef.current) {
	 		streamRef.current.getTracks().forEach(t => t.stop());
	 		streamRef.current = null;
	 	}

	 	setError('');
	 	let payload = null;
	 	try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { payload = raw; }

	 	let tenantLookup = null;
	 	if (payload && typeof payload === 'object') {
	 		tenantLookup = payload.tenant_id || payload.tenantId || payload.id || payload.tid || payload.id_string || payload.raw || null;
	 	}
	 	if (!tenantLookup && typeof raw === 'string') tenantLookup = raw;

	 	const looksLikeJwt = typeof raw === 'string' && raw.split && raw.split('.').length === 3;

	 	try {
	 		let tenant = null;
	 		if (looksLikeJwt) {
	 			const resp = await axios.post('/api/qr-codes/scan', { qr_data: raw });
	 			tenant = resp.data && resp.data.tenant ? resp.data.tenant : null;
	 		} else if (tenantLookup) {
	 			const resp = await axios.get(`/api/qr-codes/${encodeURIComponent(String(tenantLookup))}`);
	 			tenant = resp.data && resp.data.tenant ? resp.data.tenant : null;
	 		} else {
	 			setError('QR payload did not include tenant identifier');
	 		}

	 		if (!tenant) {
	 			setError('Tenant not found for scanned QR');
	 			return;
	 		}

	 		const tenantId = tenant.id || tenant.tenant_id || tenant.tenantId || null;
	 		const billsPromise = tenantId ? axios.get(`/api/bills?tenantId=${encodeURIComponent(String(tenantId))}`) : Promise.resolve({ data: [] });
	 		const paymentsPromise = tenantId ? axios.get(`/api/payment-history?tenantId=${encodeURIComponent(String(tenantId))}`) : Promise.resolve({ data: [] });

			const [bRes, pRes] = await Promise.all([billsPromise, paymentsPromise]);
			const billsRaw = Array.isArray(bRes.data) ? bRes.data : [];
			// Strict filter: keep only bills that belong to this tenant (match numeric id or tenant_id string)
			const tidStr = String(tenantId || '').trim();
			const bills = billsRaw.filter(b => {
				const bid = String(b.tenant_id || b.tenant || b.tenantId || b.tenant_id_string || '').trim();
				if (!tidStr) return false;
				// compare normalized strings (numeric ids or alphanumeric tenant_id)
				return bid !== '' && bid === tidStr;
			});
	 		const payments = Array.isArray(pRes.data) ? pRes.data : [];

	 		const sanitizedBills = bills.map(b => ({
	 			bill_type: b.bill_type || b.type || b.name || 'UNKNOWN',
	 			amount: b.amount || b.bill_amount || 0,
	 			due_date: b.due_date || b.dueDate || b.date || null,
	 			status: b.status || (b.paid ? 'paid' : 'pending')
	 		}));

	 		const sanitizedPayments = payments.map(ph => ({
	 			amount_paid: ph.amount_paid || ph.amount || 0,
	 			paid_at: ph.paid_at || ph.paidAt || ph.date || null,
	 			payment_type: ph.payment_type || ph.paymentType || 'RENT'
	 		}));

			const result = { tenant, bills: sanitizedBills, payment_history: sanitizedPayments };
			// stop camera, notify parent with result, and close scanner modal
			if (streamRef.current) {
				streamRef.current.getTracks().forEach(t => t.stop());
				streamRef.current = null;
			}
			setIsScanning(false);
			if (typeof onResult === 'function') onResult(result);
			onClose();
			return;
	 	} catch (err) {
	 		console.error('AdminScan error resolving tenant', err);
	 		setError(err.response?.data?.message || 'Failed to resolve scanned QR');
	 	}
	};
	// eslint-disable-next-line no-unused-vars
	const handleModalClose = () => {
	 	setScanSuccess(false);
	 	setTenantData(null);
	 	setIsScanning(false);
		// stop camera
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(t => t.stop());
			streamRef.current = null;
		}
		// inform parent to close modal
		onClose();
	};

	if (!open) return null;

	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
			<div style={{ width: 640, maxWidth: '96vw', background: '#0b1220', padding: 12, borderRadius: 12, boxShadow: '0 12px 40px rgba(2,6,23,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
				{error && <div className="alert alert-danger" style={{ maxWidth: 760 }}>{error}</div>}
				<div style={{ width: '100%', height: 520, background: '#000', padding: 6, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
					{isScanning ? (
						<>
							<video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted playsInline />
						</>
					) : (
						<div style={{ color: '#999', textAlign: 'center' }}>
							<span>No camera active. Press Start to begin scanning.</span>
						</div>
					)}
					{/* hidden canvas always available for upload/decoding even when camera is off */}
					<canvas ref={canvasRef} style={{ display: 'none' }} />
				</div>
				<div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
					{isScanning && <button className="btn btn-outline-secondary" onClick={() => { setIsScanning(false); setError(''); if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } }}>Stop</button>}

					{/* Start button moved to footer */}
					{!isScanning && <button className="btn btn-primary" onClick={() => { setIsScanning(true); setError(''); }}>Start</button>}

					{/* Upload image button */}
					<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
						const f = e.target.files && e.target.files[0];
						if (!f) return;
						const img = new Image();
						img.onload = async () => {
							try {
								const c = canvasRef.current;
								if (!c) return setError('Failed to process image');
								const ctx = c.getContext('2d');
								c.width = img.naturalWidth || img.width || 640;
								c.height = img.naturalHeight || img.height || 480;
								ctx.drawImage(img, 0, 0, c.width, c.height);
								const imageData = ctx.getImageData(0,0,c.width,c.height);
								const code = jsQR(imageData.data, c.width, c.height);
								if (code && code.data) {
									await handleDetected(code.data);
								} else {
									setError('No QR code found in the uploaded image');
								}
							} catch (err) {
								console.error('Upload decode error', err);
								setError('Failed to decode uploaded image');
							}
						};
						img.onerror = () => setError('Failed to load image');
						img.src = URL.createObjectURL(f);
					}} />
					<button className="btn btn-outline-secondary" title="Upload image" onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}>
						<span style={{ marginRight: 6 }} aria-hidden> 📁 </span>
					</button>

					{/* Manual Search input toggle */}
					<button className="btn btn-outline-secondary" title="Manual Search" onClick={() => { setShowManualSearch(s => !s); setManualQuery(''); setManualMatches([]); }}>
						<span style={{ marginRight: 6 }} aria-hidden> 🔍 </span>
					</button>

					{showManualSearch && (
						<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'column', width: '100%' }}>
							<div style={{ display: 'flex', gap: 8, width: '100%' }}>
								<input value={manualQuery} onChange={async e => {
									const v = e.target.value;
									setManualQuery(v);
									setError('');
									// fetch tenant list once
									try {
										if (!allTenants) {
											const res = await axios.get('/api/tenants');
											const tenants = Array.isArray(res.data) ? res.data : (res.data && res.data.tenants ? res.data.tenants : []);
											setAllTenants(tenants);
											setManualMatches(tenants.slice(0, 10));
											return;
										}
										const q = String(v || '').trim().toLowerCase();
										if (!q) { setManualMatches([]); setHighlighted(-1); return; }
										const matches = (allTenants || []).filter(t => {
											const parts = [String(t.tenant_id || t.tenantId || t.id || ''), t.name || '', t.email || '', String(t.apartment_number || t.apartment || '')].map(x => String(x).toLowerCase());
											return parts.some(p => p.includes(q));
										}).slice(0, 50);
										setManualMatches(matches);
										setHighlighted(matches.length ? 0 : -1);
									} catch (err) {
										console.error('Tenant list fetch error', err);
										setError('Failed to load tenants');
									}
								}} placeholder="Search by id, name, email or apartment" className="form-control" style={{ flex: 1 }} onKeyDown={e => {
									if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min((manualMatches.length - 1), h + 1)); }
									else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(0, h - 1)); }
									else if (e.key === 'Enter') { e.preventDefault(); if (manualMatches[highlighted]) fetchTenantData(manualMatches[highlighted]); }
								}} />
								<button className="btn btn-primary" onClick={async () => {
									// explicit search: if we haven't fetched tenants yet, fetch then filter
									setError('');
									try {
										if (!allTenants) {
											const res = await axios.get('/api/tenants');
											const tenants = Array.isArray(res.data) ? res.data : (res.data && res.data.tenants ? res.data.tenants : []);
											setAllTenants(tenants);
										}
										const q = String(manualQuery || '').trim().toLowerCase();
										if (!q) { setError('Enter search query'); return; }
										const matches = (allTenants || []).filter(t => {
											const parts = [String(t.tenant_id || t.tenantId || t.id || ''), t.name || '', t.email || '', String(t.apartment_number || t.apartment || '')].map(x => String(x).toLowerCase());
											return parts.some(p => p.includes(q));
										}).slice(0, 50);
										if (matches.length === 0) { setError('No tenant found'); setManualMatches([]); return; }
										setManualMatches(matches);
										setHighlighted(0);
									} catch (err) {
										console.error('Manual search error', err);
										setError('Manual search failed');
									}
								}}>Search</button>
							</div>
							{manualMatches.length > 0 && (
								// Floating overlay rendered above the modal so results are not confined inside the modal box
								<div style={{ position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)', width: 520, maxWidth: '92vw', maxHeight: '60vh', overflow: 'auto', background: '#071022', borderRadius: 8, padding: 6, zIndex: 2500, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
										<div style={{ fontWeight: 700, color: '#fff' }}>{manualMatches.length} result{manualMatches.length > 1 ? 's' : ''}</div>
										<div>
											<button className="btn btn-sm btn-outline-secondary" onClick={() => { setManualMatches([]); setShowManualSearch(false); setManualQuery(''); }}>Close</button>
										</div>
									</div>
									{(manualMatches || []).map((t, idx) => (
										<div key={idx}
											role="button"
											tabIndex={0}
											onMouseEnter={() => setHighlighted(idx)}
											onClick={() => fetchTenantData(t)}
											style={{
												padding: 10,
												borderBottom: '1px solid rgba(255,255,255,0.04)',
												cursor: 'pointer',
												background: idx === highlighted ? 'rgba(255,255,255,0.03)' : 'transparent'
											}}
										>
											<div style={{ fontWeight: 600 }}>{t.name || t.tenant_id || t.id}</div>
											<div style={{ fontSize: 12, color: '#9aa4b2' }}>{t.email || ''} {t.apartment_number ? ` • Apt ${t.apartment_number}` : ''}</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					<button className="btn btn-outline-secondary" title="Close" onClick={() => { setIsScanning(false); if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } onClose(); }}>
						<span aria-hidden style={{ fontWeight: 700 }}>✕</span>
					</button>
				</div>
		
			</div>
		</div>
	);
};

export default AdminScan;

