import React, { useState, useEffect } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import GlobalHeader from '../Layout/GlobalHeader';
import QuickScannerModal from '../Layout/QuickScannerModal';
import ScanModal from '../Layout/ScanModal';
import { formatMeterNumber } from '../../utils/numberFormat';

const PropertyManagerDashboard = () => {
	const [stats, setStats] = useState({
		totalTenants: 0,
		totalApartments: 0,
		occupiedApartments: 0,
		overdueBills: 0,
		totalRevenue: 0
	});
	const [recentBills, setRecentBills] = useState([]);
	const [meterDevices, setMeterDevices] = useState([]);
	const [tenantsList, setTenantsList] = useState([]);
	const [loading, setLoading] = useState(true);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scanModalOpen, setScanModalOpen] = useState(false);
	const [scanModalData, setScanModalData] = useState(null);
	const navigate = useNavigate();

	const navItems = [
		{ key: 'dashboard', label: 'Dashboard', to: '/property-manager-dashboard' },
		{ key: 'tenants', label: 'Tenants', to: '/tenant-management' },
		{ key: 'bills', label: 'Bills', to: '/bill-management' },
		{ key: 'apartments', label: 'Apartments', to: '/apartment-management' },
		{ key: 'meter', label: 'Meter', to: '/meter-device-management' },
		{ key: 'qrcodes', label: 'QR Codes', to: '/qr-code-generator' },
		{ key: 'reports', label: 'Reports', to: '/reports' }
	];

	const fetchDashboardData = async () => {
		try {
			// fetch full bills for accurate aggregates, use slice for recent list
			const [tenantsRes, apartmentsRes, billsAllRes, devicesRes] = await Promise.all([
				axios.get('/api/tenants'),
				axios.get('/api/apartments'),
				axios.get('/api/bills'),
				axios.get('/api/meter-devices')
			]);

			const tenants = Array.isArray(tenantsRes.data) ? tenantsRes.data : [];
			const apartments = Array.isArray(apartmentsRes.data) ? apartmentsRes.data : [];
			const bills = Array.isArray(billsAllRes.data) ? billsAllRes.data : [];
			const devices = Array.isArray(devicesRes.data) ? devicesRes.data : (devicesRes.data && devicesRes.data.devices ? devicesRes.data.devices : []);
			setTenantsList(tenants);

			// robust occupied detection: prefer explicit flag, fall back to tenant/apartment link
			const occupiedCount = apartments.filter(a => {
				if (typeof a.occupied === 'boolean') return a.occupied;
				if (a.status) return String(a.status).toLowerCase() === 'occupied';
				if (a.tenant_id || a.current_tenant_id || a.tenant) return true;
				return false;
			}).length;
			// robust overdue detection: check status keywords or due_date in the past (and not paid)
			const today = new Date();
			const isOverdue = (b) => {
				if (!b) return false;
				const status = (b.status || '').toString().toLowerCase();
				// common status keywords indicating overdue
				if (status && (status.includes('over') || status.includes('late') || status.includes('past_due') || (status.includes('due') && !status.includes('paid')))) {
					if (!status.includes('paid')) return true;
				}
				if (b.due_date) {
					const d = new Date(b.due_date);
					if (!isNaN(d) && d < today && status !== 'paid') return true;
				}
				return false;
			};
			const overdueItems = bills.filter(isOverdue);
			const overdueCount = overdueItems.length;

			// diagnostic logs to help identify data shape issues
			if (process.env.NODE_ENV !== 'production') {
				console.debug('Dashboard fetch: tenants=', tenants.length, 'apartments=', apartments.length, 'bills=', bills.length, 'devices=', devices.length);
				console.debug('Apartments sample:', apartments.slice(0,3));
				console.debug('Bills sample:', bills.slice(0,6));
				console.debug('Overdue detected count:', overdueCount, 'examples:', overdueItems.slice(0,5));
			}

			setStats(prev => ({
				...prev,
				totalTenants: tenants.length,
				totalApartments: apartments.length,
				occupiedApartments: occupiedCount,
				overdueBills: overdueCount,
				totalRevenue: bills.reduce((s, b) => s + (b.amount || 0), 0)
			}));
			// recent bills: take latest 6 by due_date or created_at if available
			const recent = bills.slice().sort((a,b) => {
				// move paused tenant bills to the bottom
				const pausedA = Boolean(a.is_paused || a.tenant_is_paused || a.status === 'paused');
				const pausedB = Boolean(b.is_paused || b.tenant_is_paused || b.status === 'paused');
				if (pausedA !== pausedB) return pausedA ? 1 : -1;
				const da = new Date(a.due_date || a.created_at || 0).getTime();
				const db = new Date(b.due_date || b.created_at || 0).getTime();
				return db - da;
			}).slice(0,6);
			setRecentBills(recent);
			setMeterDevices(devices);
		} catch (err) {
			console.error('Failed to fetch dashboard data', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) {
			navigate('/property-manager-login');
			return;
		}

		fetchDashboardData();
		const t = setInterval(fetchDashboardData, 30000);

		const onRefresh = () => fetchDashboardData();
		window.addEventListener('app:refresh-dashboard', onRefresh);

		// listen for tenant scan resolution from QuickScannerModal -> TenantScanner
		const onQRResolved = (e) => {
			if (e?.detail && e.detail.tenant) {
				setScanModalData({ tenant: e.detail.tenant, bills: e.detail.bills || [] });
				setScanModalOpen(true);
				setScannerOpen(false);
			}
		};
		window.addEventListener('app:qr-resolved', onQRResolved);

		return () => {
			clearInterval(t);
			window.removeEventListener('app:refresh-dashboard', onRefresh);
			window.removeEventListener('app:qr-resolved', onQRResolved);
		};
	}, [navigate]);

	if (loading) return <div className="container-fluid"><div className="text-center">Loading...</div></div>;

	return (
		<div className="manager-dashboard">
			<GlobalHeader navItems={navItems} />

			{/* Dashboard-local quick scan button */}
			<div style={{ position: 'absolute', right: 20, top: 84, zIndex: 50 }}>
				<button className="btn btn-primary" onClick={() => setScannerOpen(true)} title="Dashboard Scan">Scan</button>
			</div>

			{/* Dashboard scanner modal (quick scanner) */}
			<QuickScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />

			{/* Scan result modal (receipt) */}
			{scanModalOpen && scanModalData && (
				<ScanModal open={scanModalOpen} onClose={() => setScanModalOpen(false)} tenantPayload={scanModalData} />
			)}

			<div className="container-fluid mgr-main">
				<div className="center-nav-wrap text-center mb-3">
					<nav className="center-nav">
						{navItems.map(item => (
							<button key={item.key} className="center-nav-item" onClick={() => navigate(item.to)}>{item.label}</button>
						))}
					</nav>
				</div>

				<div className="mgr-stats d-flex gap-3 mb-4">
					<div className="card card-glass p-3" style={{minWidth:180}}>
						<div className="text-muted">Tenants</div>
						<div className="h3">{stats.totalTenants}</div>
					</div>
					<div className="card card-glass p-3" style={{minWidth:180}}>
						<div className="text-muted">Apartments</div>
						<div className="h3">{stats.totalApartments}</div>
					</div>
					<div className="card card-glass p-3" style={{minWidth:180}}>
						<div className="text-muted">Occupied</div>
						<div className="h3">{stats.occupiedApartments}</div>
					</div>
					<div className="card card-glass p-3" style={{minWidth:180}}>
						<div className="text-muted">Overdue Bills</div>
						<div className="h3">{stats.overdueBills}</div>
					</div>
				</div>

				<div className="row">
					<div className="col-md-6">
						<div className="card panel">
							<div className="card-header">Recent Bills</div>
							<div className="card-body">
								{recentBills.length === 0 ? (
									<div className="text-muted">No recent bills</div>
								) : (
									<table className="table table-sm">
										<thead>
											<tr><th>Tenant</th><th>Amount</th><th>Due</th><th>Status</th></tr>
										</thead>
										<tbody>
											{recentBills.map(b => {
												const paused = Boolean(b.is_paused || b.tenant_is_paused || b.status === 'paused');
												return (
												<tr key={b.id || b._id} style={{ background: paused ? '#f8f9fa' : 'transparent', color: paused ? '#6c757d' : 'inherit' }}>
													<td>{b.tenant_name || b.tenant}</td>
													<td>{b.amount}</td>
													<td>{b.due_date ? new Date(b.due_date).toLocaleDateString() : ''}</td>
													<td>{paused ? 'paused' : b.status}</td>
												</tr>
											)})}
										</tbody>
									</table>
								)}
							</div>
						</div>

					</div>

					<div className="col-md-6">
						<div className="card panel">
							<div className="card-header">Meter Devices</div>
							<div className="card-body">
									{meterDevices.length === 0 ? (
										<div className="text-muted">No devices</div>
									) : (
										<>
											{/* Group devices by inferred meter type (electricity / water) */}
											{(() => {
												const grouped = { electricity: [], water: [], other: [] };
												for (const d of meterDevices) {
													const mt = (d.meter_type || d.type || '').toString().toLowerCase();
													if (mt.includes('elect')) grouped.electricity.push(d);
													else if (mt.includes('water')) grouped.water.push(d);
													else grouped.other.push(d);
												}
												const makeTable = (items, title, emoji) => {
													// join tenant info (if available) and show active tenants first
													const rows = (items || []).map(d => {
														// try to find tenant by apartment_id or apartment_number
														let tenant = null;
														if (d.apartment_id) tenant = tenantsList.find(t => String(t.apartment_id || t.apartment_id) === String(d.apartment_id) || String(t.apartment_id) === String(d.apartment_id) || String(t.apartment_id) === String(d.apartment_id));
														if (!tenant && d.apartment_number) tenant = tenantsList.find(t => String(t.apartment_number || t.apartment) === String(d.apartment_number));
														return { device: d, tenant };
													}).sort((a,b) => {
														// active tenants first
														const sa = (a.tenant && (a.tenant.status || '')).toString().toLowerCase();
														const sb = (b.tenant && (b.tenant.status || '')).toString().toLowerCase();
														if (sa === 'active' && sb !== 'active') return -1;
														if (sb === 'active' && sa !== 'active') return 1;
														return 0;
													});
													return (
														<div key={title} className="mb-3">
														<div className="d-flex justify-content-between align-items-center mb-2">
															<h6 className="m-0">{emoji} {title} ({rows.length})</h6>
															<button className="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target={`#meters-${title.replace(/\s+/g,'-')}`} aria-expanded="true">Toggle</button>
														</div>
														<div className="collapse show" id={`meters-${title.replace(/\s+/g,'-')}`}>
															<div style={{ maxHeight: 300, overflow: 'auto' }}>
																<table className="table table-sm table-responsive table-hover">
																	<thead className="table-light">
																		<tr>
																			<th>Tenant</th>
																			<th>Unit/Room</th>
																			<th>Present Reading</th>
																			<th>Last Updated</th>
																			<th>Status</th>
																		</tr>
																	</thead>
																	<tbody>
																	{rows.map(r => {
																		const d = r.device;
																		const t = r.tenant;
																		const reading = (d.present_reading !== null && d.present_reading !== undefined) ? d.present_reading : (d.current_reading !== null && d.current_reading !== undefined ? d.current_reading : null);
																		const updated = d.last_updated || d.updated_at || d.recorded_at || d.updatedAt || null;
																		return (
																			<tr key={d.device_id || d.id}>
																				<td>{t ? (t.name || t.fullname || `Tenant ${t.id||t.tenant_id}`) : (d.assigned_tenant || d.tenant_name || 'Unassigned')}</td>
																				<td className="text-muted">{d.apartment_number || d.unit || d.apartment_id || '-'}</td>
																				<td>{reading != null ? formatMeterNumber(reading) : 'N/A'}</td>
																				<td className="small text-muted">{updated ? new Date(updated).toLocaleString() : 'N/A'}</td>
																				<td>{(t && (t.status || '').toString().toLowerCase() === 'active') ? 'Active' : 'Offline'}</td>
																			</tr>
																		);
																	})}
																	</tbody>
																</table>
															</div>
														</div>
													</div>
													);
												};
												return (
													<>
														{makeTable(grouped.electricity, 'Electricity Meters', '🔌')}
														{makeTable(grouped.water, 'Water Meters', '🚰')}
														{grouped.other.length > 0 && makeTable(grouped.other, 'Other Meters', '🔧')}
													</>
												);
											})()}
										</>
									)}
							</div>
						</div>
					</div>
				</div>

			</div>

			{/* Quick scanner modal (dashboard-only) */}
			<QuickScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />

			{/* Receipt/Scan modal showing tenant billing details */}
			{scanModalOpen && scanModalData && (
				<ScanModal open={scanModalOpen} onClose={() => setScanModalOpen(false)} tenantPayload={scanModalData} />
			)}
		</div>
	);
};

export default PropertyManagerDashboard;

