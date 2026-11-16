const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('./config/sqlite');
const { requireSecrets, isProduction } = require('./config/environment');
const { passwordMatches, sanitizeResponses, authorizeApi, loginLimit } = require('./middleware/security');
requireSecrets();

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function number(value, field, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(`${field} must be a nonnegative number`);
  return n;
}
function id(value) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) fail('Invalid record id'); return n; }
function date(value, field, optional = false) {
  if (!value && optional) return null;
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(String(value)) || !Number.isFinite(Date.parse(value))) fail(`${field} must be a valid date`);
  const normalized = new Date(value).toISOString().slice(0, 10);
  if (String(value).slice(0, 10) !== normalized) fail(`${field} must be a valid calendar date`);
  return normalized;
}
function text(value, field, required = false, max = 254) {
  if (value === undefined || value === null || value === '') { if (required) fail(`${field} is required`); return null; }
  if (typeof value !== 'string' || value.length > max || !value.trim()) fail(`Invalid ${field}`);
  return value.trim();
}
function passwordHash(value) { if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) fail('Password must contain 8 or more characters and at most 72 UTF-8 bytes'); return bcrypt.hashSync(value, 12); }
function exists(table, value) { const row = db.get(`SELECT * FROM ${table} WHERE id = ?`, [id(value)]); if (!row) fail('Record not found', 404); return row; }
function tenantRow(value) { return db.get('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE ' + (/^\d+$/.test(String(value)) ? 't.id' : 't.tenant_id') + ' = ?', [value]); }
function session(user, role) { return { message: 'Login successful', token: jwt.sign({ id: user.id, tenant_id: user.tenant_id, role }, process.env.JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' }), user: { ...user, role } }; }
function tenantScope(req) { return req.user.role === 'tenant' ? req.user.id : req.query.tenantId ? id(req.query.tenantId) : null; }
function paymentType(bill) { return /water|elect/i.test(bill.bill_type) ? 'UTILITY' : 'RENT'; }
function bills(tenantId) {
  return db.all(`SELECT b.*, t.name AS tenant_name, CASE WHEN ph.id IS NOT NULL THEN 'paid' ELSE CASE WHEN b.status = 'paid' THEN 'pending' ELSE b.status END END AS status
    FROM bills b JOIN tenants t ON t.id = b.tenant_id LEFT JOIN payment_history ph ON ph.bill_id = b.id
    WHERE (? IS NULL OR b.tenant_id = ?) ORDER BY b.due_date, b.id`, [tenantId, tenantId]);
}
function occupancy() {
  db.run("UPDATE apartments SET status = CASE WHEN EXISTS (SELECT 1 FROM tenants WHERE apartment_id = apartments.id AND status = 'active') THEN 'occupied' ELSE 'available' END WHERE status IN ('occupied','available','vacant')");
}
function saveTenant(body, existing) {
  const merged = { ...existing, ...body };
  const apartment = merged.apartment_id ? id(merged.apartment_id) : null;
  if (apartment) exists('apartments', apartment);
  const status = merged.status === 'paused' ? 'inactive' : (merged.status || 'active');
  if (!['active', 'inactive'].includes(status)) fail('Invalid tenant status');
  const year = new Date().getFullYear();
  const prefix = `APT-${year}-`;
  const last = db.get('SELECT tenant_id FROM tenants WHERE tenant_id LIKE ? ORDER BY tenant_id DESC LIMIT 1', [`${prefix}%`]);
  const generated = prefix + String((last ? Number(last.tenant_id.split('-').pop()) || 0 : 0) + 1).padStart(4, '0');
  const values = [text(merged.tenant_id || generated, 'tenant_id', true, 100), text(merged.name, 'name', true, 150), text(merged.email, 'email'), text(merged.phone, 'phone', false, 50), apartment, status, date(merged.move_in_date, 'move_in_date', true)];
  const password = body.password ? passwordHash(body.password) : existing?.password;
  if (!password) fail('Password is required');
  let recordId;
  if (existing) { recordId = existing.id; db.run('UPDATE tenants SET tenant_id=?, name=?, email=?, phone=?, apartment_id=?, status=?, move_in_date=?, password=? WHERE id=?', [...values, password, recordId]); }
  else recordId = db.run('INSERT INTO tenants (tenant_id,name,email,phone,apartment_id,status,move_in_date,password) VALUES (?,?,?,?,?,?,?,?)', [...values, password]).insertId;
  occupancy();
  return tenantRow(recordId);
}
function billValues(body) {
  exists('tenants', body.tenant_id);
  let type = text(body.bill_type, 'bill_type', true, 50).toLowerCase();
  if (/elect|power|^elec\.?$/.test(type)) type = 'electricity';
  else if (/rent/.test(type)) type = 'rent'; else if (/water/.test(type)) type = 'water';
  return [id(body.tenant_id), type, Math.round(number(body.amount, 'amount') * 100) / 100, date(body.due_date, 'due_date')];
}
function recordPayment(billId, body) {
  const bill = exists('bills', billId);
  if (db.get('SELECT id FROM payment_history WHERE bill_id=?', [bill.id])) return null;
  const type = String(body.payment_type || paymentType(bill)).toUpperCase();
  if (!['RENT', 'UTILITY'].includes(type)) fail('Invalid payment type');
  const amount = body.amount_paid === undefined || body.amount_paid === null ? bill.amount : Math.round(number(body.amount_paid, 'amount_paid') * 100) / 100;
  if (amount <= 0) fail('Payment amount must be positive');
  const paidAt = body.paid_at ? date(body.paid_at, 'paid_at') : new Date().toISOString();
  const result = db.run('INSERT INTO payment_history (bill_id,amount_paid,paid_at,payment_type) VALUES (?,?,?,?)', [bill.id, amount, paidAt, type]);
  db.run("UPDATE bills SET status='paid', paid_at=? WHERE id=?", [paidAt, bill.id]);
  return result.insertId;
}
function revertPayment(billId) { exists('bills', billId); const result = db.run('DELETE FROM payment_history WHERE bill_id=?', [id(billId)]); db.run("UPDATE bills SET status='pending', paid_at=NULL WHERE id=?", [id(billId)]); return result.affectedRows; }

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProduction) require('./middleware/production').productionSecurity(app);
  else app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(sanitizeResponses);
  app.use('/api', require('./middleware/validation'));
  if (!isProduction) app.get('/api/test', (req, res) => res.json({ message: 'Server is running!' }));
  else app.all(['/api/test','/api/setup/status','/api/setup/manager'],(req,res)=>res.status(404).json({message:'API endpoint not found'}));
  app.get('/api/health', (req, res) => {
    try { const ok = db.get('SELECT 1 AS ok'); res.json(isProduction ? {status:'ok'} : { status: 'ok', db: true, engine: 'sqlite', result: ok }); }
    catch (_) { res.status(503).json({ status: 'error', db: false }); }
  });
  app.get('/api/setup/status', (req, res) => res.json({ needs_setup: db.get('SELECT COUNT(*) AS n FROM property_managers').n === 0 }));
  app.post('/api/setup/manager', loginLimit, (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)) fail('Local setup only', 403);
    const user = require('./services/managerBootstrap').bootstrapManager(db, req.body);
    res.status(201).json(session(user, 'manager'));
  });
  for (const [route, table, role] of [['property-managers', 'property_managers', 'manager'], ['tenants', 'tenants', 'tenant']]) {
    app.post(`/api/${route}/login`, loginLimit, (req, res) => {
      const { email, tenant_id, password } = req.body;
      const key = role === 'tenant' && !email ? 'tenant_id' : 'email';
      const lookup = key === 'email' ? email : tenant_id;
      if (typeof lookup !== 'string' || typeof password !== 'string') fail('Invalid credentials', 401);
      const user = db.get(`SELECT * FROM ${table} WHERE ${key}=?`, [lookup]);
      if (!user || !passwordMatches(password, user.password)) fail('Invalid credentials', 401);
      res.json(session(user, role));
    });
  }
  app.post('/api/qr-sessions', loginLimit, (req, res) => {
    if (typeof req.body.qr_data !== 'string') fail('A signed Smart ID is required', 401);
    let payload;
    try { payload = jwt.verify(req.body.qr_data, process.env.QR_SECRET, { algorithms: ['HS256'] }); }
    catch (_) { fail('Invalid or expired Smart ID', 401); }
    if (payload.type !== 'tenant_qr') fail('Invalid Smart ID', 401);
    const tenant = tenantRow(payload.tid);
    if (!tenant) fail('Tenant not found', 401);
    res.json(session(tenant, 'tenant'));
  });
  app.use('/api', authorizeApi);
  app.get('/api/tenants', (req, res) => res.json(db.all('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON a.id=t.apartment_id')));
  app.get('/api/tenants/:id', (req, res) => { const row = tenantRow(req.params.id); if (!row) fail('Tenant not found', 404); res.json(row); });
  app.post('/api/tenants', (req, res) => res.status(201).json(db.transaction(() => saveTenant(req.body))));
  app.put('/api/tenants/:id', (req, res) => res.json(db.transaction(() => saveTenant(req.body, exists('tenants', req.params.id)))));
  app.delete('/api/tenants/:id', (req, res) => res.json(db.transaction(() => {
    const tenant = exists('tenants', req.params.id);
    db.run('DELETE FROM notifications WHERE tenant_id=?', [tenant.id]);
    db.run('DELETE FROM bills WHERE tenant_id=?', [tenant.id]);
    db.run('DELETE FROM tenants WHERE id=?', [tenant.id]); occupancy();
    return { id: tenant.id, apartment_id: tenant.apartment_id };
  })));
  app.post('/api/tenants/:id/pause', (req, res) => res.json({ message: 'Pause/resume is deprecated; no changes made.' }));

  app.get('/api/apartments', (req, res) => res.json(db.all('SELECT * FROM apartments ORDER BY apartment_number')));
  function apartmentValues(body) {
    const status = body.status === 'vacant' ? 'available' : body.status || 'available';
    if (!['available', 'occupied', 'maintenance'].includes(status)) fail('Invalid apartment status');
    return [text(body.apartment_number, 'apartment_number', true, 50), text(body.floor == null ? null : String(body.floor), 'floor', false, 50), text(body.building, 'building', false, 100), number(body.rent_amount, 'rent_amount', 0), status];
  }
  app.post('/api/apartments', (req, res) => res.status(201).json(db.transaction(() => exists('apartments', db.run('INSERT INTO apartments(apartment_number,floor,building,rent_amount,status) VALUES (?,?,?,?,?)', apartmentValues(req.body)).insertId))));
  app.put('/api/apartments/:id', (req, res) => res.json(db.transaction(() => { const row = exists('apartments', req.params.id); db.run('UPDATE apartments SET apartment_number=?,floor=?,building=?,rent_amount=?,status=? WHERE id=?', [...apartmentValues({ ...row, ...req.body }), row.id]); occupancy(); return exists('apartments', row.id); })));
  app.delete('/api/apartments/:id', (req, res) => res.json(db.transaction(() => { const row = exists('apartments', req.params.id); if (db.get('SELECT id FROM tenants WHERE apartment_id=?', [row.id])) fail('Reassign tenants before deleting this apartment', 409); db.run('DELETE FROM apartments WHERE id=?', [row.id]); return { message: 'Apartment deleted' }; })));

  app.get('/api/bills', (req, res) => res.json(bills(tenantScope(req))));
  app.get('/api/bills/overdue', (req, res) => res.json(bills(null).filter(b => b.status !== 'paid' && b.due_date < new Date().toISOString().slice(0, 10))));
  app.post('/api/bills', (req, res) => res.status(201).json(db.transaction(() => { const result = db.run('INSERT INTO bills(tenant_id,bill_type,amount,due_date) VALUES (?,?,?,?)', billValues(req.body)); return exists('bills', result.insertId); })));
  app.post('/api/bills/bulk', (req, res) => {
    if (!Array.isArray(req.body) || !req.body.length) fail('A nonempty array of bills is required');
    const result = db.transaction(() => req.body.map(body => db.run('INSERT INTO bills(tenant_id,bill_type,amount,due_date) VALUES (?,?,?,?)', billValues(body))));
    res.status(201).json({ inserted: result.length });
  });
  function changeBill(req, res) {
    res.json(db.transaction(() => {
      const row = exists('bills', req.params.id);
      const fields = Object.keys(req.body);
      if (fields.length === 1 && fields[0] === 'status') {
        if (req.body.status === 'paid') recordPayment(row.id, req.body);
        else if (req.body.status === 'pending') revertPayment(row.id);
        else fail('Only pending or paid status is supported');
      } else db.run('UPDATE bills SET tenant_id=?,bill_type=?,amount=?,due_date=? WHERE id=?', [...billValues({ ...row, ...req.body }), row.id]);
      return exists('bills', row.id);
    }));
  }
  app.put('/api/bills/:id', changeBill);
  app.patch('/api/bills/:id/status', changeBill);
  app.delete('/api/bills/:id', (req, res) => res.json(db.transaction(() => { exists('bills', req.params.id); db.run('DELETE FROM bills WHERE id=?', [id(req.params.id)]); return { message: 'Bill deleted' }; })));
  app.post('/api/bills/:id/pay', (req, res) => res.json(db.transaction(() => ({ message: 'Payment recorded', payment_id: recordPayment(req.params.id, req.body) }))));
  app.delete('/api/bills/:id/pay', (req, res) => res.json(db.transaction(() => ({ message: 'Payment reverted', deleted: revertPayment(req.params.id) }))));
  app.post('/api/bills/pay', (req, res) => {
    if (!Array.isArray(req.body.bill_ids) || !req.body.bill_ids.length) fail('bill_ids is required');
    const result = db.transaction(() => {
      let inserted = 0, skipped = 0;
      for (const billId of req.body.bill_ids) { const payment = recordPayment(billId, { ...req.body, payment_type: req.body.payment_types?.[String(billId)] || req.body.payment_type }); if (payment) inserted++; else skipped++; }
      return { inserted, skipped, errors: [] };
    });
    res.json({ message: 'Bulk payment processed', results: result });
  });
  app.post('/api/bills/unpay', (req, res) => {
    if (!Array.isArray(req.body.bill_ids) || !req.body.bill_ids.length) fail('bill_ids is required');
    const deleted = db.transaction(() => req.body.bill_ids.reduce((sum, billId) => sum + revertPayment(billId), 0));
    res.json({ message: 'Bulk unpay processed', results: { deleted, errors: [] } });
  });
  app.get('/api/payment-history', (req, res) => { const scope = tenantScope(req); res.json(db.all('SELECT ph.*, b.tenant_id,b.bill_type,b.amount AS bill_amount FROM payment_history ph JOIN bills b ON b.id=ph.bill_id WHERE (? IS NULL OR b.tenant_id=?) ORDER BY ph.paid_at DESC', [scope, scope])); });
  app.get('/api/payment-history/monthly/:year/:month', (req, res) => {
    const prefix = `${req.params.year}-${String(Number(req.params.month)).padStart(2, '0')}`;
    res.json(db.get("SELECT COALESCE(SUM(CASE WHEN payment_type='RENT' THEN amount_paid ELSE 0 END),0) AS rent_total, COALESCE(SUM(CASE WHEN payment_type='UTILITY' THEN amount_paid ELSE 0 END),0) AS utility_total, COALESCE(SUM(amount_paid),0) AS total FROM payment_history WHERE substr(paid_at,1,7)=?", [prefix]));
  });

  require('./routes/sqliteMeterRoutes')(app, { db, fail, id, exists, number, text, date });
  require('./routes/sqliteQrRoutes')(app, { db, fail, tenantRow, session, QRCode });
  require('./routes/sqliteReportRoutes')(app, { db, bills, paymentType, date });
  app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found' }));
  if (isProduction) require('./middleware/production').productionFrontend(app);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if(error.type==='entity.parse.failed')return res.status(400).json({message:'Invalid JSON request body'});
    if(error.status===413)return res.status(413).json({message:'Request body is too large'});
    if(error instanceof URIError)return res.status(400).json({message:'Invalid request path'});
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (/constraint/i.test(error.message)) return res.status(409).json({ message: 'This change conflicts with an existing record or relationship.' });
    console.error('[api] Request failed:', error.code || error.name);
    res.status(500).json({ message: 'Request failed. Check backend output.' });
  });
  return app;
}
module.exports = { createApp };
