import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import GlobalHeader from '../Layout/GlobalHeader';
import QuickScannerModal from '../Layout/QuickScannerModal';
import ScanModal from '../Layout/ScanModal';
import { formatMeterNumber, formatCurrencyPeso } from '../../utils/numberFormat';
import '../../components/Dashboard/dashboard.css';

// Chart.js via react-chartjs-2 (chart.js already in package.json)
import { Line } from 'react-chartjs-2';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Clean, single-component Property Manager Dashboard
// - Summary cards on top
// - Monthly Income chart (left) + Recent Bills (right) in top area
// - Meter Devices below (Electricity / Water), top-3 with View More modals

const PropertyManagerDashboard = () => {
	// Monthly Income controls
	const [incomeRange, setIncomeRange] = useState({ type: '6m' }); // '3m' | '6m' | '12m' | {from,to}
	const [chartModalOpen, setChartModalOpen] = useState(false);
	const [monthlyLabel, setMonthlyLabel] = useState('');
	const [monthlyTotal, setMonthlyTotal] = useState(0);
	const [stats, setStats] = useState({ totalTenants: 0, totalApartments: 0, occupiedApartments: 0, overdueBills: 0, totalRevenue: 0 });
	const [allBills, setAllBills] = useState([]);
	const [monthlyPayments, setMonthlyPayments] = useState([]);
	const [recentBills, setRecentBills] = useState([]);
	const [meterDevices, setMeterDevices] = useState([]);
	const [loading, setLoading] = useState(true);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scanModalOpen, setScanModalOpen] = useState(false);
	const [scanModalData, setScanModalData] = useState(null);
	const [modalOpen, setModalOpen] = useState({ recentBills: false, electricity: false, water: false });
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

	// helper: determine if a bill is paid
	const isPaid = (b) => {
		if (!b) return false;
		const status = (b.status || '').toString().toLowerCase();
		if (status.includes('paid')) return true;
		if (b.paid === true) return true;
		if (b.paid_at || b.payment_date || b.paymentTimestamp) return true;
		return false;
	};

	// helper: determine if a bill is overdue by business rule (7 days past due)
	const isOverdueByRule = (b) => {
		if (!b || !b.due_date) return false;
		const due = new Date(b.due_date);
		if (isNaN(due)) return false;
		const now = new Date();
		const diffMs = now.getTime() - due.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		return diffDays > 7; // strictly greater than 7 days past due
	};

		// MonthlyIncomeChart supports dynamic ranges and ensures y-axis starts at zero.
		const MonthlyIncomeChart = ({ bills, payments, range = { type: '6m' }, compact = true, showHeader = true, onTotals = null }) => {
			const now = new Date();

			// resolve range into months and labels
			let months = 6;
			let fromDate = null;
			let toDate = now;
			if (typeof range === 'string') range = { type: range };
			if (range?.type === '3m') months = 3;
			else if (range?.type === '6m') months = 6;
			else if (range?.type === '12m') months = 12;
			else if (range?.from && range?.to) {
				fromDate = new Date(range.from);
				toDate = new Date(range.to);
				// we'll compute label array from fromDate->toDate by month
			}

			const labels = [];
			if (fromDate) {
				const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
				const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
				while (cur <= end) {
					labels.push(cur.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
					cur.setMonth(cur.getMonth() + 1);
				}
			} else {
				for (let i = months - 1; i >= 0; i--) {
					const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
					labels.push(dt.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
				}
			}

			const totals = new Array(labels.length).fill(0);
			// Prefer explicit payments array when provided (payment_history) for accurate revenue
			const source = Array.isArray(payments) && payments.length > 0 ? payments : (Array.isArray(bills) ? bills : []);
			// guard: ensure source is an array before iterating
			(source || []).forEach(item => {
				const d = (item.paid_at || item.paidAt || item.payment_paid_at) || item.created_at || item.due_date || item.date || item.createdAt;
				if (!d) return;
				const dt = new Date(d);
				if (isNaN(dt)) return;
				const amt = Number(item.amount_paid || item.amount || item.payment_amount_paid || 0);
				if (fromDate) {
					if (dt < fromDate || dt > toDate) return;
					const idx = (dt.getFullYear() - fromDate.getFullYear()) * 12 + (dt.getMonth() - fromDate.getMonth());
					if (idx >= 0 && idx < totals.length) totals[idx] += amt;
				} else {
					const diffMonths = (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
					if (diffMonths >= 0 && diffMonths < labels.length) totals[labels.length - 1 - diffMonths] += amt;
				}
			});

			const data = useMemo(() => ({
				labels,
				datasets: [
					{
						label: 'Monthly Income',
						data: totals,
						fill: false,
						borderColor: '#6c5ce7',
						backgroundColor: '#6c5ce7',
						tension: 0.25,
						pointRadius: 3,
					}
				]
			}), [labels.join('|'), totals.join('|')]);

			// report totals back to parent if callback provided
			useEffect(() => {
				if (typeof onTotals === 'function') {
					onTotals({ label: fromDate ? 'Monthly Income (custom)' : `Monthly Income (last ${labels.length})`, total: totals.reduce((s, n) => s + n, 0) });
				}
			}, [labels.join('|'), totals.join('|')]);

			const maxY = Math.max(...totals, 0);
			const suggestedMax = Math.ceil(maxY * 1.15) || 1;

			// choose tick step: prefer 1000, but scale down for small values
			let stepSize = 1000;
			if (maxY <= 50) stepSize = 10;
			else if (maxY <= 500) stepSize = 50;
			else if (maxY <= 2000) stepSize = 100;
			else if (maxY <= 10000) stepSize = 500;

			const options = {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: {
					x: { display: true, title: { display: false } },
					y: {
						display: true,
						beginAtZero: true,
						min: 0,
						suggestedMax,
						ticks: {
							stepSize,
							callback: function(value) {
								// prefix with peso symbol and format with comma separators
								const v = Number(value || 0);
								return v >= 1000 ? `₱${v.toLocaleString()}` : `₱${v}`;
							}
						},
						grid: { color: 'rgba(0,0,0,0.06)' }
					}
				}
			};

			return (
				<div className="card card-glass p-3" style={{ border: 'none' }}>
					{showHeader && (
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted">Monthly Income {fromDate ? `(custom)` : `(last ${labels.length})`}</div>
								<div className="h5 mb-2">{`₱${totals.reduce((s, n) => s + n, 0).toLocaleString()}`}</div>
							</div>
							<div className="text-muted small">{/* placeholder for potential extra metric */}</div>
						</div>
					)}
					<div className={compact ? 'pm-dashboard-chart' : 'pm-modal-chart'}>
						<Line data={data} options={options} />
					</div>
				</div>
			);
		};

	const fetchDashboardData = async () => {
		try {
			const [tenantsRes, apartmentsRes, billsRes, devicesRes, paymentHistoryRes] = await Promise.all([
				axios.get('/api/tenants'),
				axios.get('/api/apartments'),
				axios.get('/api/bills'),
				axios.get('/api/meter-devices'),
				axios.get('/api/payment-history')
			]);

			const tenants = Array.isArray(tenantsRes.data) ? tenantsRes.data : [];
			const apartments = Array.isArray(apartmentsRes.data) ? apartmentsRes.data : [];
			const bills = Array.isArray(billsRes.data) ? billsRes.data : [];
			const devices = Array.isArray(devicesRes.data) ? devicesRes.data : (devicesRes.data && devicesRes.data.devices ? devicesRes.data.devices : []);
			const payments = Array.isArray(paymentHistoryRes.data) ? paymentHistoryRes.data : [];

			const occupiedCount = apartments.filter(a => {
				if (typeof a.occupied === 'boolean') return a.occupied;
				if (a.status) return String(a.status).toLowerCase() === 'occupied';
				if (a.tenant_id || a.current_tenant_id || a.tenant) return true;
				return false;
			}).length;

			const today = new Date();
			const isOverdue = (b) => {
				if (!b) return false;
				const status = (b.status || '').toString().toLowerCase();
				if (status && (status.includes('over') || status.includes('late') || status.includes('past_due') || (status.includes('due') && !status.includes('paid')))) {
					if (!status.includes('paid')) return true;
				}
				if (b.due_date) {
					const d = new Date(b.due_date);
					if (!isNaN(d) && d < today && status !== 'paid') return true;
				}
				return false;
			};

			// totalRevenue should only include payment_history sums
			const totalRevenueFromPayments = payments.reduce((s, p) => s + (Number(p.amount_paid || 0)), 0);
			setStats({ totalTenants: tenants.length, totalApartments: apartments.length, occupiedApartments: occupiedCount, overdueBills: bills.filter(isOverdue).length, totalRevenue: totalRevenueFromPayments });
			setAllBills(bills);
			// attach payments to state for monthly chart consumption
			// we'll enrich payments into a simple array accessible by MonthlyIncomeChart via allBillsPayments variable
			setAllBills(prev => prev); // keep bills for other UIs
			// store payments in a local var for MonthlyIncomeChart via closure; use setState for payments if needed
			setMonthlyPayments(payments);
			// Prioritize overdue (by rule), then pending, then most recent due/created. Keep paused bills demoted.
			setRecentBills(bills.slice().sort((a,b) => {
				const pausedA = Boolean(a.is_paused || a.tenant_is_paused || a.status === 'paused');
				const pausedB = Boolean(b.is_paused || b.tenant_is_paused || b.status === 'paused');
				if (pausedA !== pausedB) return pausedA ? 1 : -1;
				const overdueA = isOverdueByRule(a) ? 1 : 0;
				const overdueB = isOverdueByRule(b) ? 1 : 0;
				if (overdueA !== overdueB) return overdueA > overdueB ? -1 : 1; // overdue first
				// status string-based pending detection
				const statusA = (a.status || '').toString().toLowerCase();
				const statusB = (b.status || '').toString().toLowerCase();
				const pendingA = statusA.includes('pending') || statusA.includes('due') ? 1 : 0;
				const pendingB = statusB.includes('pending') || statusB.includes('due') ? 1 : 0;
				if (pendingA !== pendingB) return pendingA > pendingB ? -1 : 1; // pending next
				// fallback: newest due_date/created_at first
				const da = new Date(a.due_date || a.created_at || 0).getTime();
				const db = new Date(b.due_date || b.created_at || 0).getTime();
				return db - da;
			}).slice(0,3));
			setMeterDevices(devices);
		} catch (err) {
			console.error('Failed to fetch dashboard data', err);
		} finally {
			setLoading(false);
		}
	};

	// Recompute totalRevenue whenever payments change
	useEffect(() => {
		if (!monthlyPayments) return;
		const paidTotal = monthlyPayments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
		setStats(prev => ({ ...prev, totalRevenue: paidTotal }));
	}, [monthlyPayments]);

	// Recompute monthly totals in the parent so the displayed total is never a stale/fixed value
	useEffect(() => {
		if (!monthlyPayments) return;
		const now = new Date();
		let fromDate = null;
		let toDate = now;
		let months = 6;
		if (typeof incomeRange === 'string') incomeRange = { type: incomeRange };
		if (incomeRange?.type === '3m') months = 3;
		else if (incomeRange?.type === '6m') months = 6;
		else if (incomeRange?.type === '12m') months = 12;
		else if (incomeRange?.from && incomeRange?.to) { fromDate = new Date(incomeRange.from); toDate = new Date(incomeRange.to); }

		const labels = [];
		if (fromDate) {
			const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
			const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
			while (cur <= end) { labels.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
		} else {
			for (let i = months - 1; i >= 0; i--) labels.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
		}

		const totals = new Array(labels.length).fill(0);
		// Use payment history entries to compute monthly totals
		monthlyPayments.forEach(p => {
			const d = p.paid_at || p.paidAt || p.created_at || p.date;
			if (!d) return;
			const dt = new Date(d);
			if (isNaN(dt)) return;
			const amt = Number(p.amount_paid || 0);
			if (fromDate) {
				if (dt < fromDate || dt > toDate) return;
				const idx = (dt.getFullYear() - fromDate.getFullYear()) * 12 + (dt.getMonth() - fromDate.getMonth());
				if (idx >= 0 && idx < totals.length) totals[idx] += amt;
			} else {
				const diffMonths = (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
				if (diffMonths >= 0 && diffMonths < labels.length) totals[labels.length - 1 - diffMonths] += amt;
			}
		});

		const totalSum = totals.reduce((s, n) => s + n, 0);
		setMonthlyLabel(fromDate ? 'Monthly Income (custom)' : `Monthly Income (last ${labels.length})`);
		setMonthlyTotal(totalSum);
	}, [monthlyPayments, incomeRange]);

	// listen for external bill updates so we can refresh immediately (frontend-only event)
	useEffect(() => {
		const onBillUpdated = () => fetchDashboardData();
		window.addEventListener('app:bill-updated', onBillUpdated);
		return () => window.removeEventListener('app:bill-updated', onBillUpdated);
	}, []);

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) { navigate('/property-manager-login'); return; }
		fetchDashboardData();
		const t = setInterval(fetchDashboardData, 30000);
		const onRefresh = () => fetchDashboardData();
		window.addEventListener('app:refresh-dashboard', onRefresh);
		const onQRResolved = (e) => { if (e?.detail && e.detail.tenant) { setScanModalData({ tenant: e.detail.tenant, bills: e.detail.bills || [] }); setScanModalOpen(true); setScannerOpen(false); } };
		window.addEventListener('app:qr-resolved', onQRResolved);
		return () => { clearInterval(t); window.removeEventListener('app:refresh-dashboard', onRefresh); window.removeEventListener('app:qr-resolved', onQRResolved); };
	}, [navigate]);

	if (loading) return <div className="container-fluid"><div className="text-center">Loading...</div></div>;

	const grouped = { electricity: [], water: [], other: [] };
	meterDevices.forEach(d => { const mt = (d.meter_type || d.type || '').toString().toLowerCase(); if (mt.includes('elect')) grouped.electricity.push(d); else if (mt.includes('water')) grouped.water.push(d); else grouped.other.push(d); });

	return (
		<div className="manager-dashboard">
			<GlobalHeader navItems={navItems} />

			<div style={{ position: 'absolute', right: 20, top: 84, zIndex: 50 }}>
				<button className="btn btn-primary" onClick={() => setScannerOpen(true)} title="Dashboard Scan">Scan</button>
			</div>

			<QuickScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} />
			{scanModalOpen && scanModalData && <ScanModal open={scanModalOpen} onClose={() => setScanModalOpen(false)} tenantPayload={scanModalData} />}

			<div className="container-fluid mgr-main">
				<div className="center-nav-wrap text-center mb-3"><nav className="center-nav">{navItems.map(item => <button key={item.key} className="center-nav-item" onClick={() => navigate(item.to)}>{item.label}</button>)}</nav></div>

				<div className="row mb-3">
					<div className="col-12">
						<div className="pm-summary-row">
							<div className="pm-summary-card card card-glass p-3"><div className="text-muted">Tenants</div><div className="h3">{stats.totalTenants}</div></div>
							<div className="pm-summary-card card card-glass p-3"><div className="text-muted">Apartments</div><div className="h3">{stats.totalApartments}</div></div>
							<div className="pm-summary-card card card-glass p-3"><div className="text-muted">Occupied</div><div className="h3">{stats.occupiedApartments}</div></div>
							<div className="pm-summary-card card card-glass p-3"><div className="text-muted">Overdue Bills</div><div className="h3">{stats.overdueBills}</div></div>
						</div>
					</div>
				</div>

				<div className="row align-items-start mb-4">
		    <div className="col-lg-6 col-md-12 mb-3">
			    <div className="pm-chart-card card panel">
								<div className="card-header d-flex justify-content-between align-items-center">
									<div className="d-flex align-items-center gap-3">
										<div className="d-flex align-items-baseline gap-2">
											<div className="text-muted small mb-0">{monthlyLabel || `Monthly Income`}</div>
											<div className="h5 mb-0">{monthlyTotal ? `₱${monthlyTotal.toLocaleString()}` : ''}</div>
										</div>
										<div className="pm-chart-embedded-toolbar-inline">
											<button className={`range-btn ${incomeRange.type === '3m' ? 'active' : ''}`} onClick={() => setIncomeRange({ type: '3m' })}>3M</button>
											<button className={`range-btn ${incomeRange.type === '6m' ? 'active' : ''}`} onClick={() => setIncomeRange({ type: '6m' })}>6M</button>
											<button className={`range-btn ${incomeRange.type === '12m' ? 'active' : ''}`} onClick={() => setIncomeRange({ type: '12m' })}>12M</button>
										</div>
									</div>
									<button className="btn btn-sm btn-outline-primary" onClick={() => setChartModalOpen(true)}>View More</button>
								</div>
								<div className="card-body p-0">
									<MonthlyIncomeChart payments={monthlyPayments} range={incomeRange} compact={true} showHeader={false} onTotals={({ label, total }) => { setMonthlyLabel(label); setMonthlyTotal(total); }} />
								</div>
							</div>
					</div>
					<div className="col-lg-6 col-md-12">
						<div className="card panel">
							<div className="card-header d-flex justify-content-between align-items-center">
								<span>Recent Bills</span>
								<button className="btn btn-sm btn-outline-primary" onClick={() => setModalOpen(prev => ({ ...prev, recentBills: true }))}>View More</button>
							</div>
							<div className="card-body">
								{recentBills.length === 0 ? <div className="text-muted">No recent bills</div> : (
										<table className="table table-sm pm-recent-bills-table"><thead><tr><th>Tenant</th><th className="amount-col">Amount</th><th>Due</th><th className="status-col">Status</th></tr></thead>
										<tbody>{recentBills.slice(0,3).map(b => { const paused = Boolean(b.is_paused || b.tenant_is_paused || b.status === 'paused'); const statusRaw = (b.status || '').toString(); const overdue = isOverdueByRule(b); let statusClass = 'pm-status-pending'; if (overdue) statusClass = 'pm-status-overdue'; else if (statusRaw.toLowerCase().includes('paid')) statusClass = 'pm-status-paid'; return (<tr key={b.id || b._id} style={{ background: paused ? '#f8f9fa' : 'transparent' }}><td>{b.tenant_name || b.tenant}</td><td className="amount-col">{formatCurrencyPeso(b.amount || b.amount_due || b.amount_paid || b.payment_amount || 0)}</td><td>{b.due_date ? new Date(b.due_date).toLocaleDateString() : ''}</td><td className="status-col">{paused ? <span className="pm-status-badge">paused</span> : <span className={`pm-status-badge ${statusClass}`}>{overdue ? 'overdue' : statusRaw}</span>}</td></tr>); })}</tbody>
									</table>
								)}
							</div>
						</div>
					</div>
				</div>

				<div className="row">
					<div className="col-md-6">
						<div className="card panel">
							<div className="card-header d-flex justify-content-between align-items-center"><span>🔌 Electricity Meters ({grouped.electricity.length})</span><button className="btn btn-sm btn-outline-primary" onClick={() => setModalOpen(prev => ({ ...prev, electricity: true }))}>View More</button></div>
							<div className="card-body recent-bills-body"><table className="table table-sm device-table text-center"><thead><tr><th>Tenant</th><th>Apartment</th><th>Reading</th><th>Date</th></tr></thead><tbody>{grouped.electricity.slice(0,3).map(d => (<tr key={d.device_id || d.id}><td>{d.assigned_tenant || d.tenant_name || 'Unassigned'}</td><td className="text-muted">{d.apartment_number || d.unit || '-'}</td><td>{d.present_reading != null ? `${formatMeterNumber(d.present_reading)} kWh` : (d.current_reading != null ? `${formatMeterNumber(d.current_reading)} kWh` : 'N/A')}</td><td className="small text-muted">{(d.last_updated || d.updated_at) ? new Date(d.last_updated || d.updated_at).toLocaleString() : 'N/A'}</td></tr>))}</tbody></table></div>
						</div>
					</div>
					<div className="col-md-6">
						<div className="card panel">
							<div className="card-header d-flex justify-content-between align-items-center"><span>🚰 Water Meters ({grouped.water.length})</span><button className="btn btn-sm btn-outline-primary" onClick={() => setModalOpen(prev => ({ ...prev, water: true }))}>View More</button></div>
							<div className="card-body recent-bills-body"><table className="table table-sm device-table text-center"><thead><tr><th>Tenant</th><th>Apartment</th><th>Reading</th><th>Date</th></tr></thead><tbody>{grouped.water.slice(0,3).map(d => (<tr key={d.device_id || d.id}><td>{d.assigned_tenant || d.tenant_name || 'Unassigned'}</td><td className="text-muted">{d.apartment_number || d.unit || '-'}</td><td>{d.present_reading != null ? `${formatMeterNumber(d.present_reading)} /m³` : (d.current_reading != null ? `${formatMeterNumber(d.current_reading)} /m³` : 'N/A')}</td><td className="small text-muted">{(d.last_updated || d.updated_at) ? new Date(d.last_updated || d.updated_at).toLocaleString() : 'N/A'}</td></tr>))}</tbody></table></div>
						</div>
					</div>
				</div>

				{modalOpen.recentBills && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-3 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Recent Bills</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setModalOpen(prev => ({ ...prev, recentBills: false }))}>Close</button>
							</div>
							<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
								<table className="table table-sm pm-recent-bills-table">
									<thead><tr><th>Tenant</th><th className="amount-col">Amount</th><th>Due</th><th className="status-col">Status</th></tr></thead>
									<tbody>{allBills.map(b => { const statusRaw = (b.status || '').toString(); const overdue = isOverdueByRule(b); let statusClass = 'pm-status-pending'; if (overdue) statusClass = 'pm-status-overdue'; else if (statusRaw.toLowerCase().includes('paid')) statusClass = 'pm-status-paid'; return (<tr key={b.id || b._id}><td>{b.tenant_name || b.tenant}</td><td className="amount-col">{formatCurrencyPeso(b.amount || b.amount_due || b.amount_paid || b.payment_amount || 0)}</td><td>{b.due_date ? new Date(b.due_date).toLocaleDateString() : ''}</td><td className="status-col">{<span className={`pm-status-badge ${statusClass}`}>{overdue ? 'overdue' : statusRaw}</span>}</td></tr>); })}</tbody>
								</table>
							</div>
						</div>
					</div>
				)}

				{chartModalOpen && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Monthly Income</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setChartModalOpen(false)}>✕</button>
							</div>
							<div className="p-3" style={{ maxHeight: '80vh', overflow: 'auto' }}>
								<div className="mb-3 d-flex gap-2 align-items-center">
									<label className="text-muted small mb-0">Custom range:</label>
									<input type="date" value={incomeRange.from || ''} onChange={e => setIncomeRange(prev => ({ ...prev, from: e.target.value, type: 'custom' }))} />
									<input type="date" value={incomeRange.to || ''} onChange={e => setIncomeRange(prev => ({ ...prev, to: e.target.value, type: 'custom' }))} />
									<button className="btn btn-sm btn-primary" onClick={() => { /* keep range already set, modal will show chart */ }}>Apply</button>
								</div>
												<MonthlyIncomeChart payments={monthlyPayments} range={incomeRange} compact={false} onTotals={({ label, total }) => { setMonthlyLabel(label); setMonthlyTotal(total); }} />
								{/* Potential extra details could be added here (breakdown, table) */}
							</div>
						</div>
					</div>
				)}

						{modalOpen.electricity && (
							<div className="pm-modal-backdrop-centered">
								<div className="pm-modal-centered">
									<div className="p-3 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}><strong>Electricity Meters</strong><button className="btn btn-sm btn-outline-secondary" onClick={() => setModalOpen(prev => ({ ...prev, electricity: false }))}>Close</button></div>
									<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
										<table className="table table-sm">
											<thead><tr><th>Tenant</th><th>Unit</th><th>Reading</th><th>Updated</th></tr></thead>
											<tbody>{grouped.electricity.map(d => (<tr key={d.device_id || d.id}><td>{d.assigned_tenant || d.tenant_name || 'Unassigned'}</td><td className="text-muted">{d.apartment_number || d.unit || '-'}</td><td>{d.present_reading != null ? formatMeterNumber(d.present_reading) : (d.current_reading != null ? formatMeterNumber(d.current_reading) : 'N/A')}</td><td className="small text-muted">{(d.last_updated || d.updated_at) ? new Date(d.last_updated || d.updated_at).toLocaleString() : 'N/A'}</td></tr>))}</tbody>
										</table>
									</div>
								</div>
							</div>
						)}

						{modalOpen.water && (
							<div className="pm-modal-backdrop-centered">
								<div className="pm-modal-centered">
									<div className="p-3 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}><strong>Water Meters</strong><button className="btn btn-sm btn-outline-secondary" onClick={() => setModalOpen(prev => ({ ...prev, water: false }))}>Close</button></div>
									<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
										<table className="table table-sm">
											<thead><tr><th>Tenant</th><th>Unit</th><th>Reading</th><th>Updated</th></tr></thead>
											<tbody>{grouped.water.map(d => (<tr key={d.device_id || d.id}><td>{d.assigned_tenant || d.tenant_name || 'Unassigned'}</td><td className="text-muted">{d.apartment_number || d.unit || '-'}</td><td>{d.present_reading != null ? formatMeterNumber(d.present_reading) : (d.current_reading != null ? formatMeterNumber(d.current_reading) : 'N/A')}</td><td className="small text-muted">{(d.last_updated || d.updated_at) ? new Date(d.last_updated || d.updated_at).toLocaleString() : 'N/A'}</td></tr>))}</tbody>
										</table>
									</div>
								</div>
							</div>
						)}

			</div>
		</div>
	);
};

export default PropertyManagerDashboard;
