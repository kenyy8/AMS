// Authorized, non-destructive verification of the actual public instance.
// Credentials stay in the ignored local manifest; no token/password is printed.
const assert=require('assert/strict');
const path=require('path');
const {chromium}=require('playwright');
const {root,readAccounts,writePrivate}=require('../backend/scripts/demo-support');
const origin=new URL(process.env.AMS_VERIFY_ORIGIN||'https://ams-qjjx.onrender.com').origin;
if(!origin.startsWith('https://'))throw new Error('Hosted verification requires HTTPS.');
const profiles=readAccounts(path.join(root,'render-demo-accounts.local.csv'));
const manager=profiles.find(a=>a.email==='admin@ams.test'),tenant=profiles.find(a=>a.email==='tenant@ams.test');
const checks=[];
function pass(value){checks.push(value);console.log('[hosted] PASS '+value);}
async function api(method,route,body,token,status=200){
  const response=await fetch(origin+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
  assert.equal(response.status,status,method+' '+route+': unexpected HTTP status');
  const data=await response.json();assert.ok(!JSON.stringify(data).includes('"password"'),'Sensitive response field');return data;
}
async function main(){
  assert.ok(manager&&tenant,'Regenerate the preferred hosted manifest with npm run render:accounts.');
  assert.deepEqual(await api('GET','/api/health'),{status:'ok'});
  const m=await api('POST',manager.login_route,{email:manager.email,password:manager.temporary_password});
  const t=await api('POST',tenant.login_route,{email:tenant.email,password:tenant.temporary_password});
  assert.equal(m.user.role,'manager');assert.equal(t.user.role,'tenant');assert.ok(t.user.apartment_id);
  pass('Preferred manager and tenant authenticate on the actual HTTPS instance');
  for(const account of [manager,tenant])await api('POST',account.login_route,{email:account.email,password:'invalid-verification-password'},undefined,401);
  await api('GET','/api/tenants',undefined,undefined,401);
  for(const route of ['/api/tenants','/api/apartments','/api/reports/overview'])await api('GET',route,undefined,t.token,403);
  const units=await api('GET','/api/apartments',undefined,m.token),tenants=await api('GET','/api/tenants',undefined,m.token);
  const assigned=units.find(a=>a.id===t.user.apartment_id);assert.ok(assigned);assert.equal(assigned.status,'occupied');
  const other=tenants.find(a=>a.id!==t.user.id);assert.ok(other);
  await api('GET','/api/tenants/'+other.id,undefined,t.token,403);
  await api('GET','/api/qr-tokens/'+other.id,undefined,t.token,403);
  const bills=await api('GET','/api/bills?tenantId='+other.id,undefined,t.token);
  const payments=await api('GET','/api/payment-history?tenantId='+other.id,undefined,t.token);
  assert.ok(bills.length>0&&payments.length>0);assert.ok([...bills,...payments].every(b=>b.tenant_id===t.user.id));
  pass('Invalid credentials, role restrictions, own apartment, bills/payment history, and cross-tenant isolation');
  const issued=await api('POST','/api/qr-codes/create-tenant-token',{tenant_id:t.user.id},m.token);
  assert.equal((await api('POST','/api/qr-sessions',{qr_data:issued.token})).user.id,t.user.id);
  await api('POST','/api/qr-sessions',{qr_data:'invalid-verification-qr'},undefined,401);
  pass('Legitimate signed tenant QR authentication and invalid QR rejection');
  const allBills=await api('GET','/api/bills',undefined,m.token),allPayments=await api('GET','/api/payment-history',undefined,m.token);
  const report=await api('GET','/api/reports/overview?startDate=2000-01-01&endDate=2100-01-01',undefined,m.token);
  const round=n=>Math.round(n*100)/100;
  assert.equal(round(report.summary.rent_collected+report.summary.utility_collected),round(allPayments.reduce((n,p)=>n+p.amount_paid,0)));
  assert.equal(round(report.summary.rent_due+report.summary.utility_due),round(allBills.filter(b=>b.status!=='paid').reduce((n,b)=>n+b.amount,0)));
  pass('Hosted financial report totals reconcile with authenticated bills and payments');
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.name));
    async function clean(){assert.doesNotMatch(await page.locator('body').innerText(),/DEMO SYSTEM|Fictional Data|Class demonstration|Changes are temporary|\bDEMO-|\bDemo /i);}
    for(const [profile,dashboard] of [[manager,'property-manager-dashboard'],[tenant,'tenant-dashboard']]){
      await page.goto(origin+new URL(profile.login_page,origin).pathname);await clean();
      await page.locator('input[type=email]').fill(profile.email);await page.locator('input[type=password]').fill(profile.temporary_password);
      await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForURL('**/'+dashboard);await page.waitForLoadState('networkidle');await clean();
      if(profile===tenant){
        // The existing dashboard labels apartments by database ID; the unit number
        // and occupancy relationship were independently checked through the API.
        const body=await page.locator('body').innerText();
        assert.ok(body.includes(t.user.name));
        assert.ok(new RegExp('Apartment:\\s*'+t.user.apartment_id+'\\b').test(body));
      }
    }
    assert.equal(errors.length,0,'Browser runtime errors');pass('Actual hosted manager and tenant dashboards render without demo banners or labels');
  }finally{if(browser)await browser.close();}
  const result={origin,checked_at:new Date().toISOString(),checks,counts:{apartments:units.length,tenants:tenants.length,bills:allBills.length,payments:allPayments.length},limitations:['Remote restart not triggered; restart stability is covered by isolated production tests.']};
  writePrivate(path.join(root,'backend/data/hosted-verification.local.json'),JSON.stringify(result,null,2)+'\n');
  console.log('[hosted] SUCCESS. No business records changed. Private result: backend/data/hosted-verification.local.json');
}
main().catch(error=>{let message=error.message;for(const p of profiles)message=message.replaceAll(p.temporary_password,'[redacted]');console.error('[hosted] FAILED: '+message);process.exitCode=1;});
