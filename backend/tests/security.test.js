const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');
const { DatabaseSync } = require('node:sqlite');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-api-test-'));
process.env.SQLITE_PATH = path.join(directory, 'isolated.db');
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.QR_SECRET = crypto.randomBytes(48).toString('hex');
const db = require('../config/sqlite');
const { createApp } = require('../app');
const { redact } = require('../middleware/security');

test('SQLite API workflows use isolated data and enforce security and transactions', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const password = crypto.randomBytes(18).toString('hex');
  let manager, tenant, apartment, otherApartment, firstTenant, secondTenant, bill, meter, qr;
  async function request(method, route, body, token, expected = 200) {
    const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: expected HTTP ${expected}, received ${response.status}`);
    assert.ok(!JSON.stringify(data).includes('"password"'), 'Password fields must not be returned');
    return data;
  }
  try {
    await t.test('health, first-run setup, and password hashing', async () => {
      assert.equal((await request('GET', '/api/health')).engine, 'sqlite');
      assert.equal((await request('GET', '/api/setup/status')).needs_setup, true);
      const result = await request('POST', '/api/setup/manager', { name: 'Isolated Manager', email: 'manager@example.test', password }, null, 201);
      manager = result.token;
      assert.ok(db.get('SELECT password FROM property_managers').password.startsWith('$2'));
      await request('POST', '/api/setup/manager', { name: 'Duplicate', email: 'other@example.test', password }, null, 409);
      assert.equal((await request('GET', '/api/setup/status')).needs_setup, false);
    });
    await t.test('manager login and unauthenticated API rejection', async () => {
      manager = (await request('POST', '/api/property-managers/login', { email: 'manager@example.test', password })).token;
      await request('POST', '/api/property-managers/login', { email: 'manager@example.test', password: 'incorrect' }, null, 401);
      await request('GET', '/api/tenants', undefined, null, 401);
      await request('GET', '/api/bills', undefined, 'invalid', 401);
    });
    await t.test('apartment creation and editing', async () => {
      apartment = await request('POST', '/api/apartments', { apartment_number: 'TEST-101', floor: '1', building: 'Test', rent_amount: 1000 }, manager, 201);
      otherApartment = await request('POST', '/api/apartments', { apartment_number: 'TEST-102', rent_amount: 900 }, manager, 201);
      const edited = await request('PUT', `/api/apartments/${apartment.id}`, { rent_amount: 1200 }, manager);
      assert.equal(edited.rent_amount, 1200);
    });
    await t.test('tenant creation, secure responses, occupancy uniqueness', async () => {
      firstTenant = await request('POST', '/api/tenants', { name: 'Test Tenant', email: 'tenant@example.test', apartment_id: apartment.id, password, move_in_date: '2026-01-01' }, manager, 201);
      assert.match(firstTenant.tenant_id, /^APT-\d{4}-\d{4}$/);
      secondTenant = await request('POST', '/api/tenants', { name: 'Other Tenant', email: 'other@example.test', apartment_id: otherApartment.id, password }, manager, 201);
      await request('POST', '/api/tenants', { name: 'Conflict', apartment_id: apartment.id, password }, manager, 409);
      assert.equal(db.get('SELECT status FROM apartments WHERE id=?', [apartment.id]).status, 'occupied');
      const result = await request('POST', '/api/tenants/login', { email: 'tenant@example.test', password });
      tenant = result.token;
      assert.equal(result.user.apartment_id, apartment.id);
      await request('POST', '/api/apartments', { apartment_number: 'Forbidden' }, tenant, 403);
      await request('GET', '/api/tenants', undefined, tenant, 403);
    });
    await t.test('transactional bill generation and tenant scoping', async () => {
      bill = await request('POST', '/api/bills', { tenant_id: firstTenant.id, bill_type: 'rent', amount: 1200, due_date: '2026-11-20' }, manager, 201);
      await request('POST', '/api/bills', { tenant_id: secondTenant.id, bill_type: 'water', amount: 80, due_date: '2026-11-20' }, manager, 201);
      const scoped = await request('GET', `/api/bills?tenantId=${secondTenant.id}`, undefined, tenant);
      assert.equal(scoped.length, 1); assert.equal(scoped[0].tenant_id, firstTenant.id);
      const before = db.get('SELECT COUNT(*) AS n FROM bills').n;
      await request('POST', '/api/bills/bulk', [{ tenant_id: firstTenant.id, bill_type: 'rent', amount: 10, due_date: '2026-12-20' }, { tenant_id: 999999, bill_type: 'rent', amount: 10, due_date: '2026-12-20' }], manager, 404);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM bills').n, before);
      await request('POST', '/api/bills', { tenant_id: firstTenant.id, bill_type: 'rent', amount: -10, due_date: '2026-11-20' }, manager, 400);
    });
    await t.test('payments, duplicate prevention, rollback, and reversal', async () => {
      await request('POST', '/api/bills/pay', { bill_ids: [bill.id, 999999] }, manager, 404);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM payment_history').n, 0);
      assert.equal(db.get('SELECT status FROM bills WHERE id=?', [bill.id]).status, 'pending');
      await request('POST', `/api/bills/${bill.id}/pay`, { paid_at: '2026-11-15' }, manager);
      await request('POST', `/api/bills/${bill.id}/pay`, {}, manager);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM payment_history').n, 1);
      assert.equal((await request('GET', '/api/payment-history', undefined, tenant)).length, 1);
      const monthly = await request('GET', '/api/payment-history/monthly/2026/11', undefined, manager);
      assert.equal(monthly.rent_total, 1200);
      const report = await request('GET', '/api/reports/overview?startDate=2026-01-01&endDate=2026-12-31', undefined, manager);
      assert.equal(report.summary.rent_collected, 1200);
      assert.equal(report.detailed_table.filter(row => row.bill_id === bill.id).length, 1);
      await request('DELETE', `/api/bills/${bill.id}/pay`, undefined, manager);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM payment_history').n, 0);
    });
    await t.test('meter creation, rates, reading history, and invalid reading rollback', async () => {
      await request('POST', '/api/meter-devices/settings/rates', { electricity_rate: 10, water_rate: 20 }, manager);
      meter = await request('POST', '/api/meter-devices', { apartment_id: apartment.id, meter_type: 'electricity_meter', previous_reading: 0, present_reading: 10 }, manager, 201);
      const reading = await request('PUT', `/api/meter-devices/update-reading/${meter.id}`, { presentReading: 15 }, manager);
      assert.equal(reading.consumption, 5); assert.equal(reading.total_cost, 50);
      await request('POST', '/api/meter-devices/reading', { deviceId: meter.device_id, reading: 17 }, manager);
      assert.equal((await request('GET', '/api/meter-devices/meter-history', undefined, manager)).length, 2);
      await request('PUT', `/api/meter-devices/update-reading/${meter.id}`, { presentReading: 1 }, manager, 400);
      assert.equal(db.get('SELECT present_reading FROM meter_devices WHERE id=?', [meter.id]).present_reading, 17);
      assert.equal((await request('GET', '/api/meter-devices', undefined, tenant)).length, 1);
    });
    await t.test('signed QR generation, manager scan, tenant login, and forgery rejection', async () => {
      const result = await request('POST', '/api/qr-codes/create-tenant-token', { tenant_id: firstTenant.id }, manager);
      qr = result.token; assert.ok(result.qr_url.startsWith('data:image/png;base64,'));
      assert.equal((await request('POST', '/api/qr-codes/scan', { qr_data: qr }, manager)).tenant.id, firstTenant.id);
      const qrLogin = await request('POST', '/api/qr-sessions', { qr_data: qr });
      assert.equal(qrLogin.user.id, firstTenant.id);
      await request('POST', '/api/qr-sessions', { qr_data: JSON.stringify({ tenant_id: firstTenant.id }) }, null, 401);
      await request('GET', `/api/qr-codes/${secondTenant.id}`, undefined, tenant, 403);
      await request('GET', `/api/qr-tokens/${secondTenant.id}`, undefined, tenant, 403);
    });
    await t.test('legacy password compatibility and recursive redaction', async () => {
      db.run('UPDATE tenants SET password=? WHERE id=?', [password, secondTenant.id]);
      await request('POST', '/api/tenants/login', { email: 'other@example.test', password });
      assert.equal(db.get('SELECT password FROM tenants WHERE id=?', [secondTenant.id]).password, password);
      assert.deepEqual(redact({ password: 'hidden', nested: { secret: 'hidden', safe: true } }), { nested: { safe: true } });
    });
    await t.test('migration rerun preserves records and on-disk persistence', () => {
      const before = db.get('SELECT COUNT(*) AS n FROM tenants').n; db.migrate();
      assert.equal(db.get('SELECT COUNT(*) AS n FROM tenants').n, before);
      const reopened = new DatabaseSync(process.env.SQLITE_PATH);
      assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM tenants').get().n, before); reopened.close();
      assert.equal(db.get('PRAGMA integrity_check').integrity_check, 'ok'); assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
    });
    await t.test('CRUD deletion and occupancy release are transactional', async () => {
      await request('DELETE', `/api/apartments/${apartment.id}`, undefined, manager, 409);
      await request('PUT', `/api/tenants/${firstTenant.id}`, { name: 'Edited Tenant' }, manager);
      assert.equal((await request('GET', `/api/tenants/${firstTenant.id}`, undefined, manager)).name, 'Edited Tenant');
      await request('DELETE', `/api/tenants/${firstTenant.id}`, undefined, manager);
      assert.equal(db.get('SELECT status FROM apartments WHERE id=?', [apartment.id]).status, 'available');
      await request('DELETE', `/api/meter-devices/${meter.id}`, undefined, manager);
      await request('DELETE', `/api/apartments/${apartment.id}`, undefined, manager);
      assert.equal(db.get('SELECT COUNT(*) AS n FROM apartments WHERE id=?', [apartment.id]).n, 0);
    });
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
