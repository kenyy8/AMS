module.exports = (app,{db,bills,paymentType,date}) => {
  function report(req) {
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth()-5,1);
    const from=req.query.startDate?date(req.query.startDate,'startDate'):start.toISOString().slice(0,10),to=req.query.endDate?date(req.query.endDate,'endDate'):now.toISOString().slice(0,10);
    const tenant=req.query.tenantId?Number(req.query.tenantId):null;
    const paid=db.all(`SELECT ph.id AS payment_history_id,b.id AS bill_id,b.tenant_id,ph.payment_type,b.bill_type,ph.amount_paid AS amount,'paid' AS status,ph.paid_at AS date,t.name AS tenant_name FROM payment_history ph JOIN bills b ON b.id=ph.bill_id JOIN tenants t ON t.id=b.tenant_id WHERE date(ph.paid_at) BETWEEN ? AND ? AND (? IS NULL OR b.tenant_id=?)`,[from,to,tenant,tenant]);
    const pending=bills(tenant).filter(b=>b.status!=='paid' && b.due_date>=from && b.due_date<=to).map(b=>({payment_history_id:null,bill_id:b.id,tenant_id:b.tenant_id,payment_type:paymentType(b),bill_type:b.bill_type,amount:b.amount,status:b.status,date:b.due_date,tenant_name:b.tenant_name}));
    const details=[...paid,...pending].sort((a,b)=>b.date.localeCompare(a.date));
    const sum=(rows,type)=>Math.round(rows.filter(r=>r.payment_type===type).reduce((n,r)=>n+r.amount,0)*100)/100;
    const rooms=db.get('SELECT COUNT(*) AS n FROM apartments').n,occupied=db.get("SELECT COUNT(DISTINCT apartment_id) AS n FROM tenants WHERE status='active' AND apartment_id IS NOT NULL AND (move_in_date IS NULL OR date(move_in_date)<=?)",[to]).n;
    const monthly=new Map(),types=new Map(),statuses=new Map();
    for(const r of details){types.set(r.bill_type,(types.get(r.bill_type)||0)+r.amount);const status=r.status==='paid'?'paid':'pending';statuses.set(status,(statuses.get(status)||0)+r.amount);}
    for(const r of paid){const month=r.date.slice(0,7);const item=monthly.get(month)||{month,rent_collected:0,utility_collected:0};item[r.payment_type==='UTILITY'?'utility_collected':'rent_collected']+=r.amount;monthly.set(month,item);}
    return {summary:{rent_collected:sum(paid,'RENT'),utility_collected:sum(paid,'UTILITY'),rent_due:sum(pending,'RENT'),utility_due:sum(pending,'UTILITY'),occupancy_rate:rooms?Math.round(occupied/rooms*10000)/100:0,late_payment_count:pending.filter(b=>b.date<now.toISOString().slice(0,10)).length},graphs:{monthly_totals:[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month)),status_breakdown:[...statuses].map(([status,total])=>({status,total})),bill_type_breakdown:[...types].map(([bill_type,total])=>({bill_type,total}))},detailed_table:details};
  }
  app.get('/api/reports/overview',(req,res)=>res.json(report(req)));
  app.get('/api/reports/bills',(req,res)=>res.json(report(req).detailed_table.map(row=>({...row,due_date:row.date}))));
  app.get('/api/reports/by-type',(req,res)=>res.json(report(req).graphs.bill_type_breakdown.map(row=>({type:row.bill_type,total:row.total}))));
};
