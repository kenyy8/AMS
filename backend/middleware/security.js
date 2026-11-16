const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function passwordMatches(candidate, stored) {
  if (typeof candidate !== 'string' || !candidate || typeof stored !== 'string') return false;
  if (/^\$2[aby]\$/.test(stored)) return bcrypt.compareSync(candidate, stored);
  if (process.env.NODE_ENV === 'production') return false;
  // Preserve existing credentials without silently rewriting account data.
  const a = Buffer.from(candidate), b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret/i.test(key)).map(([key, item]) => [key, redact(item)]));
}

function sanitizeResponses(req, res, next) {
  const json = res.json.bind(res);
  res.json = value => json(redact(value));
  next();
}

function authorizeApi(req, res, next) {
  if (['/health', '/test'].includes(req.path) && req.method === 'GET') return next();
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) { return res.status(401).json({ message: 'Session expired or invalid' }); }
  if (!Number.isInteger(req.user.id) || req.user.id < 1) return res.status(401).json({ message: 'Invalid session' });
  const db=require('../config/sqlite');
  if (req.user.role === 'manager') {
    if (!db.get('SELECT id FROM property_managers WHERE id=?',[req.user.id])) return res.status(401).json({message:'Account is unavailable'});
    return next();
  }
  if (req.user.role !== 'tenant') return res.status(403).json({ message: 'Access denied' });
  if (!db.get('SELECT id FROM tenants WHERE id=? AND tenant_id=?',[req.user.id,req.user.tenant_id])) return res.status(401).json({message:'Account is unavailable'});
  if (req.method === 'GET' && ['/bills', '/payment-history', '/meter-devices'].includes(req.path)) return next();
  const qr = /^\/qr-codes\/([^/]+)$/.exec(req.path);
  if (req.method === 'GET' && qr && [String(req.user.id), String(req.user.tenant_id)].includes(decodeURIComponent(qr[1]))) return next();
  return res.status(403).json({ message: 'Manager access required' });
}

const attempts = new Map();
function loginLimit(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  if(!attempts.has(key) && attempts.size>=5000) return res.status(429).json({message:'Too many login attempts. Try again later.'});
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  entry.count++;
  attempts.set(key, entry);
  if (entry.count > (process.env.NODE_ENV==='production'?60:20)) return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
  next();
}

module.exports = { passwordMatches, redact, sanitizeResponses, authorizeApi, loginLimit };
