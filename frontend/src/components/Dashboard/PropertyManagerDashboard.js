import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import GlobalHeader from '../Layout/GlobalHeader';
import QuickScannerModal from '../Layout/QuickScannerModal';
import ScanModal from '../Layout/ScanModal';
import { formatMeterNumber, formatCurrencyPeso } from '../../utils/numberFormat';
import '../../components/Dashboard/dashboard.css';

// Chart.js via react-chartjs-2 (chart.js already in package.json)
import { Line, Doughnut } from 'react-chartjs-2';
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
import { ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
ChartJS.register(ArcElement);

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
		const [stats, setStats] = useState({ totalTenants: 0, totalApartments: 0, occupiedApartments: 0, overdueBills: 0, totalRevenue: 0, rentIncome: 0, utilityCollections: 0 });
		const [tenantsData, setTenantsData] = useState([]);
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

	// helper: infer payment_type when missing
	const inferPaymentType = (row) => {
		const pt = (row.payment_type || '').toString().toUpperCase();
		if (pt) return pt;
		const bt = (row.bill_type || '').toString().toLowerCase();
		if (bt.includes('water') || bt.includes('elect') || bt.includes('elec')) return 'UTILITY';
		return 'RENT';
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
			// We'll compute separate series for RENT and UTILITY (cumulative chart expects running totals)
			const rentSeries = new Array(labels.length).fill(0);
			const utilitySeries = new Array(labels.length).fill(0);
			// Prefer explicit payments array when provided (payment_history) for accurate revenue
			const source = Array.isArray(payments) && payments.length > 0 ? payments : (Array.isArray(bills) ? bills : []);
			// guard: ensure source is an array before iterating
			(source || []).forEach(item => {
				const d = (item.paid_at || item.paidAt || item.payment_paid_at) || item.created_at || item.due_date || item.date || item.createdAt;
				if (!d) return;
				const dt = new Date(d);
				if (isNaN(dt)) return;
				const amt = Number(item.amount_paid || item.amount || item.payment_amount_paid || 0) || 0;
				const paymentType = inferPaymentType(item);
				if (fromDate) {
					if (dt < fromDate || dt > toDate) return;
					const idx = (dt.getFullYear() - fromDate.getFullYear()) * 12 + (dt.getMonth() - fromDate.getMonth());
					if (idx >= 0 && idx < labels.length) {
						if (paymentType === 'UTILITY') utilitySeries[idx] += amt; else rentSeries[idx] += amt;
						totals[idx] += amt;
					}
				} else {
					const diffMonths = (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
					if (diffMonths >= 0 && diffMonths < labels.length) {
						const idx = labels.length - 1 - diffMonths;
						if (paymentType === 'UTILITY') utilitySeries[idx] += amt; else rentSeries[idx] += amt;
						totals[idx] += amt;
					}
				}
			});

			// convert monthly buckets into cumulative running totals for each series
			const cumRent = []; const cumUtility = [];
			let rAcc = 0; let uAcc = 0;
			for (let i = 0; i < labels.length; i++) { rAcc += rentSeries[i]; uAcc += utilitySeries[i]; cumRent.push(rAcc); cumUtility.push(uAcc); }

			const data = useMemo(() => ({
				labels,
				datasets: [
					{
						label: 'Rent Collected',
						data: cumRent,
						fill: false,
						borderColor: '#2ecc71',
						backgroundColor: '#2ecc71',
						tension: 0.25,
						pointRadius: 3,
					},
					{
						label: 'Utility Collected',
						data: cumUtility,
						fill: false,
						borderColor: '#e74c3c',
						backgroundColor: '#e74c3c',
						tension: 0.25,
						pointRadius: 3,
					}
				]
			}), [labels.join('|'), cumRent.join('|'), cumUtility.join('|')]);

			// report totals back to parent if callback provided
			useEffect(() => {
				if (typeof onTotals === 'function') {
					onTotals({ label: fromDate ? 'Cumulative Collections (custom)' : `Cumulative Collections (last ${labels.length})`, total: totals.reduce((s, n) => s + n, 0) });
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
				plugins: { legend: { display: true } },
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

			// enhance tooltip to show series label + running total with peso sign
			options.plugins.tooltip = {
				callbacks: {
					label: function(context) {
						const label = context.dataset.label || '';
						const v = Number(context.parsed.y || 0);
						return `${label}: ₱${v.toLocaleString()}`;
					}
				}
			};

			return (
				<div className="card card-glass p-3" style={{ border: 'none' }}>
					{showHeader && (
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted">Cumulative Collections: Rent vs Utility {fromDate ? `(custom)` : `(last ${labels.length})`}</div>
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
			// compute breakdown by payment_type (default RENT)
			const rentIncome = payments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'RENT') ? Number(p.amount_paid || 0) : 0), 0);
			const utilityCollections = payments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'UTILITY') ? Number(p.amount_paid || 0) : 0), 0);
			setStats({ totalTenants: tenants.length, totalApartments: apartments.length, occupiedApartments: occupiedCount, overdueBills: bills.filter(isOverdue).length, totalRevenue: totalRevenueFromPayments, rentIncome, utilityCollections });
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
		const rentIncome = monthlyPayments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'RENT') ? Number(p.amount_paid || 0) : 0), 0);
		const utilityCollections = monthlyPayments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'UTILITY') ? Number(p.amount_paid || 0) : 0), 0);
		setStats(prev => ({ ...prev, totalRevenue: paidTotal, rentIncome, utilityCollections }));
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

	// New KPI computations
	const vacantUnits = Math.max(0, (stats.totalApartments || 0) - (stats.occupiedApartments || 0));
	const rentBilled = allBills.reduce((s, b) => {
		const bt = (b.bill_type || '').toString().toLowerCase();
		const pt = (b.payment_type || '').toString().toLowerCase();
		if (bt.includes('rent') || pt === 'rent') return s + Number(b.amount_due || b.amount || 0);
		return s;
	}, 0);
	const utilityBilled = allBills.reduce((s, b) => {
		const bt = (b.bill_type || '').toString().toLowerCase();
		const pt = (b.payment_type || '').toString().toLowerCase();
		if (bt.includes('water') || bt.includes('elect') || pt === 'utility') return s + Number(b.amount_due || b.amount || 0);
		return s;
	}, 0);
	const rentCollected = monthlyPayments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'RENT') ? Number(p.amount_paid || p.amount || 0) : 0), 0);
	const utilityCollected = monthlyPayments.reduce((s, p) => s + ((String(p.payment_type||'RENT').toUpperCase() === 'UTILITY') ? Number(p.amount_paid || p.amount || 0) : 0), 0);
	const rentCollectionRate = rentBilled > 0 ? Math.round((rentCollected / rentBilled) * 100) : (rentCollected > 0 ? 100 : 0);
	const utilityCollectionRate = utilityBilled > 0 ? Math.round((utilityCollected / utilityBilled) * 100) : (utilityCollected > 0 ? 100 : 0);

	// Action center metrics
	const overdueCount = allBills.filter(b => !isPaid(b) && isOverdueByRule(b)).length;
	const now = new Date();
	const latePayersCount = allBills.filter(b => !isPaid(b) && b.due_date && (new Date(b.due_date) < now)).length;

	// Payment Status doughnut data (Paid vs Unpaid)
	const paidCount = allBills.filter(b => isPaid(b)).length + monthlyPayments.filter(p => Number(p.amount_paid || 0) > 0).length;
	const unpaidCount = Math.max(0, allBills.length - paidCount);

	const paymentStatusData = {
		labels: ['Paid', 'Unpaid'],
		datasets: [{ data: [paidCount, unpaidCount], backgroundColor: ['#2ecc71', '#e74c3c'] }]
	};

	// Occupancy trend: build monthly occupancy series (occupied vs vacant)
	const occupancyLabels = [];
	const occupancySeries = [];
	try {
		// derive last 6 months
		const months = 6;
		const nowDate = new Date();
		for (let i = months - 1; i >= 0; i--) {
			const dt = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
			occupancyLabels.push(dt.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
			// best-effort: use stats.occupiedApartments as current point; historical data unavailable -> repeat current
			occupancySeries.push(stats.occupiedApartments || 0);
		}
	} catch (e) { /* ignore */ }

	const occupancyData = {
		labels: occupancyLabels,
		datasets: [{ label: 'Occupied', data: occupancySeries, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.05)', fill: true, tension: 0.3 }]
	};

	// Tenant growth: try to compute monthly tenant counts from tenantsData if available
	const tenantLabels = [];
	const tenantSeries = [];
	if (Array.isArray(tenantsData) && tenantsData.length > 0) {
		// assume tenantsData contains created_at timestamps; bucket by month for last 6 months
		const months = 6;
		const nowDate = new Date();
		for (let i = months - 1; i >= 0; i--) {
			const dt = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
			const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
			const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
			const count = tenantsData.filter(t => {
				const d = new Date(t.created_at || t.createdAt || t.joined_at || t.joinedAt || 0);
				return !isNaN(d) && d >= start && d < end;
			}).length;
			tenantLabels.push(dt.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
			tenantSeries.push(count);
		}
	}

	const tenantGrowthData = {
		labels: tenantLabels.length ? tenantLabels : occupancyLabels,
		datasets: [{ label: 'New Tenants', data: tenantSeries.length ? tenantSeries : occupancySeries.map(() => 0), borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.05)', fill: true, tension: 0.3 }]
	};

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

				{/* KPI Row 1 */}
				<div className="row mb-3">
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Tenants</div>
							<div className="h3">{stats.totalTenants}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Apartments</div>
							<div className="h3">{stats.totalApartments}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Occupied</div>
							<div className="h3">{stats.occupiedApartments}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card clickable" onClick={() => navigate('/apartment-management')} role="button">
							<div className="text-muted small">Vacant Units</div>
							<div className="h3">{vacantUnits}</div>
						</div>
					</div>
				</div>

				{/* KPI Row 2 */}
				<div className="row mb-4">
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Owner Income (Rent)</div>
							<div className="h4">{`₱${(stats.rentIncome||0).toLocaleString()}`}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Utility Pass-Through</div>
							<div className="h4">{`₱${(stats.utilityCollections||0).toLocaleString()}`}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Rent Collection Rate</div>
							<div className="h4">{`${rentCollectionRate}%`}</div>
						</div>
					</div>
					<div className="col-sm-6 col-md-3">
						<div className="card card-glass p-3 pm-kpi-card">
							<div className="text-muted small">Utility Collection Rate</div>
							<div className="h4">{`${utilityCollectionRate}%`}</div>
						</div>
					</div>
				</div>

				{/* Graphs Row */}
				<div className="row mb-4 pm-charts-grid">
					<div className="col-12 col-md-6 col-lg-3 mb-3">
						<div className="card card-glass p-2 pm-mini-chart">
							<div className="d-flex justify-content-between align-items-center mb-2">
								<div className="small text-muted">Rent & Utility Cash Flow</div>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setChartModalOpen(true)}>Expand</button>
							</div>
							<div style={{ height: 120 }}><MonthlyIncomeChart payments={monthlyPayments} range={incomeRange} compact={true} showHeader={false} /></div>
						</div>
					</div>
					<div className="col-12 col-md-6 col-lg-3 mb-3">
						<div className="card card-glass p-2 pm-mini-chart">
							<div className="d-flex justify-content-between align-items-center mb-2">
								<div className="small text-muted">Payment Status</div>
								<button className="btn btn-sm btn-outline-secondary">Expand</button>
							</div>
							<div style={{ height: 120 }} className="d-flex align-items-center justify-content-center">
								{(allBills.length === 0 && monthlyPayments.length === 0) ? <div className="text-muted">No data available</div> : <Doughnut data={paymentStatusData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-6 col-lg-3 mb-3">
						<div className="card card-glass p-2 pm-mini-chart">
							<div className="d-flex justify-content-between align-items-center mb-2">
								<div className="small text-muted">Occupancy Trend</div>
								<button className="btn btn-sm btn-outline-secondary">Expand</button>
							</div>
							<div style={{ height: 120 }}>
								{(occupancySeries.length === 0) ? <div className="text-muted text-center">No data available</div> : <Line data={occupancyData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }} />}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-6 col-lg-3 mb-3">
						<div className="card card-glass p-2 pm-mini-chart">
							<div className="d-flex justify-content-between align-items-center mb-2">
								<div className="small text-muted">Tenant Growth</div>
								<button className="btn btn-sm btn-outline-secondary">Expand</button>
							</div>
							<div style={{ height: 120 }}>
								{(tenantSeries.length === 0) ? <div className="text-muted text-center">No data available</div> : <Line data={tenantGrowthData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }} />}
							</div>
						</div>
					</div>
				</div>

				{/* Action Center */}
				<div className="row mb-5">
					<div className="col-12 col-md-6">
						<div className="card card-glass p-3">
							<div className="d-flex justify-content-between align-items-center mb-2"><strong>Action Center</strong><small className="text-muted">Quick actions & alerts</small></div>
							<div>
								<div className="pm-action-item d-flex justify-content-between align-items-center p-2" style={{ borderBottom: '1px solid #eee' }}>
									<div>
										<div className="text-muted small">Overdue Bills</div>
										<div className="h5">{overdueCount}</div>
									</div>
									<div>
										<button className="btn btn-sm btn-outline-primary" onClick={() => navigate('/bill-management?filter=overdue')}>View</button>
									</div>
								</div>
								{/* Expiring leases removed per redesign request */}
								<div className="pm-action-item d-flex justify-content-between align-items-center p-2">
									<div>
										<div className="text-muted small">Late Payers</div>
										<div className="h5">{latePayersCount}</div>
									</div>
									<div>
										<button className="btn btn-sm btn-outline-primary" onClick={() => navigate('/bill-management?filter=late')}>View</button>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div className="col-12 col-md-6">
						<div className="card card-glass p-3">
							<div className="d-flex justify-content-between align-items-center mb-2"><strong>Notes</strong><small className="text-muted">Tips & recent activity</small></div>
							<div className="text-muted small">Dashboard refreshed automatically. Click any card to drill into the respective management page.</div>
						</div>
					</div>
				</div>

				{chartModalOpen && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Monthly Income</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setChartModalOpen(false)}>✕</button>
							</div>
							<div className="p-3" style={{ maxHeight: '80vh', overflow: 'auto' }}>
								<MonthlyIncomeChart payments={monthlyPayments} range={incomeRange} compact={false} onTotals={({ label, total }) => { setMonthlyLabel(label); setMonthlyTotal(total); }} />
							</div>
						</div>
					</div>
				)}

			</div>
		</div>
	);
};

export default PropertyManagerDashboard;
