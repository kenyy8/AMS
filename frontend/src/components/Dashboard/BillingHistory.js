import React, { useState, useEffect } from 'react';
import axios from '../../axiosConfig';
import { formatMeterNumber } from '../../utils/numberFormat';

const BillingHistory = () => {
  const [rows, setRows] = useState([]);
  const [tenant, setTenant] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (tenant) q.append('tenant', tenant);
      if (from) q.append('from', from);
      if (to) q.append('to', to);
  const res = await axios.get('/api/meter-devices/meter-history?' + q.toString());
      setRows(res.data || []);
    } catch (e) {
      console.error('Failed to load billing history', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
  <div className="container-fluid">
  <h3>Meter History</h3>
      <div className="row mb-3">
        <div className="col-md-3">
          <input className="form-control" placeholder="Tenant or Apartment" value={tenant} onChange={e => setTenant(e.target.value)} />
        </div>
        <div className="col-md-2">
          <input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="col-md-2">
          <input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="col-md-2">
          <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Search'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Apartment</th>
                  <th>Type</th>
                  <th>Previous</th>
                  <th>Present</th>
                  <th>Consumption</th>
                  <th>Rate</th>
                  <th>Total</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.tenant_name}</td>
                    <td>{r.apartment_number}</td>
                    <td>{r.meter_type}</td>
                    <td>{r.previous_reading != null ? formatMeterNumber(r.previous_reading) : ''}</td>
                    <td>{r.present_reading != null ? formatMeterNumber(r.present_reading) : ''}</td>
                    <td>{r.consumption != null ? formatMeterNumber(r.consumption) : ''}</td>
                    <td>{r.rate != null ? formatMeterNumber(r.rate) : ''}</td>
                    <td>{r.total_cost != null ? formatMeterNumber(r.total_cost) : ''}</td>
                    <td>{r.recorded_at ? new Date(r.recorded_at).toLocaleString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingHistory;
