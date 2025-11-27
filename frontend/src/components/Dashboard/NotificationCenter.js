import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import axios from '../../axiosConfig';
import { Bar, Line, Pie } from 'react-chartjs-2';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { displayBillType } from '../../utils/billTypes';
import { showToast } from '../../toastService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend);

const GRAPH_TYPES = [
  { value: 'stackedBar', label: 'Stacked Bar (Due vs Paid by day)' },
  { value: 'cumulativeLine', label: 'Cumulative Line (Paid vs Due)' },
  { value: 'pieStatus', label: 'Pie (Paid vs Unpaid total)' },
  { value: 'typeBreakdown', label: 'Bill Type Breakdown (by amount)' }
];

// Responsive CSS for Reports layout (injected on mount)
const RESPONSIVE_CSS = `
.reports-root .kpi-card { min-width:220px; min-height:84px; height:auto; padding:0.5rem; display:block; }
.reports-root .kpi-card .text-muted.small { margin-bottom:0.25rem; }
.reports-root .kpi-card .h4 { margin:0; line-height:1.15; }
.reports-root .insights-card { min-width:220px; height:auto; display:block; }
.reports-root .insights-card .insights-list { max-height:none; overflow:visible; line-height:1.15; }
.reports-root .card-row > .insights-card { flex: 1 1 360px; }
.reports-root .graphs-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.reports-root .report-card.small-chart .card-body { padding:0.75rem; }
@media (max-width:1200px) {
  .reports-root .graphs-grid { grid-template-columns:repeat(2,1fr); }
}
@media (max-width:720px) {
  .reports-root .card-row { flex-direction:column; }
  .reports-root .kpi-card, .reports-root .insights-card { width:100% !important; }
  .reports-root .graphs-grid { grid-template-columns:1fr; }
  /* ensure insights appears below late payments on mobile */
  .reports-root .insights-card { order:3; }
}
`;

function injectResponsiveStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('reports-responsive-styles')) return;
  const s = document.createElement('style');
  s.id = 'reports-responsive-styles';
  s.innerHTML = RESPONSIVE_CSS;
  document.head.appendChild(s);
}

const Reports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState({});
  const [graphs, setGraphs] = useState({ monthly_totals: [], status_breakdown: [], bill_type_breakdown: [] });
  const [filterType, setFilterType] = useState('ALL'); // ALL | RENT | UTILITY
  // show all data by default (no selection controls)
  const [expanded, setExpanded] = useState(null); // null or { type, data, title }

  // initial load will be handled by calling the existing `reload` helper on mount

  // date range selection (default: Jan 1 of current year -> today)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    return jan1.toISOString().slice(0,10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0,10));

  const filtered = useMemo(() => {
    const s = startDate ? new Date(startDate) : null;
    const e = endDate ? new Date(endDate) : null;
    if (!s || !e) return bills || [];
    e.setHours(23,59,59,999);
    return (bills || []).filter(b => {
      if (!b.due_date) return false;
      const d = new Date(b.due_date);
      return d >= s && d <= e;
    });
  }, [bills, startDate, endDate]);

  const reload = async () => {
    setLoading(true);
    try {
      // Use new overview endpoint which returns summary, graphs, and detailed_table
      const params = {};
      if (startDate && endDate) { params.startDate = startDate; params.endDate = endDate; }
      const resp = await axios.get('/api/reports/overview', { params });
      const data = resp && resp.data ? resp.data : {};
      // Set summary and graphs into state-local variables for rendering (reuse existing memo hooks)
      setSummary(data.summary || {});
      setGraphs(data.graphs || {});
      // detailed_table contains combined paid and pending rows
      const details = Array.isArray(data.detailed_table) ? data.detailed_table : [];
      // Normalize detail rows to internal bills array used by existing UI code
      const normalized = details.map(r => ({
  id: r.bill_id || r.id,
        bill_id: r.bill_id || r.id,
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_name || null,
        bill_type: r.bill_type,
        payment_type: (r.payment_type || (r.bill_type||'').toString().toUpperCase()).toString().toUpperCase(),
        amount: Number(r.amount) || 0,
        due_date: r.date || r.due_date || r.paid_at || null,
  status: (r.status || (r.payment_history_id ? 'paid' : 'pending')),
  payment_history_id: r.payment_history_id || null
      }));
      setBills(normalized);
    } catch (e) {
      console.error('Failed to reload bills', e);
    } finally {
      setLoading(false);
    }
  };

  // Call reload on mount so the page shows results with the new default date range
  useEffect(() => {
  injectResponsiveStyles();
  reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prepare chart data for full dataset (hierarchical view)
  const summaryTotals = useMemo(() => {
    const totalAmount = filtered.reduce((s,b) => s + (Number(b.amount)||0), 0);
    const totalPaid = filtered.reduce((s,b) => s + ((b.status==='paid') ? (Number(b.amount)||0) : 0), 0);
    return { totalAmount, totalPaid, totalDue: totalAmount - totalPaid };
  }, [filtered]);

  // status pie now split into Rent Paid, Rent Due, Utility Paid, Utility Due
  const statusData = useMemo(() => {
    const totals = filtered.reduce((acc,b)=>{
      const amt = Number(b.amount)||0;
      const pt = (b.payment_type || '').toString().toUpperCase() || ((b.bill_type||'').toString().toLowerCase().includes('water')|| (b.bill_type||'').toString().toLowerCase().includes('elect') ? 'UTILITY' : 'RENT');
      const key = `${pt}_${b.status==='paid'?'PAID':'DUE'}`;
      acc[key] = (acc[key]||0) + amt;
      return acc;
    }, {});
    const labels = ['Rent Collected','Rent Due','Utility Collected','Utility Due'];
    const data = [ (totals['RENT_PAID']||0), (totals['RENT_DUE']||0), (totals['UTILITY_PAID']||0), (totals['UTILITY_DUE']||0) ];
    return { labels, datasets:[{ data, backgroundColor:['#2ecc71','#e67e22','#e74c3c','#ffb6c1'] }] };
  }, [filtered]);

  // Due vs Paid bar graph: group by Rent vs Utility
  const duePaidData = useMemo(() => {
    if (!filtered || filtered.length === 0) return { labels:[], datasets:[] };
    const dates = filtered.map(b => b.due_date).filter(Boolean).map(d=>new Date(d));
    const minD = new Date(Math.min(...dates));
    const maxD = new Date(Math.max(...dates));
    // If range too big, aggregate by month
    const dayCount = Math.ceil((maxD - minD)/(1000*60*60*24)) + 1;
    if (dayCount > 120) {
      // aggregate by month
      const map = {};
      // aggregate by month and by payment_type
      filtered.forEach(b => {
        if (!b.due_date) return;
        const d = new Date(b.due_date);
        const key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`;
        map[key] = map[key] || { rent_paid:0, rent_due:0, utility_paid:0, utility_due:0 };
        const amt = Number(b.amount)||0;
        const pt = (b.payment_type || '').toString().toUpperCase() || ((b.bill_type||'').toString().toLowerCase().includes('water')|| (b.bill_type||'').toString().toLowerCase().includes('elect') ? 'UTILITY' : 'RENT');
        if (pt === 'UTILITY') {
          if (b.status === 'paid') map[key].utility_paid += amt; else map[key].utility_due += amt;
        } else {
          if (b.status === 'paid') map[key].rent_paid += amt; else map[key].rent_due += amt;
        }
      });
      const labels = Object.keys(map).sort();
      const rentDue = labels.map(l => map[l].rent_due);
      const rentPaid = labels.map(l => map[l].rent_paid);
      const utilDue = labels.map(l => map[l].utility_due);
      const utilPaid = labels.map(l => map[l].utility_paid);
      return { labels, datasets:[ { label:'Rent Due', data: rentDue, backgroundColor:'#e67e22' }, { label:'Rent Paid', data: rentPaid, backgroundColor:'#2ecc71' }, { label:'Utility Due', data: utilDue, backgroundColor:'#e74c3c' }, { label:'Utility Paid', data: utilPaid, backgroundColor:'#f39c9f' } ] };
    }
    // daily aggregation
    const s = new Date(minD); const e = new Date(maxD);
    const labels = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) labels.push(new Date(d).toLocaleDateString());
    const due = new Array(labels.length).fill(0); const paid = new Array(labels.length).fill(0);
    filtered.forEach(b => { if (!b.due_date) return; const d = new Date(b.due_date); const idx = labels.indexOf(d.toLocaleDateString()); if (idx<0) return; const amt = Number(b.amount)||0; if (b.status==='paid') paid[idx]+=amt; else due[idx]+=amt; });
    return { labels, datasets:[ { label:'Due', data: due, backgroundColor:'#FF6384' }, { label:'Paid', data: paid, backgroundColor:'#36A2EB' } ] };
  }, [filtered]);

  const cumulativeLineData = useMemo(() => {
    if (!filtered || filtered.length === 0) return { labels: [], datasets: [] };
    const rows = filtered
      .filter(b => b.due_date)
      .map(b => ({ date: new Date(b.due_date), amount: Number(b.amount) || 0, paid: b.status === 'paid' }));
    // sort by date
    rows.sort((a, b) => a.date - b.date);
    // compute two cumulative series: Rent Collected (from paid rows where payment_type=RENT) and Utility Collected (payment_type=UTILITY)
    const rowsByDate = {};
    rows.forEach(r => {
      const label = r.date.toLocaleDateString();
      rowsByDate[label] = rowsByDate[label] || { rent:0, utility:0 };
      // infer payment_type from row if possible (rows here are from filtered which include payment_type on paid rows)
      const pt = (r.payment_type || '').toString().toUpperCase() || ((r.bill_type||'').toString().toLowerCase().includes('water')|| (r.bill_type||'').toString().toLowerCase().includes('elect') ? 'UTILITY' : 'RENT');
      if (r.paid) {
        if (pt === 'UTILITY') rowsByDate[label].utility += r.amount; else rowsByDate[label].rent += r.amount;
      }
    });
    const labels = Object.keys(rowsByDate).sort((a,b)=> new Date(a) - new Date(b));
    const rentSeries = labels.map(l => rowsByDate[l].rent);
    const utilSeries = labels.map(l => rowsByDate[l].utility);
    // cumulative
    const cumRent = []; const cumUtil = []; let rAcc=0, uAcc=0; for (let i=0;i<labels.length;i++){ rAcc+=rentSeries[i]; uAcc+=utilSeries[i]; cumRent.push(rAcc); cumUtil.push(uAcc); }
    return { labels, datasets: [ { label: 'Rent Collected', data: cumRent, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.15)', fill:true }, { label: 'Utility Collected', data: cumUtil, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.15)', fill:true } ] };
  }, [filtered]);

  const typeBreakdownData = useMemo(() => {
    const byType = {};
    filtered.forEach(b => { const t = displayBillType(b.bill_type || 'other'); byType[t] = (byType[t]||0) + (Number(b.amount)||0); });
    const labels = Object.keys(byType);
    return { labels, datasets:[{ data: labels.map(l => byType[l]), backgroundColor: labels.map((_,i)=>`hsl(${(i*60)%360} 70% 50%)`) }] };
  }, [filtered]);

  // export helpers
  const exportCSV = () => {
    // build CSV from filtered bills
    if (!filtered || filtered.length === 0) return showToast('No data to export', 'info');
    const rows = [['tenant_id','bill_type','payment_type','amount','due_date','status']];
  filteredByType.forEach(b => rows.push([b.tenant_id,displayBillType(b.bill_type),(b.payment_type||''),b.amount,b.due_date,b.status]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `reports_${startDate}_to_${endDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };


  const openExpand = (type) => {
    // choose content based on type
    if (type === 'summary') {
      setExpanded({ type:'summary', title: 'Summary', data: { totalAmount: summaryTotals.totalAmount, totalPaid: summaryTotals.totalPaid, totalDue: summaryTotals.totalDue } });
      return;
    }
    if (type === 'status') {
      setExpanded({ type:'pie', title:'Status Breakdown', data: statusData });
      return;
    }
    if (type === 'duePaid') {
      setExpanded({ type:'bar', title:'Due vs Paid', data: duePaidData });
      return;
    }
    if (type === 'cumulative') {
      setExpanded({ type:'line', title:'Cumulative (Paid vs Due)', data: cumulativeLineData });
      return;
    }
    if (type === 'typeBreakdown') {
      setExpanded({ type:'barH', title:'By Bill Type', data: typeBreakdownData });
      return;
    }
  };

  const closeExpand = () => setExpanded(null);

  const exportPDF = async () => {
    // render the chart area to PDF using html2canvas + jsPDF
    try {
    const el = document.querySelector('.card-body canvas') || document.querySelector('.card-body');
  if (!el) return showToast('Nothing to export', 'info');
      const canvas = await html2canvas(el, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape');
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
  pdf.save(`reports_${startDate}_to_${endDate}.pdf`);
    } catch (e) {
      console.error('Failed to export PDF', e);
      showToast('Failed to export PDF', 'error');
    }
  };

  if (loading) return <div className="container-fluid"><div className="text-center">Loading reports...</div></div>;

  // Apply filterType to filtered bills
  const filteredByType = filtered.filter(b => {
    if (filterType === 'ALL') return true;
    if (filterType === 'RENT') return (b.payment_type || '').toString().toUpperCase() === 'RENT' || (b.bill_type||'').toString().toLowerCase().includes('rent');
    if (filterType === 'UTILITY') return (b.payment_type || '').toString().toUpperCase() === 'UTILITY' || (b.bill_type||'').toString().toLowerCase().includes('water') || (b.bill_type||'').toString().toLowerCase().includes('elect');
    return true;
  });

  // KPI cards values from summary (fallback to client aggregates)
  const kpi = {
    rent_collected: Number(summary.rent_collected || filteredByType.filter(b => (b.payment_type||'').toString().toUpperCase()==='RENT' && b.status==='paid').reduce((s,b)=>s+Number(b.amount||0),0)),
    rent_due: Number(summary.rent_due || filteredByType.filter(b => (b.payment_type||'').toString().toUpperCase()==='RENT' && b.status!=='paid').reduce((s,b)=>s+Number(b.amount||0),0)),
    utility_collected: Number(summary.utility_collected || filteredByType.filter(b => (b.payment_type||'').toString().toUpperCase()==='UTILITY' && b.status==='paid').reduce((s,b)=>s+Number(b.amount||0),0)),
    utility_due: Number(summary.utility_due || filteredByType.filter(b => (b.payment_type||'').toString().toUpperCase()==='UTILITY' && b.status!=='paid').reduce((s,b)=>s+Number(b.amount||0),0)),
    occupancy_rate: summary.occupancy_rate || 0,
    late_payment_count: summary.late_payment_count || 0
  };

  // Simple auto insights generator (basic rules)
  const insights = [];
  // Highest unpaid month (based on graphs.monthly_totals comparing (due vs collected) — approximate using utility_collected vs rent_collected)
  if (graphs.monthly_totals && graphs.monthly_totals.length > 0) {
    // compute month unpaid amounts (we'll approximate unpaid as rent_collected+utility_collected difference vs max seen)
    const unpaidByMonth = graphs.monthly_totals.map(m => ({ month: m.month, rent: m.rent_collected||0, utility: m.utility_collected||0 }));
    // find month with lowest collected total (as proxy for unpaid)
    const worst = unpaidByMonth.reduce((worstSoFar, cur) => { const curTotal = (cur.rent||0)+(cur.utility||0); const worstTotal = worstSoFar ? ((worstSoFar.rent||0)+(worstSoFar.utility||0)) : Infinity; return worstSoFar ? (curTotal < worstTotal ? cur : worstSoFar) : cur; }, null);
    if (worst) insights.push(`Lowest collection month: ${worst.month} — Rent ${Number(worst.rent).toLocaleString()} / Utility ${Number(worst.utility).toLocaleString()}`);
  }
  // Rent collection rate
  const rentCollectionRate = (kpi.rent_collected + kpi.rent_due) > 0 ? Math.round((kpi.rent_collected / (kpi.rent_collected + kpi.rent_due)) * 100) : 100;
  insights.push(`Rent collection rate: ${rentCollectionRate}%`);
  // Flag tenants with multiple lates (basic heuristic from bills list)
  const lateCounts = {};
  filtered.forEach(b => { if (b.status !== 'paid') { lateCounts[b.tenant_name || b.tenant_id] = (lateCounts[b.tenant_name || b.tenant_id]||0) + 1; } });
  const lateProne = Object.entries(lateCounts).filter(([t,c]) => c >= 2).map(([t]) => t).slice(0,5);
  if (lateProne.length) insights.push(`Suggest follow-up on ${lateProne.join(', ')}`);

  // (Utility Insights removed per request)

  return (
    <div className="reports-root container">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h3 className="m-0">Reports</h3>
        <div>
          <button className="btn btn-outline-secondary btn-sm me-2" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-outline-secondary btn-sm me-2" onClick={exportPDF}>Export PDF</button>
          {/* Dashboard link removed in favor of top navigation */}
        </div>
      </div>

      <div className="card mb-3 small-controls d-flex align-items-center justify-content-between">
        <div className="card-body py-2 w-100 d-flex align-items-center justify-content-between">
          <div className="d-flex gx-2 align-items-center">
            <div className="me-3">
              <label className="form-label small mb-0">Start</label>
              <input type="date" className="form-control form-control-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="me-3">
              <label className="form-label small mb-0">End</label>
              <input type="date" className="form-control form-control-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="me-3">
              <button className="btn btn-primary btn-sm" onClick={reload}>Reload</button>
            </div>
          </div>

          <div className="totals-summary text-end">
            <div className="text-muted small">Total Amount</div>
            <div className="h5 mb-0">{summaryTotals.totalAmount.toLocaleString()}</div>
            <div className="d-flex gap-3 mt-1 justify-content-end">
              <div className="text-success small">Paid: {summaryTotals.totalPaid.toLocaleString()}</div>
              <div className="text-danger small">Due: {summaryTotals.totalDue.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-row d-flex gap-3 mb-3">
        <div className="report-card summary p-3" style={{flex:1}}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="text-muted small">Rent Collected (Owner Income)</div>
              <div className="h4">{kpi.rent_collected.toLocaleString()}</div>
            </div>
            <div>
              <span className="badge bg-success">Rent</span>
            </div>
          </div>
        </div>
        <div className="report-card summary p-3" style={{flex:1}}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="text-muted small">Utilities Collected (Pass-through)</div>
              <div className="h4">{kpi.utility_collected.toLocaleString()}</div>
            </div>
            <div>
              <span className="badge bg-info">Utilities</span>
            </div>
          </div>
        </div>
        <div className="report-card summary p-3" style={{flex:1}}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="text-muted small">Rent Due</div>
              <div className="h4 text-danger">{kpi.rent_due.toLocaleString()}</div>
            </div>
            <div>
              <span className="badge bg-warning text-dark">Due</span>
            </div>
          </div>
        </div>
        <div className="report-card summary p-3" style={{flex:1}}>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="text-muted small">Utilities Due</div>
              <div className="h4 text-danger">{kpi.utility_due.toLocaleString()}</div>
            </div>
            <div>
              <span className="badge bg-primary">Utility Due</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-row d-flex gap-3 mb-3" style={{flexWrap:'wrap'}}>
        <div className="report-card summary p-3 kpi-card" style={{width:240}}>
          <div className="text-muted small">Occupancy Rate</div>
          <div className="h4">{kpi.occupancy_rate}%</div>
        </div>
        <div className="report-card summary p-3 kpi-card" style={{width:240}}>
          <div className="text-muted small">Late Payments</div>
          <div className="h4">{kpi.late_payment_count}</div>
        </div>
        <div className="report-card summary p-3 kpi-card insights-card" style={{width:240}}>
          <div className="text-muted small">Insights</div>
          <div className="insights-list">
            {insights.length === 0 && <div className="text-muted">No insights available</div>}
            {insights.slice(0,3).map((ins,i) => <div key={i} className={i===0 ? 'fw-bold small mb-1' : 'small mb-1'}>{ins}</div>)}
          </div>
        </div>
        <div style={{flex:1}} className="d-flex align-items-center">
          <div className="ms-auto">
            <label className="form-label small mb-0">Filter</label>
            <select className="form-select form-select-sm" value={filterType} onChange={e=>setFilterType(e.target.value)}>
              <option value="ALL">All</option>
              <option value="RENT">Rent Only</option>
              <option value="UTILITY">Utilities Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="graphs-grid" style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:20}}>
        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Cash Flow Trend (Rent vs Utility)</div></summary>
          <div className="card-body">
            <div className="report-chart" style={{height:240}}>
              <Line data={{ labels: graphs.monthly_totals.map(m=>m.month), datasets:[ { label:'Rent', data: graphs.monthly_totals.map(m=>m.rent_collected), borderColor:'#2ecc71', backgroundColor:'rgba(46,204,113,0.08)', fill:true }, { label:'Utility', data: graphs.monthly_totals.map(m=>m.utility_collected), borderColor:'#e74c3c', backgroundColor:'rgba(231,76,60,0.08)', fill:true } ] }} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true } } }} />
            </div>
            <div className="mt-2 text-end"><button title="Expand Chart" className="btn btn-sm btn-outline-primary" onClick={() => openExpand('cumulative')}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></div>
          </div>
        </details>

        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Status Breakdown</div></summary>
          <div className="card-body">
            <div className="report-chart" style={{height:240}}>
              <Pie data={{ labels: graphs.status_breakdown.map(s=>s.status), datasets:[{ data: graphs.status_breakdown.map(s=>s.total), backgroundColor:['#2ecc71','#e74c3c'] }] }} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true } } }} />
            </div>
            <div className="mt-2 text-end"><button title="Expand Chart" className="btn btn-sm btn-outline-primary" onClick={() => openExpand('status')}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></div>
          </div>
        </details>

        <details open className="report-card type-breakdown">
          <summary className="p-3"><div className="text-muted small mb-1">By Bill Type</div></summary>
          <div className="card-body">
            <div className="report-chart" style={{height:240}}>
              <Bar data={{ labels: graphs.bill_type_breakdown.map(b=>b.bill_type), datasets:[{ data: graphs.bill_type_breakdown.map(b=>b.total), backgroundColor: graphs.bill_type_breakdown.map((_,i)=>`hsl(${(i*60)%360} 70% 50%)`) }] }} options={{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }} />
            </div>
            <div className="mt-2 text-end"><button title="Expand Chart" className="btn btn-sm btn-outline-primary" onClick={() => openExpand('typeBreakdown')}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></div>
          </div>
        </details>

        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Due vs Paid Timeline</div></summary>
          <div className="card-body">
            <div className="report-chart" style={{height:240}}>
              <Bar data={duePaidData} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true } } }} />
            </div>
            <div className="mt-2 text-end"><button title="Expand Chart" className="btn btn-sm btn-outline-primary" onClick={() => openExpand('duePaid')}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></div>
          </div>
        </details>
      </div>

      <div className="card mt-3">
        <div className="card-body">
          <h5>Detailed Breakdown</h5>
          <div className="table-responsive">
            {/* Group rows by payment_type: RENT, ELECTRICITY, WATER */}
            {(() => {
              const groups = { RENT: [], ELECTRICITY: [], WATER: [], OTHER: [] };
              filteredByType.forEach(row => {
                const pt = (row.payment_type || '').toString().toUpperCase();
                if (pt === 'RENT') groups.RENT.push(row);
                else if (pt === 'ELECTRICITY') groups.ELECTRICITY.push(row);
                else if (pt === 'WATER') groups.WATER.push(row);
                else groups.OTHER.push(row);
              });

              const renderGroup = (title, items, badge) => (
                <div key={title} className="mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h6 className="m-0">{title} <small className="text-muted">({items.length})</small></h6>
                    <div>{badge}</div>
                  </div>
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(row => (
                        <tr key={`${row.bill_id}-${row.payment_history_id||'p'}`}>
                          <td>{row.tenant_name || row.tenant_id}</td>
                          <td>{Number(row.amount||0).toLocaleString()}</td>
                          <td>{row.due_date ? new Date(row.due_date).toLocaleDateString() : ''}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

              return (
                <div>
                  {renderGroup('Rent (Owner Income)', groups.RENT, <span className="badge bg-success">Rent</span>)}
                  {renderGroup('Electricity (Pass-through)', groups.ELECTRICITY, <span className="badge bg-primary">Electricity</span>)}
                  {renderGroup('Water (Pass-through)', groups.WATER, <span className="badge bg-info text-dark">Water</span>)}
                  {groups.OTHER.length > 0 && renderGroup('Other', groups.OTHER, <span className="badge bg-secondary">Other</span>)}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="overlay-modal" role="dialog" aria-modal="true">
          <div className="overlay-backdrop" onClick={closeExpand}></div>
          <div className="overlay-panel">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="m-0">{expanded.title}</h4>
              <button className="btn btn-sm btn-outline-secondary" onClick={closeExpand}>Close</button>
            </div>
            <div style={{height:'70vh', overflowY:'auto'}}>
              {expanded.type === 'pie' && <Pie data={expanded.data} options={{ maintainAspectRatio:false }} />}
              {expanded.type === 'bar' && <Bar data={expanded.data} options={{ maintainAspectRatio:false }} />}
              {expanded.type === 'barH' && <Bar data={expanded.data} options={{ indexAxis:'y', maintainAspectRatio:false }} />}
              {expanded.type === 'line' && <Line data={expanded.data} options={{ maintainAspectRatio:false }} />}
              {expanded.type === 'summary' && (
                <div className="p-3">
                  <div>Total: {expanded.data.totalAmount.toLocaleString()}</div>
                  <div className="text-success">Paid: {expanded.data.totalPaid.toLocaleString()}</div>
                  <div className="text-danger">Due: {expanded.data.totalDue.toLocaleString()}</div>
                </div>
              )}
              {expanded.type === 'allGraphs' && (
                <div className="modal-graphs-grid" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
                  <div style={{height:300}}><Pie data={statusData} options={{ maintainAspectRatio:false }} /></div>
                  <div style={{height:300}}><Bar data={duePaidData} options={{ maintainAspectRatio:false }} /></div>
                  <div style={{height:300}}><Line data={cumulativeLineData} options={{ maintainAspectRatio:false }} /></div>
                  <div style={{height:300}}><Bar data={typeBreakdownData} options={{ indexAxis:'y', maintainAspectRatio:false }} /></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
