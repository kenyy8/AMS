const bcrypt = require('bcryptjs');

// Shared by the first-run API, the private CLI, and an empty demo database.
function bootstrapManager(db, { name, email, password }) {
  function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  if (typeof name !== 'string' || !name.trim() || name.length > 150) invalid('A valid manager name is required');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('A valid email is required');
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) invalid('Initial manager password must contain at least 12 characters and at most 72 UTF-8 bytes');
  const hash = bcrypt.hashSync(password, 12);
  return db.transaction(() => {
    if (db.get('SELECT COUNT(*) AS n FROM property_managers').n) invalid('Initial setup has already been completed', 409);
    const { insertId } = db.run("INSERT INTO property_managers(name,email,password,role) VALUES (?,?,?,'manager')", [name.trim(), email.trim(), hash]);
    return db.get('SELECT * FROM property_managers WHERE id=?', [insertId]);
  });
}
module.exports = { bootstrapManager };
