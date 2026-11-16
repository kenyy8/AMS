const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert/strict');
const crypto = require('crypto');
const killTree = require('tree-kill');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function unused(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Port ${port} is already in use. Stop AMS before this isolated browser test.`)); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
  });
}
async function main() {
  await unused(3000); await unused(5001);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-browser-test-'));
  const database = path.join(directory, 'browser.db');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Use npm run test:browser.');
  const child = spawn(process.execPath, [npmCli, 'run', 'dev'], { cwd: root, env: { ...process.env, SQLITE_PATH: database, BROWSER: 'none', CI: 'true' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '', browser;
  child.stdout.on('data', value => { output = (output + value).slice(-10000); });
  child.stderr.on('data', value => { output = (output + value).slice(-10000); });
  try {
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Launcher exited before readiness: ' + output);
      try {
        const [front, back] = await Promise.all([fetch('http://localhost:3000'), fetch('http://localhost:5001/api/health')]);
        if (front.ok && back.ok && (await back.json()).engine === 'sqlite') { ready = true; break; }
      } catch (_) {}
      await delay(250);
    }
    if (!ready) throw new Error('Readiness timed out: ' + output);
    console.log('[browser] Root npm run dev started both services with an isolated SQLite database.');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto('http://localhost:3000');
    await page.getByRole('heading', { name: 'Smart ID Apartment Monitoring System' }).waitFor();
    await page.getByRole('button', { name: 'Manager Login', exact: true }).click();
    await page.getByRole('heading', { name: 'Set Up Your Property Manager' }).waitFor();
    const password = crypto.randomBytes(18).toString('hex');
    await page.locator('.pm-input').nth(0).fill('Browser Test Manager');
    await page.locator('input[type=email]').fill('browser-manager@example.test');
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.waitForURL('**/property-manager-dashboard');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    assert.ok(token, 'Browser registration should establish a session');
    console.log('[browser] First-run manager registration and frontend/API communication passed.');
    async function api(route, body) {
      const response = await fetch('http://localhost:5001' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      assert.ok(response.ok, `${route} failed with ${response.status}`); return response.json();
    }
    const apartment = await api('/api/apartments', { apartment_number: 'BROWSER-101', rent_amount: 1500 });
    const tenant = await api('/api/tenants', { name: 'Browser Test Tenant', email: 'browser-tenant@example.test', password, apartment_id: apartment.id });
    await api('/api/bills', { tenant_id: tenant.id, bill_type: 'rent', amount: 1500, due_date: '2026-12-20' });
    const meter = await api('/api/meter-devices', { apartment_id: apartment.id, meter_type: 'electricity_meter', present_reading: 10 });
    for (const route of ['tenant-management', 'apartment-management', 'bill-management', 'meter-device-management', 'qr-code-generator', 'reports']) {
      await page.goto('http://localhost:3000/' + route);
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).pathname, '/' + route);
    }
    console.log('[browser] Manager tenant, apartment, billing, meter, QR, and reports pages loaded without runtime errors.');
    await page.goto('http://localhost:3000/reports');
    await page.waitForLoadState('networkidle');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const pdf = await downloaded;
    assert.ok(pdf.suggestedFilename().endsWith('.pdf'));
    console.log('[browser] PDF report export passed after the jsPDF security upgrade.');
    await page.goto('http://localhost:3000/tenant-login');
    await page.locator('input[type=email]').fill('browser-tenant@example.test');
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await page.waitForURL('**/tenant-dashboard');
    await page.getByRole('heading', { name: 'Tenant Dashboard', exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    console.log('[browser] Tenant login and dashboard loaded.');
    const { io } = require(require.resolve('socket.io-client', { paths: [path.join(root, 'frontend')] }));
    const tenantToken = await page.evaluate(() => localStorage.getItem('token'));
    const socket = io('http://localhost:5001', { auth: { token: tenantToken }, reconnection: false });
    try {
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('Socket connection timeout')), 5000).unref(); });
      socket.emit('join-apartment', apartment.id);
      await delay(100);
      const update = new Promise((resolve, reject) => { socket.once('meter-update', resolve); setTimeout(() => reject(new Error('Meter update timeout')), 5000).unref(); });
      await api('/api/meter-devices/reading', { deviceId: meter.device_id, reading: 12 });
      assert.equal((await update).present_reading, 12);
      console.log('[browser] Authenticated Socket.IO meter update passed.');
    } finally { socket.close(); }
    assert.equal(runtimeErrors.length, 0, 'Browser runtime errors: ' + runtimeErrors.join('; '));
    console.log('[browser] PASS. Test records stayed in a temporary database; backend/data/ams.db was untouched.');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) await new Promise((resolve, reject) => killTree(child.pid, 'SIGTERM', error => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error('[browser] ' + error.message); process.exitCode = 1; });
