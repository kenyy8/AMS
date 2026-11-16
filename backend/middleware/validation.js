module.exports = function validateInput(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ message: 'A JSON request body is required' });
  const records = Array.isArray(req.body) ? req.body : [req.body];
  if (records.length > 1000) return res.status(400).json({ message: 'Too many items' });
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return res.status(400).json({ message: 'Invalid record' });
    for (const key of ['amount', 'amount_paid', 'rent_amount', 'rate', 'water_rate', 'electricity_rate', 'previous_reading', 'present_reading', 'presentReading', 'reading']) {
      if (record[key] !== undefined && record[key] !== null && (!Number.isFinite(Number(record[key])) || Number(record[key]) < 0)) return res.status(400).json({ message: `${key} must be a nonnegative number` });
    }
    for (const key of ['due_date', 'move_in_date', 'paid_at']) if (record[key] && !Number.isFinite(Date.parse(record[key]))) return res.status(400).json({ message: `${key} must be a valid date` });
    for (const value of Object.values(record)) if (typeof value === 'string' && value.length > 10000) return res.status(400).json({ message: 'Field is too long' });
    if (record.password !== undefined && (typeof record.password !== 'string' || Buffer.byteLength(record.password) > 72)) return res.status(400).json({ message: 'Password must be a string of at most 72 UTF-8 bytes' });
  }
  next();
};
