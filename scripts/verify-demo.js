const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const bcrypt = require('../backend/node_modules/bcryptjs');
const { chromium } = require('playwright');
const db = require('../backend/config/sqlite');
const { SEED_KEY,readAccounts,summarize,snapshot,writePrivate } = require('../backend/scripts/demo-support');
const round=n=>Math.round(n*100)/100;

async function main() {
  const summary=summarize(db),accounts=readAccounts(),checks=[];
  function passed(message){checks.push(message);console.log('[verify:demo] PASS '+message);}
  assert.equal(db.get('PRAGMA integrity_check').integrity_check,'ok');
  assert.equal(db.all('PRAGMA foreign_key_check').length,0);
  assert.deepEqual(snapshot(db,true),JSON.parse(db.get('SELECT metadata_json FROM demo_seed_runs WHERE seed_key=?',[SEED_KEY]).metadata_json).preserved);
  passed('Integrity, foreign keys, and original non-demo record fingerprints');
  for(const account of accounts){const table=account.role==='manager'?'property_managers':'tenants';const row=db.get(`SELECT password FROM ${table} WHERE email=?`,[account.email]);assert.ok(row?.password.startsWith('$2'));assert.ok(bcrypt.compareSync(account.temporary_password,row.password));}
  assert.equal(new Set(accounts.map(a=>a.temporary_password)).size,16);
  passed('All 16 demo passwords are unique, hashed, and match the private manifest');
  const demoTenants=db.all("SELECT t.* FROM tenants t JOIN demo_seed_records d ON d.record_id=t.id AND d.table_name='tenants' AND d.seed_key=?",[SEED_KEY]);
  assert.equal(demoTenants.length,15);
  assert.equal(db.get("SELECT COUNT(*) AS n FROM (SELECT apartment_id FROM tenants WHERE status='active' AND apartment_id IS NOT NULL GROUP BY apartment_id HAVING COUNT(*)>1)").n,0);
  for(const tenant of demoTenants){const apartment=db.get('SELECT * FROM apartments WHERE id=?',[tenant.apartment_id]);assert.equal(apartment.status,'occupied');const history=db.all('SELECT * FROM bills WHERE tenant_id=?',[tenant.id]);assert.equal(history.length,18);assert.equal(new Set(history.map(b=>b.bill_type+':'+b.due_date.slice(0,7))).size,18);for(const bill of history){assert.ok(tenant.move_in_date<=bill.created_at.slice(0,10));if(bill.bill_type==='rent')assert.equal(bill.amount,apartment.rent_amount);const payment=db.get('SELECT * FROM payment_history WHERE bill_id=?',[bill.id]);assert.equal(bill.status,payment?'paid':'pending');if(payment){assert.equal(payment.amount_paid,bill.amount);assert.equal(payment.payment_type,bill.bill_type==='rent'?'RENT':'UTILITY');assert.ok(payment.paid_at.slice(0,10)>=bill.created_at.slice(0,10));assert.ok(payment.paid_at.slice(0,10)<=summary.as_of);}}}
  passed('Occupancy, all 270 bills, unique periods, move-in dates, full payments, and balances');
  const meters=db.all("SELECT m.* FROM meter_devices m JOIN demo_seed_records d ON d.record_id=m.id AND d.table_name='meter_devices' AND d.seed_key=?",[SEED_KEY]);
  for(const meter of meters){const history=db.all('SELECT * FROM meter_history WHERE device_id=? ORDER BY recorded_at',[meter.device_id]);assert.equal(history.length,6);let previous=history[0].previous_reading;const tenant=demoTenants.find(t=>t.apartment_id===meter.apartment_id);for(const row of history){assert.equal(row.previous_reading,previous);assert.ok(row.present_reading>=row.previous_reading);assert.equal(row.consumption,row.present_reading-row.previous_reading);assert.equal(row.total_cost,round(row.consumption*row.rate));assert.equal(row.rate,meter.rate);const bill=db.get('SELECT * FROM bills WHERE tenant_id=? AND bill_type=? AND substr(due_date,1,7)=?',[tenant.id,meter.meter_type.startsWith('electricity')?'electricity':'water',row.recorded_at.slice(0,7)]);assert.equal(bill.amount,row.total_cost);assert.ok(row.recorded_at.slice(0,10)<=summary.as_of);previous=row.present_reading;}assert.equal(meter.present_reading,previous);assert.equal(meter.current_reading,previous);assert.equal(meter.previous_reading,history.at(-1).previous_reading);}
  passed('All 30 meters and 180 increasing readings reconcile to their utility bills');
  async function api(method,route,body,token,expected=200){const response=await fetch('http://localhost:5001'+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(response.status,expected,`${method} ${route}: HTTP ${response.status}`);const value=await response.json();assert.ok(!JSON.stringify(value).includes('"password"'));return value;}
  const manager=accounts.find(a=>a.role==='manager');
  const managerSession=await api('POST',manager.login_route,{email:manager.email,password:manager.temporary_password});
  assert.equal((await api('GET','/api/health')).engine,'sqlite');
  const apis=await Promise.all(['/api/apartments','/api/tenants','/api/bills','/api/payment-history','/api/meter-devices','/api/meter-devices/meter-history?limit=1000'].map(route=>api('GET',route,undefined,managerSession.token)));
  ['apartments','tenants','bills','payment_history','meter_devices','meter_history'].forEach((table,i)=>assert.equal(apis[i].length,db.get('SELECT COUNT(*) AS n FROM '+table).n));
  for(const index of [1,7,15]){const account=accounts[index];const login=await api('POST',account.login_route,{email:account.email,password:account.temporary_password});const bills=await api('GET','/api/bills?tenantId=999999',undefined,login.token);assert.equal(bills.length,18);assert.ok(bills.every(b=>b.tenant_id===login.user.id));await api('GET','/api/tenants',undefined,login.token,403);}
  passed('Live manager login, three tenant logins, tenant isolation, and API/DB record counts');
  const params=`?startDate=${summary.period_start}&endDate=${summary.as_of.slice(0,7)}-28`;
  const report=await api('GET','/api/reports/overview'+params,undefined,managerSession.token);
  assert.equal(round(report.summary.rent_collected),summary.finances.rent_paid);
  assert.equal(round(report.summary.utility_collected),summary.finances.utility_paid);
  assert.equal(round(report.summary.rent_due+report.summary.utility_due),summary.finances.outstanding);
  assert.equal(report.summary.occupancy_rate,75);
  assert.equal(report.summary.late_payment_count,summary.counts.overdue_bills);
  assert.equal(report.detailed_table.length,270);
  const totalMonth=report.graphs.monthly_totals.reduce((s,r)=>s+r.rent_collected+r.utility_collected,0);assert.equal(round(totalMonth),summary.finances.paid);
  const issued=await api('POST','/api/qr-codes/create-tenant-token',{tenant_id:demoTenants[0].id},managerSession.token);
  assert.ok(issued.qr_url.startsWith('data:image/png;base64,'));
  assert.equal((await api('POST','/api/qr-codes/scan',{qr_data:issued.token},managerSession.token)).tenant.id,demoTenants[0].id);
  assert.equal((await api('POST','/api/qr-sessions',{qr_data:issued.token})).user.id,demoTenants[0].id);
  const deviceQR=await api('POST','/api/qr-codes/generate',{device_id:meters[0].device_id},managerSession.token);
  assert.equal((await api('POST','/api/qr-codes/scan',{qr_data:deviceQR.qr_data},managerSession.token)).device.id,meters[0].id);
  passed('Six-month report totals and legitimate signed tenant/device QR workflows');
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:3000/property-manager-login');
    await page.locator('input[type=email]').fill(manager.email);await page.locator('input[type=password]').fill(manager.temporary_password);await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForURL('**/property-manager-dashboard');await page.waitForLoadState('networkidle');
    // Compare actual dashboard values, not only whether its route loaded.
    const dashboard=await page.locator('body').innerText();
    for(const amount of [summary.finances.rent_paid,summary.finances.utility_paid,summary.finances.paid])assert.ok(dashboard.includes(amount.toLocaleString('en-US'))||dashboard.includes(amount.toLocaleString('en-US',{minimumFractionDigits:2})),`Dashboard missing expected collection amount ${amount}`);
    for(const route of ['tenant-management','apartment-management','bill-management','meter-device-management','qr-code-generator','reports']){await page.goto('http://localhost:3000/'+route);await page.waitForLoadState('networkidle');assert.equal(new URL(page.url()).pathname,'/'+route);if(route==='apartment-management')await page.getByText('DEMO-101 (Studio)',{exact:true}).first().waitFor();if(route==='tenant-management')await page.getByText('Demo Alya Mercado',{exact:true}).first().waitFor();}
    for(const index of [1,7,15]){const account=accounts[index];await page.goto('http://localhost:3000/tenant-login');await page.locator('input[type=email]').fill(account.email);await page.locator('input[type=password]').fill(account.temporary_password);await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForURL('**/tenant-dashboard');await page.getByRole('heading',{name:'Tenant Dashboard',exact:true}).waitFor();await page.waitForLoadState('networkidle');assert.ok((await page.locator('body').innerText()).includes(account.display_name));}
    assert.equal(errors.length,0,'Browser runtime errors: '+errors.join('; '));
    passed('Actual manager/dashboard collection values, populated pages, and three tenant browser sessions');
  }finally{if(browser)await browser.close();}
  writePrivate(path.join(path.dirname(db.databasePath),'demo','verification.local.json'),JSON.stringify({fictional:true,checked_at:new Date().toISOString(),checks,counts:summary.counts,finances:summary.finances},null,2));
  console.log('[verify:demo] SUCCESS. No business records were modified during verification.');
}
main().catch(error=>{console.error('[verify:demo] FAILED: '+error.message);process.exitCode=1;}).finally(()=>db.close());
