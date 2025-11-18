export function buildTenantBillsPayload(tenant, bills) {
  const tenantId = tenant?.id || tenant?.tenant_id || tenant;
  const tenantName = tenant?.name || tenant?.fullname || '';
  const rent = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('rent')).reduce((s,b)=>s+(Number(b.amount)||0),0);
  const water = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('water')).reduce((s,b)=>s+(Number(b.amount)||0),0);
  const electricity = bills.filter(b => (b.bill_type||'').toString().toLowerCase().includes('electric')).reduce((s,b)=>s+(Number(b.amount)||0),0);
  const total = rent + water + electricity;
  const dates = bills.map(b => b.due_date).filter(Boolean).map(d=>new Date(d)).filter(d=>!isNaN(d));
  const dateRange = dates.length ? { start: new Date(Math.min(...dates)).toISOString(), end: new Date(Math.max(...dates)).toISOString() } : { start: null, end: null };
  return {
    type: 'tenant_bills',
    tenant_id: tenantId,
    tenant_name: tenantName,
    bills: bills.map(b => ({ id: b.id, bill_type: b.bill_type, amount: b.amount, due_date: b.due_date })),
    totals: { rent, water, electricity, total },
    date_range: dateRange
  };
}

export default buildTenantBillsPayload;
