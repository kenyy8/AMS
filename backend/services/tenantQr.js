const jwt = require('jsonwebtoken');
function createTenantToken(tenantId) {
  if (!Number.isSafeInteger(Number(tenantId)) || Number(tenantId) < 1) throw new Error('Invalid tenant identity');
  return jwt.sign({ tid: Number(tenantId), type: 'tenant_qr' }, process.env.QR_SECRET, { expiresIn: '12h', algorithm: 'HS256' });
}
module.exports = { createTenantToken };
