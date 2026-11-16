const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const SEED_KEY = 'ams-amihan-fictional-demo-v1';
const root = path.resolve(__dirname, '../..');
const manifestPath = path.resolve(process.env.DEMO_MANIFEST_PATH || path.join(root, 'demo-accounts.local.csv'));
const businessTables = ['property_managers','apartments','tenants','bills','payment_history','meter_devices','meter_history','settings','notifications'];
let privateSids;

function protect(file) {
  if (process.platform !== 'win32') return fs.chmodSync(file, 0o600);
  if (!privateSids) {
    const identity = spawnSync('whoami', ['/user','/fo','csv','/nh'], { encoding: 'utf8', windowsHide: true });
    const owner = spawnSync('powershell.exe', ['-NoProfile','-Command','(Get-Acl -LiteralPath $env:AMS_DEMO_WORKSPACE).GetOwner([System.Security.Principal.SecurityIdentifier]).Value'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, AMS_DEMO_WORKSPACE: root } });
    const callerSid = identity.stdout?.match(/S-1-[\d-]+/)?.[0], ownerSid = owner.stdout?.match(/S-1-[\d-]+/)?.[0];
    if (!callerSid || !ownerSid) throw new Error('Cannot identify the caller and workspace owner for private demo files.');
    privateSids = [...new Set([callerSid, ownerSid, 'S-1-5-18'])];
  }
  const acl = spawnSync('icacls', [file, '/inheritance:r', '/grant:r', ...privateSids.map(sid=>`*${sid}:(F)`)], { encoding: 'utf8', windowsHide: true });
  if (acl.status !== 0) throw new Error('Cannot restrict the private demo file ACL. No passwords were written to it.');
}
function writePrivate(file, content, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exclusive) fs.closeSync(fs.openSync(file, 'wx', 0o600));
  else if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, 'wx', 0o600));
  protect(file);
  fs.writeFileSync(file, content, { mode: 0o600 });
}
function csv(accounts) {
  const headers = ['role','display_name','email','temporary_password','unit','login_page','login_route','dataset'];
  return '\uFEFF' + [headers,...accounts.map(a => headers.map(k => a[k] || ''))].map(row => row.map(v => '"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
}
function readAccounts(file = manifestPath) {
  const lines = fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const parse = line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""','"'));
  const headers = parse(lines.shift());
  return lines.map(line => Object.fromEntries(parse(line).map((v,i) => [headers[i],v])));
}
function snapshot(db, excludeDemo = false) {
  const tracked = excludeDemo ? db.all('SELECT table_name,record_id FROM demo_seed_records WHERE seed_key=?',[SEED_KEY]) : [];
  return Object.fromEntries(businessTables.map(table => {
    const owned = new Set(tracked.filter(r => r.table_name===table).map(r => r.record_id));
    const rows = db.all(`SELECT * FROM ${table} ORDER BY id`).filter(row => !owned.has(row.id));
    return [table,{count:rows.length,digest:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];
  }));
}
function summarize(db) {
  const run = db.get('SELECT * FROM demo_seed_runs WHERE seed_key=?',[SEED_KEY]);
  if (!run) throw new Error('The demo dataset has not been seeded.');
  const owned = table => db.all(`SELECT t.* FROM ${table} t JOIN demo_seed_records d ON d.record_id=t.id AND d.table_name=? AND d.seed_key=? ORDER BY t.id`,[table,SEED_KEY]);
  const bills=owned('bills'),payments=owned('payment_history'),apts=owned('apartments'),tenants=owned('tenants');
  const paid=new Map(payments.map(p=>[p.bill_id,p]));
  const pending=bills.filter(b=>!paid.has(b.id));
  const total=rows=>Math.round(rows.reduce((s,r)=>s+Number(r.amount),0)*100)/100;
  const sum=rows=>Math.round(rows.reduce((s,r)=>s+Number(r.amount_paid),0)*100)/100;
  const overdue=pending.filter(b=>b.due_date<run.as_of),future=pending.filter(b=>b.due_date>=run.as_of);
  return {fictional:true,seed_key:SEED_KEY,as_of:run.as_of,...JSON.parse(run.metadata_json).property,
    counts:{apartments:apts.length,occupied:apts.filter(a=>a.status==='occupied').length,vacant:apts.filter(a=>a.status==='available').length,tenants:tenants.length,managers:owned('property_managers').length,rent_bills:bills.filter(b=>b.bill_type==='rent').length,utility_bills:bills.filter(b=>b.bill_type!=='rent').length,meters:owned('meter_devices').length,meter_readings:owned('meter_history').length,payments:payments.length,paid_bills:paid.size,partial_bills:0,outstanding_bills:pending.length,overdue_bills:overdue.length,not_yet_due_bills:future.length},
    finances:{billed:total(bills),rent_billed:total(bills.filter(b=>b.bill_type==='rent')),utility_billed:total(bills.filter(b=>b.bill_type!=='rent')),paid:sum(payments),rent_paid:sum(payments.filter(p=>p.payment_type==='RENT')),utility_paid:sum(payments.filter(p=>p.payment_type==='UTILITY')),outstanding:total(pending),overdue:total(overdue),not_yet_due:total(future)},
    accounts:tenants.map(t=>({name:t.name,email:t.email,tenant_id:t.tenant_id,unit:apts.find(a=>a.id===t.apartment_id)?.apartment_number})),units:apts.map(a=>({unit:a.apartment_number,floor:a.floor,rent:a.rent_amount,status:a.status})),manifest:manifestPath};
}
module.exports = { SEED_KEY,root,manifestPath,businessTables,writePrivate,protect,csv,readAccounts,snapshot,summarize };
