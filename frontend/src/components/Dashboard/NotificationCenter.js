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

const Reports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
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
      // Fetch paid rows from reports endpoint (which uses payment_history filtered by paid_at)
      // and fetch pending rows directly from the Bill Management source (/api/bills)
      const params = {};
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      // no tenant filter by default (could be extended later)
      const [reportsRes, billsRes] = await Promise.all([
        axios.get('/api/reports/bills', { params }),
        axios.get('/api/bills')
      ]);

      const reports = Array.isArray(reportsRes.data) ? reportsRes.data : [];
      const allBills = Array.isArray(billsRes.data) ? billsRes.data : [];

      // Paid rows: authoritative from reports (payment_history)
      const paidRows = reports.filter(r => r.payment_history_id).map(r => ({
        id: r.bill_id || r.id,
        bill_id: r.bill_id || r.id,
        tenant_id: r.tenant_id,
        tenant_name: r.tenant_name,
        bill_type: r.bill_type,
        amount: Number(r.amount) || 0,
        due_date: r.due_date || r.paid_at || null,
        status: 'paid',
        payment_history_id: r.payment_history_id
      }));

      // Pending rows: use Bill Management source exactly (b.status !== 'paid')
      let pendingRows = allBills.filter(b => (b.status || '').toString().toLowerCase() !== 'paid');
      // apply date range filter client-side for pending rows using due_date
      if (startDate && endDate) {
        const s = new Date(startDate);
        const e = new Date(endDate);
        e.setHours(23,59,59,999);
        pendingRows = pendingRows.filter(b => {
          if (!b.due_date) return false;
          const d = new Date(b.due_date);
          return d >= s && d <= e;
        });
      }
      pendingRows = pendingRows.map(b => ({
        id: b.id,
        bill_id: b.id,
        tenant_id: b.tenant_id,
        tenant_name: b.tenant_name || b.tenantName || null,
        bill_type: b.bill_type,
        amount: Number(b.amount) || 0,
        due_date: b.due_date || null,
        status: 'pending'
      }));

      // Combine paid (from payment_history) and pending (from /api/bills)
      const combined = paidRows.concat(pendingRows);
      setBills(combined);
    } catch (e) {
      console.error('Failed to reload bills', e);
    } finally {
      setLoading(false);
    }
  };

  // Call reload on mount so the page shows results with the new default date range
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prepare chart data for full dataset (hierarchical view)
  const summaryTotals = useMemo(() => {
    const totalAmount = filtered.reduce((s,b) => s + (Number(b.amount)||0), 0);
    const totalPaid = filtered.reduce((s,b) => s + ((b.status==='paid') ? (Number(b.amount)||0) : 0), 0);
    return { totalAmount, totalPaid, totalDue: totalAmount - totalPaid };
  }, [filtered]);

  const statusData = useMemo(() => {
    const totals = filtered.reduce((acc,b)=>{const amt=Number(b.amount)||0; acc[b.status==='paid'?'paid':'due']+=amt; return acc;},{paid:0,due:0});
    return { labels:['Paid','Due'], datasets:[{ data:[totals.paid, totals.due], backgroundColor:['#36A2EB','#FF6384'] }] };
  }, [filtered]);

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
      filtered.forEach(b => { if (!b.due_date) return; const d = new Date(b.due_date); const key = `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}`; map[key] = map[key] || { paid:0, due:0 }; const amt = Number(b.amount)||0; if (b.status==='paid') map[key].paid+=amt; else map[key].due+=amt; });
      const labels = Object.keys(map).sort();
      const due = labels.map(l => map[l].due);
      const paid = labels.map(l => map[l].paid);
      return { labels, datasets:[ { label:'Due', data: due, backgroundColor:'#FF6384' }, { label:'Paid', data: paid, backgroundColor:'#36A2EB' } ] };
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
    const labels = [];
    const cumPaid = [];
    const cumDue = [];
    let runningPaid = 0;
    let runningDue = 0;
    rows.forEach(r => {
      const label = r.date.toLocaleDateString();
      // if labels last differs, push a new label
      if (labels.length === 0 || labels[labels.length - 1] !== label) {
        labels.push(label);
        cumPaid.push(r.paid ? r.amount : 0);
        cumDue.push(r.paid ? 0 : r.amount);
      } else {
        // same day: accumulate into last index
        const idx = labels.length - 1;
        if (r.paid) cumPaid[idx] += r.amount; else cumDue[idx] += r.amount;
      }
    });
    // convert to cumulative sums
    for (let i = 0; i < labels.length; i++) {
      runningPaid += cumPaid[i];
      runningDue += cumDue[i];
      cumPaid[i] = runningPaid;
      cumDue[i] = runningDue + 0; // ensure numeric
    }
    return {
      labels,
      datasets: [
        { label: 'Cumulative Due', data: cumDue, borderColor: '#FF6384', backgroundColor: 'rgba(255,99,132,0.2)', fill: true },
        { label: 'Cumulative Paid', data: cumPaid, borderColor: '#36A2EB', backgroundColor: 'rgba(54,162,235,0.2)', fill: true }
      ]
    };
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
    const rows = [['id','tenant_id','bill_type','amount','due_date','status']];
  filtered.forEach(b => rows.push([b.bill_id || b.id,b.tenant_id,displayBillType(b.bill_type),b.amount,b.due_date,b.status]));
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

  // Prepare aggregated summaries
  const totalAmount = filtered.reduce((s,b) => s + (Number(b.amount)||0), 0);
  const totalPaid = filtered.reduce((s,b) => s + ((b.status==='paid') ? (Number(b.amount)||0) : 0), 0);
  const totalDue = totalAmount - totalPaid;

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

      <div className="reports-grid">
  {/* summary card removed - totals now available via 'View details' */}

        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Status Breakdown</div></summary>
          <div className="card-body">
            <div className="report-chart">
              <Pie data={statusData} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }} />
            </div>
            <div className="mt-2 text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => openExpand('status')}>View details</button></div>
          </div>
        </details>

        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Due vs Paid</div></summary>
          <div className="card-body">
            <div className="report-chart">
              <Bar data={duePaidData} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }} />
            </div>
            <div className="mt-2 text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => openExpand('duePaid')}>View details</button></div>
          </div>
        </details>

        <details open className="report-card small-chart">
          <summary className="p-3"><div className="text-muted small mb-1">Cumulative Line (Paid vs Due)</div></summary>
          <div className="card-body">
            <div className="report-chart">
              <Line data={cumulativeLineData} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }} />
            </div>
            <div className="mt-2 text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => openExpand('cumulative')}>View details</button></div>
          </div>
        </details>

        <details open className="report-card type-breakdown">
          <summary className="p-3"><div className="text-muted small mb-1">By Bill Type</div></summary>
          <div className="card-body">
            <div className="report-chart">
              <Bar data={typeBreakdownData} options={{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }} />
            </div>
            <div className="mt-2 text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => openExpand('typeBreakdown')}>View details</button></div>
          </div>
        </details>
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
