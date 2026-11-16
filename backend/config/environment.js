const path = require('path');
const os = require('os');
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
function requireSecrets() {
  for (const key of ['JWT_SECRET', 'QR_SECRET']) if (!process.env[key] || process.env[key].length < 32) throw new Error(key + ' must contain at least 32 characters. Run npm run setup.');
  if (process.env.JWT_SECRET === process.env.QR_SECRET) throw new Error('JWT_SECRET and QR_SECRET must differ.');
}
function publicOrigin() {
  const value = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!value) throw new Error('Set APP_ORIGIN to the public HTTPS origin, or use Render\'s RENDER_EXTERNAL_URL.');
  const url = new URL(value);
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !process.env.RENDER;
  if ((!local && url.protocol !== 'https:') || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN must be a single HTTPS origin (loopback HTTP is allowed only for local tests).');
  return url.origin;
}
function validateProduction() {
  if (!isProduction) throw new Error('Production startup requires NODE_ENV=production.');
  if (process.env.HOSTED_DEMO !== 'true') throw new Error('Production requires HOSTED_DEMO=true; real local databases are never deployed.');
  requireSecrets();
  if (!process.env.DEMO_PASSWORD_SEED || process.env.DEMO_PASSWORD_SEED.length < 32) throw new Error('DEMO_PASSWORD_SEED must be a private random secret of at least 32 characters.');
  if (new Set([process.env.JWT_SECRET,process.env.QR_SECRET,process.env.DEMO_PASSWORD_SEED]).size !== 3) throw new Error('Use three distinct production secrets.');
  publicOrigin();
}
function databasePath() {
  if (!isProduction) return process.env.SQLITE_PATH === ':memory:' ? ':memory:' : path.resolve(__dirname,'..',process.env.SQLITE_PATH || 'data/ams.db');
  validateProduction();
  const temp = path.resolve(os.tmpdir());
  const target = process.env.SQLITE_PATH || path.join(temp,'ams-render-demo','ams.db');
  if (!path.isAbsolute(target)) throw new Error('Production SQLITE_PATH must be absolute and inside the temporary directory.');
  const resolved = path.resolve(target), relative = path.relative(temp,resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !resolved.endsWith('.db')) throw new Error('Production SQLite must stay inside the ephemeral temporary directory.');
  return resolved;
}
module.exports = { requireSecrets, isProduction, publicOrigin, validateProduction, databasePath };
