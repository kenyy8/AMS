const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const net=require('net');
const assert=require('assert/strict');
const {spawn,spawnSync}=require('child_process');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('playwright');
const killTree=require('tree-kill');
const {accounts}=require('../backend/services/demoAccounts');
const jwt=require('../backend/node_modules/jsonwebtoken');
const root=path.resolve(__dirname,'..');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ams-production-test-'));
const secrets=Object.fromEntries(['JWT_SECRET','QR_SECRET','DEMO_PASSWORD_SEED'].map(k=>[k,crypto.randomBytes(48).toString('base64url')]));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){return new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const result=server.address().port;server.close(()=>resolve(result));});});}
async function stop(child){if(child && child.exitCode===null)await new Promise((resolve,reject)=>killTree(child.pid,'SIGTERM',error=>error?reject(error):resolve()));}
async function instance(name,overrides={}){
  const p=await port(),origin='http://127.0.0.1:'+p;
  const env={...process.env,...secrets,NODE_ENV:'production',HOSTED_DEMO:'true',PORT:String(p),APP_ORIGIN:origin,SQLITE_PATH:path.join(directory,name,'ams.db')};
  delete env.RENDER;delete env.RENDER_EXTERNAL_URL;delete env.DEMO_MANIFEST_PATH;
  delete env.HOSTED_MANAGER_PASSWORD;delete env.HOSTED_TENANT_PASSWORD;
  Object.assign(env,overrides);
  const child=spawn(process.execPath,['--max-old-space-size=256',path.join(root,'scripts/start-production.js')],{cwd:os.tmpdir(),env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',s=>{logs=(logs+s).slice(-8000);});
  const end=Date.now()+60000;
    while(Date.now()<end){if(child.exitCode!==null)throw new Error('Production startup failed: '+logs);try{if((await fetch(origin+'/api/health')).ok)return{child,env,origin,profiles:accounts({passwordSeed:secrets.DEMO_PASSWORD_SEED,origin,hosted:true})};}catch(_){}await delay(200);}
  await stop(child);throw new Error('Production startup timed out: '+logs);
}
async function main(){
  const first=await instance('first');let browser,second,proxy;
  async function request(method,route,body,token,status=200,headers={}){
    const r=await fetch(first.origin+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    assert.equal(r.status,status,`${method} ${route} returned ${r.status}`);
    const data=await r.json();assert.ok(!JSON.stringify(data).includes('"password"'));return data;
  }
  try{
    const read=new DatabaseSync(first.env.SQLITE_PATH,{readOnly:true});
    assert.equal(read.prepare('SELECT COUNT(*) AS n FROM property_managers').get().n,1);
    assert.equal(read.prepare('SELECT COUNT(*) AS n FROM apartments').get().n,20);
    assert.equal(read.prepare('SELECT COUNT(*) AS n FROM tenants').get().n,15);
    assert.equal(read.prepare('SELECT COUNT(*) AS n FROM bills').get().n,270);
    assert.equal(read.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(read.prepare('PRAGMA foreign_key_check').all().length,0);
    console.log('[production-test] Fresh hosted seed: 20 units, 15 tenants, 270 bills, integrity and foreign keys passed.');
    const manager=first.profiles[0],tenant=first.profiles[1];
    assert.equal(manager.email,'admin@ams.test');assert.equal(tenant.email,'tenant@ams.test');
    assert.equal(read.prepare("SELECT COUNT(*) AS n FROM apartments WHERE apartment_number LIKE 'DEMO-%' OR building LIKE 'DEMO %'").get().n,0);
    const m=await request('POST',manager.login_route,{email:manager.email,password:manager.temporary_password});
    const t=await request('POST',tenant.login_route,{email:tenant.email,password:tenant.temporary_password});
    assert.equal(m.user.role,'manager');assert.equal(t.user.role,'tenant');assert.ok(t.user.apartment_id);
    await request('POST',manager.login_route,{email:manager.email,password:'invalid-test-password'},undefined,401);
    await request('POST',tenant.login_route,{email:tenant.email,password:'invalid-test-password'},undefined,401);
    await request('GET','/api/tenants',undefined,undefined,401);
    for(const route of ['/api/tenants','/api/apartments','/api/reports/overview','/api/meter-devices/settings/rates','/api/qr-tokens/1'])await request('GET',route,undefined,t.token,403);
    for(const [method,route,body]of [['POST','/api/bills/pay',{bill_ids:[1]}],['PUT','/api/apartments/1',{rent_amount:1}],['DELETE','/api/tenants/1',undefined]])await request(method,route,body,t.token,403);
    const own=await request('GET','/api/bills?tenantId=99999',undefined,t.token);assert.equal(own.length,18);assert.ok(own.every(b=>b.tenant_id===t.user.id));
    const history=await request('GET','/api/payment-history?tenantId=99999',undefined,t.token);assert.ok(history.length>0);assert.ok(history.every(p=>p.tenant_id===t.user.id));
    const forged=jwt.sign({id:999999,role:'manager'},secrets.JWT_SECRET,{expiresIn:'1h'});await request('GET','/api/tenants',undefined,forged,401);
    await request('POST',manager.login_route,{email:manager.email,password:manager.temporary_password},undefined,403,{Origin:'https://untrusted.invalid'});
    for(const route of ['/api/test','/api/setup/status','/api/setup/manager'])await request(route.endsWith('manager')?'POST':'GET',route,route.endsWith('manager')?{}:undefined,undefined,404);
    await request('GET','/api/unknown',undefined,m.token,404);
    const health=await fetch(first.origin+'/api/health');assert.deepEqual(await health.json(),{status:'ok'});assert.ok(health.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal(health.headers.get('x-powered-by'),null);
    console.log('[production-test] Public signup/debug disabled; roles, tenant scope, account validation, origin checks, and security headers passed.');
    const malformed=await fetch(first.origin+'/api/property-managers/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"password":"DEMO-CANARY-INVALID'});assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{message:'Invalid JSON request body'});
    for(const route of ['/demo-accounts.local.csv','/render-demo-accounts.local.csv','/backend/data/ams.db','/.env','/backend/.env','/.git/config','/render.yaml','/package.json','/static/js/missing.js'])assert.equal((await fetch(first.origin+route)).status,404,route);
    const html=await fetch(first.origin+'/reports',{headers:{Accept:'text/html'}});assert.equal(html.status,200);assert.ok((await html.text()).includes('<div id="root"></div>'));
    const secretValues=Object.values(secrets);function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())scan(target);else{assert.ok(!target.endsWith('.map'));if(/\.(js|html|json|css)$/.test(entry.name)){const value=fs.readFileSync(target,'utf8');for(const secret of secretValues)assert.ok(!value.includes(secret),'Secret in frontend artifact');}}}}scan(path.join(root,'frontend/build'));
    assert.ok(!fs.existsSync(path.join(directory,'first','demo-accounts.local.csv')));
    console.log('[production-test] SPA deep links, API JSON 404, private-file blocking, no source maps, and secret-free frontend artifacts passed.');
    browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[],wrongOrigin=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{const value=req.url();if(/^https?:/.test(value)&&new URL(value).origin!==first.origin)wrongOrigin.push(value);});
    async function noDemoLabels(){assert.doesNotMatch(await page.locator('body').innerText(),/DEMO SYSTEM|Fictional Data|Class demonstration|Changes are temporary|\bDEMO-|\bDemo /i);}
    await page.goto(first.origin+'/property-manager-login');await noDemoLabels();
    await page.locator('input[type=email]').fill(manager.email);await page.locator('input[type=password]').fill(manager.temporary_password);await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForURL('**/property-manager-dashboard');
    for(const route of ['tenant-management','apartment-management','bill-management','meter-device-management','qr-code-generator','reports']){await page.goto(first.origin+'/'+route);await page.waitForLoadState('networkidle');assert.equal(new URL(page.url()).pathname,'/'+route);await noDemoLabels();}
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export PDF',exact:true}).click();assert.ok((await download).suggestedFilename().endsWith('.pdf'));
    await page.goto(first.origin+'/tenant-login');await page.locator('input[type=email]').fill(tenant.email);await page.locator('input[type=password]').fill(tenant.temporary_password);await page.getByRole('button',{name:'Log In',exact:true}).click();await page.waitForURL('**/tenant-dashboard');await page.waitForLoadState('networkidle');
    await noDemoLabels();
    assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));assert.equal(wrongOrigin.length,0,'Requests left the one-service origin');
    console.log('[production-test] Compiled React: preferred account logins, populated pages without demo labels, PDF export, CSP, and same-origin requests passed.');
    await browser.close();browser=null;
    const issue=await request('POST','/api/qr-codes/create-tenant-token',{tenant_id:t.user.id},m.token);assert.equal((await request('POST','/api/qr-sessions',{qr_data:issue.token})).user.id,t.user.id);
    const {io}=require(require.resolve('socket.io-client',{paths:[path.join(root,'frontend')]}));
    const socket=io(first.origin,{auth:{token:t.token},reconnection:false});
    try{await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(new Error('Socket timeout')),5000).unref();});}finally{socket.close();}
    console.log('[production-test] Signed QR login and authenticated same-service Socket.IO passed.');
    await request('POST','/api/apartments',{apartment_number:'DEMO-EPHEMERAL-TEST',rent_amount:5000},m.token,201);
    const beforeHash=read.prepare('SELECT password FROM property_managers WHERE id=?').get(m.user.id).password;
    const repeat=spawnSync(process.execPath,[path.join(root,'backend/scripts/seed-demo.js')],{cwd:os.tmpdir(),env:first.env,encoding:'utf8',timeout:30000});assert.equal(repeat.status,0,repeat.stderr);assert.equal(read.prepare('SELECT COUNT(*) AS n FROM apartments').get().n,21);assert.equal(read.prepare('SELECT COUNT(*) AS n FROM bills').get().n,270);assert.equal(read.prepare('SELECT password FROM property_managers WHERE id=?').get(m.user.id).password,beforeHash);
    await stop(first.child);
    // Simulate upgrading the previous hosted account identities in this isolated fixture.
    const writer=new DatabaseSync(first.env.SQLITE_PATH);writer.prepare("UPDATE property_managers SET email='ams.demo.manager@example.com',password='unusable-old-fixture' WHERE id=?").run(m.user.id);writer.prepare("UPDATE tenants SET email='tenant01@example.com',password='unusable-old-fixture' WHERE id=?").run(t.user.id);writer.close();
    const repair=spawnSync(process.execPath,[path.join(root,'backend/scripts/seed-demo.js')],{cwd:os.tmpdir(),env:first.env,encoding:'utf8',timeout:30000});assert.equal(repair.status,0,repair.stderr);
    assert.equal(read.prepare('SELECT COUNT(*) AS n FROM property_managers').get().n,1);assert.equal(read.prepare('SELECT COUNT(*) AS n FROM tenants').get().n,15);
    const bcrypt=require('../backend/node_modules/bcryptjs');
    for(const [table,profile,id] of [['property_managers',manager,m.user.id],['tenants',tenant,t.user.id]]){const row=read.prepare('SELECT * FROM '+table+' WHERE id=?').get(id);assert.equal(row.email,profile.email);assert.ok(bcrypt.compareSync(profile.temporary_password,row.password));}
    const writer2=new DatabaseSync(first.env.SQLITE_PATH);writer2.prepare("UPDATE property_managers SET password='wrong-preferred-fixture' WHERE id=?").run(m.user.id);writer2.close();
    const repairPreferred=spawnSync(process.execPath,[path.join(root,'backend/scripts/seed-demo.js')],{cwd:os.tmpdir(),env:first.env,encoding:'utf8',timeout:30000});assert.equal(repairPreferred.status,0,repairPreferred.stderr);assert.ok(bcrypt.compareSync(manager.temporary_password,read.prepare('SELECT password FROM property_managers WHERE id=?').get(m.user.id).password));assert.equal(read.prepare('SELECT COUNT(*) AS n FROM payment_history').get().n,224);read.close();
    console.log('[production-test] Legacy hosted identities upgraded in place, preferred credentials repaired, and account IDs/billing history preserved without duplicates.');
    second=await instance('fresh-ephemeral-filesystem');
    const response=await fetch(second.origin+manager.login_route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:manager.email,password:manager.temporary_password})});assert.equal(response.status,200);
    const tenantRestart=await fetch(second.origin+tenant.login_route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:tenant.email,password:tenant.temporary_password})});assert.equal(tenantRestart.status,200);
    const fresh=new DatabaseSync(second.env.SQLITE_PATH,{readOnly:true});assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM apartments').get().n,20);assert.equal(fresh.prepare("SELECT COUNT(*) AS n FROM apartments WHERE apartment_number='DEMO-EPHEMERAL-TEST'").get().n,0);fresh.close();
    console.log('[production-test] Repeated initialization adds no duplicates; a fresh filesystem restores the demo with stable credentials and discards temporary edits.');
    const unsafe={...first.env,SQLITE_PATH:path.join(root,'backend/data/ams.db')};const failure=spawnSync(process.execPath,[path.join(root,'scripts/start-production.js')],{env:unsafe,encoding:'utf8',timeout:10000});assert.notEqual(failure.status,0);assert.ok(failure.stderr.includes('temporary'));
    const absent={...first.env,JWT_SECRET:''};const missing=spawnSync(process.execPath,[path.join(root,'scripts/start-production.js')],{env:absent,encoding:'utf8',timeout:10000});assert.notEqual(missing.status,0);
    console.log('[production-test] Unsafe local DB targets and missing environment secrets fail closed. PASS (local simulation; no public deployment).');
    proxy=await instance('render-proxy',{RENDER:'true',APP_ORIGIN:'https://demo-class.example.invalid'});
    const redirect=await fetch(proxy.origin+'/reports',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://demo-class.example.invalid/reports');
    const forwarded=await fetch(proxy.origin+'/reports',{headers:{'X-Forwarded-Proto':'https',Accept:'text/html'}});assert.equal(forwarded.status,200);assert.ok(forwarded.headers.get('strict-transport-security'));assert.ok(forwarded.headers.get('content-security-policy').includes('upgrade-insecure-requests'));
    console.log('[production-test] Render proxy HTTPS redirect and forwarded-HTTPS security headers passed (proxy simulation).');
  }finally{if(browser)await browser.close();await stop(first.child);if(second)await stop(second.child);if(proxy)await stop(proxy.child);}
}
main().catch(error=>{console.error('[production-test] FAILED: '+error.message);process.exitCode=1;});
