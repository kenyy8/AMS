import React, { useState, useEffect, useMemo } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import GlobalHeader from '../Layout/GlobalHeader';
import AdminScan from '../Common/AdminScan';
import ScanResult from '../Common/ScanResult';
// Tenant drawer is now handled inside AdminScan

// number formatting helpers not used in this component currently
// styles consolidated into App.css

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
import { Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
ChartJS.register(ArcElement);
ChartJS.register(Filler);

const PropertyManagerDashboard = () => {

		// Scanner modal state and button
		const [isScanModalOpen, setIsScanModalOpen] = useState(false);
		// scanned result/state for showing the result modal after scanner closes
		const [scannedResult, setScannedResult] = useState(null);
		const [isResultModalOpen, setIsResultModalOpen] = useState(false);
		// drawer state moved into AdminScan; dashboard only opens the scanner
		const ScanButton = () => {
			return (
				<button className="btn btn-primary" onClick={() => setIsScanModalOpen(true)} title="Dashboard Scan">Scan</button>
			);
		};


	// local UI & data state (ensure these are declared before any helper components/functions)
	const [loading, setLoading] = useState(true);
	const [stats, setStats] = useState({ totalTenants: 0, totalApartments: 0, occupiedApartments: 0, overdueBills: 0, totalRevenue: 0, rentIncome: 0, utilityCollections: 0 });
	const [allBills, setAllBills] = useState([]);
	// some dashboard state is kept for layout features; silence unused warnings
	// eslint-disable-next-line no-unused-vars
	const [apartmentsData, setApartmentsData] = useState([]);
	const [monthlyPayments, setMonthlyPayments] = useState([]);
	// eslint-disable-next-line no-unused-vars
	const [recentBills, setRecentBills] = useState([]);
	// eslint-disable-next-line no-unused-vars
	const [meterDevices, setMeterDevices] = useState([]);
	const [tenantsData, setTenantsData] = useState([]);
	// eslint-disable-next-line no-unused-vars
	const [monthlyLabel, setMonthlyLabel] = useState('');
	const [monthlyTotal, setMonthlyTotal] = useState(0);
	// eslint-disable-next-line no-unused-vars
	const [incomeRange, setIncomeRange] = useState({ type: '6m' });

	// UI modals / controls
	// scannerOpen state removed; scanner is modal-based
	const [chartModalOpen, setChartModalOpen] = useState(false);
	const [paymentModalOpen, setPaymentModalOpen] = useState(false);
	const [occupancyModalOpen, setOccupancyModalOpen] = useState(false);
	const [insightsModalOpen, setInsightsModalOpen] = useState(false);

	// routing/navigation
	const navigate = useNavigate();

	// navigation items passed to GlobalHeader
	const navItems = [
		{ to: '/property-manager-dashboard', label: 'Dashboard' },
		{ to: '/tenant-management', label: 'Tenants' },
		{ to: '/bill-management', label: 'Bills' },
		{ to: '/apartment-management', label: 'Apartments' },
		{ to: '/meter-device-management', label: 'Meter' },
		{ to: '/qr-code-generator', label: 'QR Codes' },
		{ to: '/reports', label: 'Reports' },
	];

	// helper: determine if a bill is paid
	const isPaid = (b) => {
		if (!b) return false;
		const status = (b.status || '').toString().toLowerCase();
		if (status === 'paid' || status === 'completed' || status === 'settled') return true;
		// fallback: look for amount_paid or payment marker
		if (Number(b.amount_paid || b.paid_amount || 0) > 0) return true;
		return false;
	};

	// infer payment type from a payment or bill object
	const inferPaymentType = (item) => {
		if (!item) return 'RENT';
		const pt = (item.payment_type || item.paymentType || item.bill_type || item.type || '').toString().toLowerCase();
		if (pt.includes('util') || pt.includes('water') || pt.includes('electric')) return 'UTILITY';
		if (pt.includes('rent')) return 'RENT';
		// some payment_history rows may include metadata
		if (item.description && item.description.toLowerCase().includes('utility')) return 'UTILITY';
		return 'RENT';
	};

	// overdue rule: check status or due_date vs today
	const isOverdueByRule = (b) => {
		if (!b) return false;
		const status = (b.status || '').toString().toLowerCase();
		if (status && (status.includes('over') || status.includes('late') || status.includes('past_due') || (status.includes('due') && !status.includes('paid')))) {
			if (!status.includes('paid')) return true;
		}
		if (b.due_date) {
			const d = new Date(b.due_date);
			if (!isNaN(d) && d < new Date() && status !== 'paid') return true;
		}
		return false;
	};

// MonthlyIncomeChart supports dynamic ranges and ensures y-axis starts at zero.
const MonthlyIncomeChart = ({ bills, payments, range = { type: '6m' }, compact = true, showHeader = true, onTotals = null, bare = false }) => {
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
			/* eslint-disable react-hooks/exhaustive-deps */
			/* eslint-disable react-hooks/exhaustive-deps */
			}), [labels.join('|'), cumRent.join('|'), cumUtility.join('|')]);
			/* eslint-enable react-hooks/exhaustive-deps */
			/* eslint-enable react-hooks/exhaustive-deps */

			// report totals back to parent if callback provided
			useEffect(() => {
				if (typeof onTotals === 'function') {
					onTotals({ label: fromDate ? 'Cumulative Collections (custom)' : `Cumulative Collections (last ${labels.length})`, total: totals.reduce((s, n) => s + n, 0) });
				}
			/* eslint-disable react-hooks/exhaustive-deps */
			}, [labels.join('|'), totals.join('|')]);
			/* eslint-enable react-hooks/exhaustive-deps */

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

			// when used as inline / bare, render only the chart container (no outer card)
			if (bare) {
				return (
					<div className={compact ? 'pm-dashboard-chart' : 'pm-modal-chart'} style={{ height: '100%' }}>
						<Line data={data} options={options} />
					</div>
				);
			}

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

	const fetchDashboardData = React.useCallback(async () => {
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
			setApartmentsData(apartments);
			// attach payments to state for monthly chart consumption
			// we'll enrich payments into a simple array accessible by MonthlyIncomeChart via allBillsPayments variable
			setAllBills(prev => prev); // keep bills for other UIs
			// store payments in a local var for MonthlyIncomeChart via closure; use setState for payments if needed
			setMonthlyPayments(payments);
			// Prioritize overdue (by rule), then pending, then most recent due/created. Demote non-active tenants.
			setRecentBills(bills.slice().sort((a,b) => {
				const aActive = (a.status || a.tenant_status) === 'active';
				const bActive = (b.status || b.tenant_status) === 'active';
				if (aActive !== bActive) return aActive ? -1 : 1;
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
			setTenantsData(tenants);
		} catch (err) {
			console.error('Failed to fetch dashboard data', err);
			} finally {
				setLoading(false);
			}
		}, []);

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
		// do not reassign props/state variables — copy to a local variable
		const ir = (typeof incomeRange === 'string') ? { type: incomeRange } : (incomeRange || { type: '6m' });
		if (ir.type === '3m') months = 3;
		else if (ir.type === '6m') months = 6;
		else if (ir.type === '12m') months = 12;
		else if (ir.from && ir.to) { fromDate = new Date(ir.from); toDate = new Date(ir.to); }

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
	}, [fetchDashboardData]);

	useEffect(() => {
		const token = localStorage.getItem('token');
		if (!token) { navigate('/property-manager-login'); return; }
		// initial one-time fetch when dashboard mounts
		fetchDashboardData();
		// Keep a listener so the global Refresh button can trigger a manual reload
		const onRefresh = () => fetchDashboardData();
		window.addEventListener('app:refresh-dashboard', onRefresh);
			 return () => { window.removeEventListener('app:refresh-dashboard', onRefresh); };
	}, [navigate, fetchDashboardData]);

	// loading is handled in the render to avoid early returns that change hook order

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
	// eslint-disable-next-line no-unused-vars
	const totalCollected = monthlyPayments.reduce((s, p) => s + Number(p.amount_paid || p.amount || 0), 0);
	const rentCollectionRate = rentBilled > 0 ? Math.round((rentCollected / rentBilled) * 100) : (rentCollected > 0 ? 100 : 0);
	const utilityCollectionRate = utilityBilled > 0 ? Math.round((utilityCollected / utilityBilled) * 100) : (utilityCollected > 0 ? 100 : 0);

	// Action center metrics
	// eslint-disable-next-line no-unused-vars
	const overdueCount = allBills.filter(b => !isPaid(b) && isOverdueByRule(b)).length;
	const now = new Date();
	// eslint-disable-next-line no-unused-vars
	const latePayersCount = allBills.filter(b => !isPaid(b) && b.due_date && (new Date(b.due_date) < now)).length;

	// Compute Payment Status exactly as requested:
	// - totalPaid from payment_history (monthlyPayments)
	// - totalUnpaid from bills where status denotes unpaid (allBills)
	const paidTotal = (monthlyPayments || []).reduce((s, p) => s + Number(p.amount_paid || p.amount || 0), 0);

	// Exclude soft-deleted / cancelled / processed bills explicitly
	const unpaidBills = (allBills || []).filter(b => {
		if (!b) return false;
		if (b.deleted || b.is_deleted || b.deleted_at) return false;
		const status = (b.status || '').toString().toLowerCase();
		if (status.includes('cancel') || status.includes('void') || status.includes('processed')) return false;
		// treat as unpaid when status explicitly says unpaid or due/pending and not paid
		if (status === 'unpaid' || status.includes('due') || status.includes('pending')) return true;
		// fallback: if no paid marker, treat as unpaid
		return !isPaid(b);
	});
	const unpaidTotal = unpaidBills.reduce((s, b) => s + Number(b.amount_due || b.amount || 0), 0);

	// Logging removed to avoid console spam during normal operation

	const paymentStatusData = {
		labels: ['Paid (history)', 'Unpaid (bills)'],
		datasets: [{ data: [paidTotal, unpaidTotal], backgroundColor: ['#2ecc71', '#e74c3c'] }]
	};

	// UI totals
	const collectedAmount = paidTotal;
	const totalUnpaidAmount = unpaidTotal;
	const paidPercent = (paidTotal + unpaidTotal) > 0 ? Math.round((paidTotal / (paidTotal + unpaidTotal)) * 100) : null;

	// Property Insights (computed client-side from available data)
	// Top Tenant Payments: derive from payment history (monthlyPayments)
	// We want the most recent payments grouped by tenant and sorted by most recent payment date.
	let topTenantPaymentsList = [];
	try {
		const payments = Array.isArray(monthlyPayments) ? monthlyPayments.slice() : [];
		// normalize tenant id and payment date
		const byTenant = {};
		payments.forEach(p => {
			const tid = p.tenant_id || p.tenant || p.tenantId || p.account_id || 'unknown';
			const paidAt = p.paid_at || p.paidAt || p.created_at || p.createdAt || p.date || null;
			const amt = Number(p.amount_paid || p.amount || 0) || 0;
			if (!byTenant[tid]) byTenant[tid] = { tenantId: tid, lastPaidAt: paidAt ? new Date(paidAt) : null, totalPaid: 0, payments: [] };
			byTenant[tid].totalPaid += amt;
			if (paidAt) {
				const d = new Date(paidAt);
				if (!isNaN(d) && (!byTenant[tid].lastPaidAt || d > byTenant[tid].lastPaidAt)) byTenant[tid].lastPaidAt = d;
			}
			byTenant[tid].payments.push({ amount: amt, paidAt, raw: p });
		});
		topTenantPaymentsList = Object.values(byTenant).filter(t => t.tenantId && t.tenantId !== 'unknown').sort((a,b) => {
			// sort by lastPaidAt desc, then totalPaid desc
			const ta = a.lastPaidAt ? a.lastPaidAt.getTime() : 0;
			const tb = b.lastPaidAt ? b.lastPaidAt.getTime() : 0;
			if (tb !== ta) return tb - ta;
			return b.totalPaid - a.totalPaid;
		});
	} catch (e) { topTenantPaymentsList = []; }

	// Most overdue tenants: top 3 by total overdue amount, include bill types set
	let mostOverdueList = [];
	try {
		const map = {};
		(allBills || []).forEach(b => {
			if (!b) return;
			if (isPaid(b)) return;
			if (!isOverdueByRule(b)) return;
			const tid = b.tenant_id || b.tenant || b.tenantId || 'unknown';
			const amt = Number(b.amount_due || b.amount || 0) || 0;
			const bt = (b.bill_type || b.type || b.payment_type || '').toString();
			if (!map[tid]) map[tid] = { tenantId: tid, totalOverdue: 0, billTypes: new Set(), bills: [] };
			map[tid].totalOverdue += amt;
			if (bt) map[tid].billTypes.add(bt);
			map[tid].bills.push(b);
		});
		mostOverdueList = Object.values(map).filter(t => t.tenantId && t.tenantId !== 'unknown').map(t => ({ tenantId: t.tenantId, totalOverdue: t.totalOverdue, billTypes: Array.from(t.billTypes).slice(0,3), bills: t.bills })).sort((a,b) => b.totalOverdue - a.totalOverdue).slice(0,3);
	} catch (e) { mostOverdueList = []; }

	// Frequent late payers: based on bill history and payment history. We'll count bills where payment came after due_date or never paid and overdue.
	let frequentLatePayersList = [];
	try {
		// Build payment lookup by bill id or by tenant and bill due_date
		const payments = Array.isArray(monthlyPayments) ? monthlyPayments : [];
		const paymentsByBill = {};
		payments.forEach(p => {
			const bid = p.bill_id || p.billId || p.source_bill_id || null;
			if (bid) {
				paymentsByBill[bid] = paymentsByBill[bid] || [];
				paymentsByBill[bid].push(p);
			}
		});

		const freqMap = {};
		(allBills || []).forEach(b => {
			if (!b) return;
			const tid = b.tenant_id || b.tenant || b.tenantId || 'unknown';
			const due = b.due_date ? new Date(b.due_date) : null;
			// find payments for this bill if any
			const bid = b.id || b.bill_id || b.billId || null;
			const relatedPayments = bid ? (paymentsByBill[bid] || []) : [];
			let wasLate = false;
			if (relatedPayments.length > 0) {
				// if any payment has paid_at after due_date -> late
				for (const rp of relatedPayments) {
					const paidAt = rp.paid_at || rp.paidAt || rp.created_at || rp.createdAt || null;
					if (paidAt && due) {
						const pd = new Date(paidAt);
						if (!isNaN(pd) && pd > due) { wasLate = true; break; }
					}
				}
			} else {
				// no payments: if overdue by rule, count as late/overdue
				if (!isPaid(b) && isOverdueByRule(b)) wasLate = true;
			}
			if (wasLate) {
				freqMap[tid] = (freqMap[tid] || 0) + 1;
			}
		});
		frequentLatePayersList = Object.entries(freqMap).filter(([k]) => k && k !== 'unknown').map(([tenantId, count]) => ({ tenantId, count })).sort((a,b) => b.count - a.count).slice(0,3);
	} catch (e) { frequentLatePayersList = []; }

	// Occupancy trend: compute monthly occupied units using tenants' move_in_date (Tenant Management)
	/* eslint-disable react-hooks/exhaustive-deps */
	const { occupancyLabels, occupancySeries, totalOccupied, moveInsThisMonth } = React.useMemo(() => {
		const months = 6;
		const now = new Date();
		const labels = [];
		const series = [];
		for (let i = months - 1; i >= 0; i--) {
			const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
			// eslint-disable-next-line no-unused-vars
			const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
			const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
			labels.push(dt.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
			// Count tenants with move_in_date before month end (unique tenants or unique apartments?)
			// Requirement: Count Occupied Units = number of tenants with a valid move-in date
			const count = (Array.isArray(tenantsData) ? tenantsData : []).filter(t => {
				if (!t) return false;
				if (t.deleted || t.is_deleted || t.status === 'deleted' || t.status === 'removed') return false;
				const mid = t.move_in_date || t.moveInDate || t.created_at || t.createdAt || null;
				if (!mid) return false;
				const md = new Date(mid);
				if (isNaN(md)) return false;
				return md < end;
			}).length;
			series.push(count);
		}
		// Total occupied units = tenants with valid move_in_date up to now
		const total = (Array.isArray(tenantsData) ? tenantsData : []).filter(t => {
			if (!t) return false;
			if (t.deleted || t.is_deleted || t.status === 'deleted' || t.status === 'removed') return false;
			const mid = t.move_in_date || t.moveInDate || t.created_at || t.createdAt || null;
			if (!mid) return false;
			const md = new Date(mid);
			return !isNaN(md) && md <= now;
		}).length;
		// Move-ins this month
		const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
		const moveIns = (Array.isArray(tenantsData) ? tenantsData : []).filter(t => {
			const mid = t.move_in_date || t.moveInDate || t.created_at || t.createdAt || null;
			if (!mid) return false;
			const md = new Date(mid);
			if (isNaN(md)) return false;
			return md >= mStart && md < mEnd;
		}).length;
		return { occupancyLabels: labels, occupancySeries: series, totalOccupied: total, moveInsThisMonth: moveIns };
	}, [tenantsData]);
	/* eslint-enable react-hooks/exhaustive-deps */

	// also compute vacant series for modal view
	const _occupancyLabelsKey = Array.isArray(occupancyLabels) ? occupancyLabels.join('|') : '';
	const _occupancySeriesKey = Array.isArray(occupancySeries) ? occupancySeries.join('|') : '';
	// occupancyLabels and occupancySeries are derived from tenantsData and we use their joined keys in deps
	const occupancyData = React.useMemo(() => {
		const _computedOccupancyLabels = _occupancyLabelsKey ? _occupancyLabelsKey.split('|') : [];
		const _computedOccupancySeries = _occupancySeriesKey ? _occupancySeriesKey.split('|').map(n => Number(n || 0)) : [];
		return {
			labels: _computedOccupancyLabels,
			datasets: [{ label: 'Occupied', data: _computedOccupancySeries, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.12)', fill: true, tension: 0.3 }]
		};
	}, [_occupancyLabelsKey, _occupancySeriesKey]);

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

	// eslint-disable-next-line no-unused-vars
	const tenantGrowthData = {
		labels: tenantLabels.length ? tenantLabels : occupancyLabels,
		datasets: [{ label: 'New Tenants', data: tenantSeries.length ? tenantSeries : occupancySeries.map(() => 0), borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.05)', fill: true, tension: 0.3 }]
	};

	return (
		<div className="manager-dashboard">
			{loading && <div className="container-fluid"><div className="text-center">Loading...</div></div>}
			<GlobalHeader navItems={navItems} />

				{/* Centered Scan button - responsive and remains visually distinct */}
										<div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 1rem' }}>
												<ScanButton />
										</div>

										{isScanModalOpen && (
											<AdminScan open={true} onClose={() => setIsScanModalOpen(false)} onResult={(result) => { setScannedResult(result); setIsResultModalOpen(true); }} />
										)}
										{/* Render the result modal separately so the scanner can close immediately */}
										<ScanResult open={isResultModalOpen} onClose={() => { setIsResultModalOpen(false); setScannedResult(null); }} scannedData={scannedResult} />


			<div className="container-fluid mgr-main">
				{/* navigation is provided by the global header; inline center-nav removed to avoid duplication */}

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

				{/* Analytics mini-cards: uniform grid of four compact cards */}
				<div className="pm-charts-grid mb-4" style={{ marginTop: '8px' }}>
					<div className="pm-mini-chart card card-glass p-3">
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted small">Rent & Utility Cash Flow</div>
								<div className="h5">{`₱${(monthlyTotal||0).toLocaleString()}`}</div>
							</div>
							<div>
								<button className="btn btn-sm btn-outline-secondary" aria-label="Expand Cash Flow" onClick={() => setChartModalOpen(true)}>View</button>
							</div>
						</div>
						<div className="pm-mini-chart-body">
							<div className="pm-mini-chart-chart">
								<MonthlyIncomeChart payments={monthlyPayments} range={incomeRange} compact={true} bare={true} />
							</div>
						</div>
					</div>

					<div className="pm-mini-chart card card-glass p-3">
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted small">Payment Status</div>
								<div className="h5">{paidPercent !== null ? `${paidPercent}% Paid` : 'No data'}</div>
							</div>
							<div>
								<button className="btn btn-sm btn-outline-secondary" aria-label="Expand Payment Status" onClick={() => setPaymentModalOpen(true)}>View</button>
							</div>
						</div>
						<div className="pm-mini-chart-body">
							<div className="pm-mini-chart-chart">
								{/* donut chart placeholder - reuse paymentStatusData */}
								<Doughnut data={paymentStatusData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
							</div>
						</div>
					</div>

					<div className="pm-mini-chart card card-glass p-3">
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted small">Occupancy Trend</div>
								<div className="h5">{`${totalOccupied}`}</div>
							</div>
							<div>
								<button className="btn btn-sm btn-outline-secondary" aria-label="Expand Occupancy" onClick={() => setOccupancyModalOpen(true)}>View</button>
							</div>
						</div>
						<div className="pm-mini-chart-body">
							<div className="pm-mini-chart-chart">
								{/* inline small line chart */}
								<Line data={occupancyData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, filler: { propagate: true } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } }} />
							</div>
						</div>
					</div>

					<div className="pm-mini-chart card card-glass p-3">
						<div className="d-flex justify-content-between align-items-start">
							<div>
								<div className="text-muted small">Top Tenant Payments</div>
								<div className="h6" style={{ fontSize: '0.95rem' }}>{(topTenantPaymentsList && topTenantPaymentsList.length) ? (() => {
									const t = topTenantPaymentsList[0];
									// try to resolve friendly name from tenantsData
									const tenantObj = (tenantsData||[]).find(x => (x.id === t.tenantId || x.tenant_id === t.tenantId || String(x.id) === String(t.tenantId) || String(x.tenant_id) === String(t.tenantId)));
									const name = tenantObj ? (tenantObj.name || tenantObj.full_name || `${tenantObj.first_name || ''} ${tenantObj.last_name || ''}`.trim()) : t.tenantId;
									return `${name} — ₱${(t.totalPaid||0).toLocaleString()}`;
								})() : 'No payments this month'}</div>
							</div>
							<div>
								<button className="btn btn-sm btn-outline-secondary" aria-label="Expand Insights" onClick={() => setInsightsModalOpen(true)}>View</button>
							</div>
						</div>
						<div className="pm-mini-chart-body text-muted small">
							{/* Wrap child content in a single block so lines stack vertically inside the flex container */}
							<div style={{ width: '100%', display: 'block' }}>
								<div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{(mostOverdueList && mostOverdueList.length) ? (() => {
									const m = mostOverdueList[0];
									const tObj = (tenantsData||[]).find(x => (x.id === m.tenantId || x.tenant_id === m.tenantId || String(x.id) === String(m.tenantId) || String(x.tenant_id) === String(m.tenantId)));
									const name = tObj ? (tObj.name || tObj.full_name || `${tObj.first_name || ''} ${tObj.last_name || ''}`.trim()) : m.tenantId;
									const type = (m.billTypes && m.billTypes.length) ? m.billTypes[0] : '';
									return `Most Overdue: ${name} — ₱${(m.totalOverdue||0).toLocaleString()}${type ? ' ('+type+')' : ''}`;
								})() : 'Most Overdue: N/A'}</div>
								<div style={{ fontSize: '0.85rem' }}>{(frequentLatePayersList && frequentLatePayersList.length) ? (() => {
									const f = frequentLatePayersList[0];
									const tObj = (tenantsData||[]).find(x => (x.id === f.tenantId || x.tenant_id === f.tenantId || String(x.id) === String(f.tenantId) || String(x.tenant_id) === String(f.tenantId)));
									const name = tObj ? (tObj.name || tObj.full_name || `${tObj.first_name || ''} ${tObj.last_name || ''}`.trim()) : f.tenantId;
									return `Frequent Late: ${name} — ${f.count} overdue`;
								})() : 'Frequent Late: N/A'}</div>
							</div>
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

				{paymentModalOpen && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Payment Status</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={async () => { setPaymentModalOpen(false); await fetchDashboardData(); }}>✕</button>
							</div>
							<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
								<div className="mb-3">
									<div className="text-muted small">Summary</div>
									<div className="h5">{`₱${collectedAmount.toLocaleString()} collected / ₱${(totalUnpaidAmount||0).toLocaleString()} unpaid`}{paidPercent !== null ? ` — ${paidPercent}% Paid` : ''}</div>
								</div>
								<div>
									<div className="text-muted small">Details</div>
									{((allBills || []).length === 0 && (monthlyPayments || []).length === 0) ? <div className="text-muted">No payment history available</div> : (
										<div>
											<div className="mb-2">
												<div className="text-muted small">Paid (from payment_history)</div>
												<div className="h5">{`₱${collectedAmount.toLocaleString()} (${(monthlyPayments||[]).length} records)`}</div>
											</div>
											<div>
												<div className="text-muted small">Unpaid (from bills)</div>
												<div className="h5">{`₱${totalUnpaidAmount.toLocaleString()} (${unpaidBills.length} bills)`}</div>
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				)}

				{occupancyModalOpen && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Occupancy Trend</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setOccupancyModalOpen(false)}>✕</button>
							</div>
							<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
								<div className="mb-3">
									<div className="text-muted small">Total Occupied Units</div>
									<div className="h5">{`${totalOccupied}`}</div>
									<div className="text-muted small">Move-ins this month: {moveInsThisMonth}</div>
								</div>
								<div>
									{(occupancySeries.length === 0) ? <div className="text-muted">No occupancy data available yet — add tenants with move-in dates.</div> : (
										<div className="pm-modal-chart"><Line data={occupancyData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => items && items.length ? items[0].label : '', label: (ctx) => `Occupied: ${ctx.parsed.y}` } }, filler: { propagate: true } }, scales: { x: { display: true, title: { display: true, text: 'Month' }, grid: { color: 'rgba(0,0,0,0.04)' } }, y: { display: true, title: { display: true, text: 'Occupied Units' }, grid: { color: 'rgba(0,0,0,0.06)' }, beginAtZero: true, ticks: { precision: 0 } } } }} /></div>
									)}
								</div>
							</div>
						</div>
					</div>
				)}

				{insightsModalOpen && (
					<div className="pm-modal-backdrop-centered">
						<div className="pm-modal-centered">
							<div className="p-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid #eee' }}>
								<strong>Property Insights</strong>
								<button className="btn btn-sm btn-outline-secondary" onClick={() => setInsightsModalOpen(false)}>✕</button>
							</div>
							<div className="p-3" style={{ maxHeight: '70vh', overflow: 'auto' }}>
								<div className="mb-3">
									<div className="text-muted small">Top Tenant Payments (most recent)</div>
									{topTenantPaymentsList.length === 0 ? <div className="text-muted">No data</div> : (
										<div>
											<div className="h6">Top 3 Recent Payers</div>
											<ul>
												{topTenantPaymentsList.slice(0,3).map(t => {
													const tObj = (tenantsData||[]).find(x => (x.id === t.tenantId || x.tenant_id === t.tenantId || String(x.id) === String(t.tenantId) || String(x.tenant_id) === String(t.tenantId)));
													const name = tObj ? (tObj.name || tObj.full_name || `${tObj.first_name || ''} ${tObj.last_name || ''}`.trim()) : t.tenantId;
													return <li key={t.tenantId}>{`${name} — ₱${(t.totalPaid||0).toLocaleString()}${t.lastPaidAt ? ' — '+(new Date(t.lastPaidAt)).toLocaleDateString() : ''}`}</li>;
												})}
											</ul>
											<div className="text-muted small">Full list available in payments.</div>
										</div>
									)}
								</div>
								<div className="mb-3">
									<div className="text-muted small">Most Overdue Tenants</div>
									{mostOverdueList.length === 0 ? <div className="text-muted">No data</div> : (
										<ul>
											{mostOverdueList.map(m => {
												const tObj = (tenantsData||[]).find(x => (x.id === m.tenantId || x.tenant_id === m.tenantId || String(x.id) === String(m.tenantId) || String(x.tenant_id) === String(m.tenantId)));
												const name = tObj ? (tObj.name || tObj.full_name || `${tObj.first_name || ''} ${tObj.last_name || ''}`.trim()) : m.tenantId;
												const types = (m.billTypes || []).join(', ');
												return <li key={m.tenantId}>{`${name} — ₱${(m.totalOverdue||0).toLocaleString()}${types ? ' ('+types+')' : ''}`}</li>;
											})}
										</ul>
									)}
								</div>
								<div>
									<div className="text-muted small">Frequent Late Payers</div>
									{frequentLatePayersList.length === 0 ? <div className="text-muted">No data</div> : (
										<ul>
											{frequentLatePayersList.map(f => {
												const tObj = (tenantsData||[]).find(x => (x.id === f.tenantId || x.tenant_id === f.tenantId || String(x.id) === String(f.tenantId) || String(x.tenant_id) === String(f.tenantId)));
												const name = tObj ? (tObj.name || tObj.full_name || `${tObj.first_name || ''} ${tObj.last_name || ''}`.trim()) : f.tenantId;
												return <li key={f.tenantId}>{`${name} — ${f.count} overdue`}</li>;
											})}
										</ul>
									)}
								</div>
							</div>
						</div>
					</div>
				)}

			</div>
		</div>
	);
};

export default PropertyManagerDashboard;
