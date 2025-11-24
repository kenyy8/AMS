const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'smart_apartment_management'
});

const QR_SECRET = process.env.QR_SECRET || 'qr_secret_key';

// Wrap DB connect in a promise so we can coordinate startup logging and setup
const dbConnectPromise = new Promise((resolve, reject) => {
  db.connect((err) => {
    if (err) {
      console.error('Database connection failed:', err);
      reject(err);
    } else {
      // resolve without logging; final connected message will be printed after setup
      resolve();
    }
  });
});

// Helper: normalize bill_type input to canonical enum values used in DB
function normalizeBillType(input) {
  if (!input) return 'other';
  const s = String(input).toLowerCase().trim();
  // common synonyms mapping
  const electricSynonyms = new Set(['electric', 'electricity', 'elec', 'power', 'elec.']);
  if (s.includes('rent')) return 'rent';
  if (s.includes('water')) return 'water';
  if (electricSynonyms.has(s) || s.includes('electric') || s.includes('power') || s === 'elec') return 'electricity';
  if (s.includes('maint') || s.includes('maintenance')) return 'maintenance';
  // fallback: return lowercased token if it matches known enums, else return original lowercased
  return s;
}

// Ensure meter_devices table exists with expected columns to avoid runtime 500s
const ensureMeterTableSql = `
CREATE TABLE IF NOT EXISTS \`meter_devices\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`device_id\` VARCHAR(100) NOT NULL UNIQUE,
  \`meter_type\` VARCHAR(50) NULL,
  \`type\` VARCHAR(50),
  \`apartment_id\` INT DEFAULT NULL,
  \`previous_reading\` DECIMAL(12,3) DEFAULT 0,
  \`present_reading\` DECIMAL(12,3) DEFAULT 0,
  \`consumption\` DECIMAL(12,3) DEFAULT 0,
  \`rate\` DECIMAL(12,3) DEFAULT 0,
  \`total_cost\` DECIMAL(12,2) DEFAULT 0,
  \`current_reading\` DECIMAL(12,3) DEFAULT 0,
  \`last_updated\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (\`apartment_id\`) REFERENCES \`apartments\`(\`id\`) ON DELETE SET NULL
)
`;
// Helper to ensure the meter_devices table exists. Do not print success messages here to keep startup output concise.
const ensureMeterTable = () => new Promise((resolve) => {
  db.query(ensureMeterTableSql, (err) => {
  if (err) console.warn('Failed to ensure meter_devices table exists:', err.message || err);
    resolve();
  });
});

// Ensure expected columns exist on older schemas (add if missing)
// Ensure expected columns exist on older schemas (add if missing). Returns a promise that resolves when checks complete.
const ensureMeterColumns = () => {
  const cols = ['meter_type','type','apartment_id','previous_reading','present_reading','consumption','rate','total_cost','current_reading','last_updated','device_id'];
  const checkSql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meter_devices' AND COLUMN_NAME = ?`;

  const tasks = cols.map(col => new Promise((resolve) => {
    db.query(checkSql, [col], (cErr, cRows) => {
      if (cErr) return resolve(); // ignore errors for schema checks
      if (!cRows || cRows.length === 0) {
        // add missing column with a safe definition
        let alter = '';
  if (col === 'meter_type') alter = "ALTER TABLE `meter_devices` ADD COLUMN `meter_type` VARCHAR(50) NULL";
  else if (col === 'type') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `type` VARCHAR(50) NULL';
  else if (col === 'apartment_id') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `apartment_id` INT NULL';
  else if (col === 'previous_reading') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `previous_reading` DECIMAL(12,3) DEFAULT 0';
  else if (col === 'present_reading') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `present_reading` DECIMAL(12,3) DEFAULT 0';
  else if (col === 'consumption') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `consumption` DECIMAL(12,3) DEFAULT 0';
  else if (col === 'rate') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `rate` DECIMAL(12,3) DEFAULT 0';
  else if (col === 'total_cost') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `total_cost` DECIMAL(12,2) DEFAULT 0';
  else if (col === 'current_reading') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `current_reading` DECIMAL(12,3) DEFAULT 0';
  else if (col === 'last_updated') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';
  else if (col === 'device_id') alter = 'ALTER TABLE `meter_devices` ADD COLUMN `device_id` VARCHAR(100)';
        if (alter) {
          db.query(alter, (aErr) => {
            if (aErr) console.warn('Failed to add column', col, aErr && aErr.message ? aErr.message : aErr);
            // do not log successful alterations to keep output concise
            resolve();
          });
        } else resolve();
      } else {
        resolve();
      }
    });
  }));

  return Promise.all(tasks).then(() => {});
};

// Ensure tenants table has is_paused boolean column (backfill for older schemas)
const ensureTenantIsPausedColumn = () => new Promise((resolve) => {
  const checkSql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'is_paused'`;
  db.query(checkSql, (err, rows) => {
    if (err) return resolve();
    if (!rows || rows.length === 0) {
      const alter = "ALTER TABLE `tenants` ADD COLUMN `is_paused` TINYINT(1) DEFAULT 0";
      db.query(alter, (aErr) => {
        if (aErr) console.warn('Failed to add tenants.is_paused column:', aErr && aErr.message ? aErr.message : aErr);
        return resolve();
      });
    } else return resolve();
  });
});

// Import meter controller to expose a few newer endpoints directly (compat shim)
const meterController = require('./controllers/meterDeviceController');

// (paused_until support removed)

// Property Manager Login (plaintext password)
app.post('/api/property-managers/login', (req, res) => {
  const { email, password } = req.body;
  const query = 'SELECT * FROM property_managers WHERE email = ?';
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Login failed' });
    }

    const user = results[0];
    const isValidPassword = password === user.password;

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Login failed' });
    }

    const token = jwt.sign({ id: user.id, role: 'manager' }, 'secret_key', { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  });
});

// Tenant Login (plaintext password)
app.post('/api/tenants/login', (req, res) => {
  // Accept either tenant_id or email for login
  const { tenant_id, email, password } = req.body;
  const query = email ? 'SELECT * FROM tenants WHERE email = ?' : 'SELECT * FROM tenants WHERE tenant_id = ?';
  const param = email ? email : tenant_id;
  db.query(query, [param], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Login failed' });
    }

    const user = results[0];
    const isValidPassword = (password || '') === user.password;
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Login failed' });
    }

    const token = jwt.sign({ id: user.id, role: 'tenant' }, 'secret_key', { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        name: user.name,
        email: user.email
      }
    });
  });
});

// Minimal API: Tenants
app.get('/api/tenants', (req, res) => {
  const sql = `
    SELECT t.*, a.apartment_number
    FROM tenants t
    LEFT JOIN apartments a ON t.apartment_id = a.id
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch tenants' });
    res.json(rows);
  });
});

app.post('/api/tenants', (req, res) => {
  const { tenant_id, password, name, email, phone, apartment_id, status, move_in_date } = req.body;
  if (!tenant_id || !password || !name) {
    return res.status(400).json({ message: 'tenant_id, password, and name are required' });
  }
  // Prevent multiple active tenants in the same apartment
  if (apartment_id && (status || 'active') === 'active') {
    const checkSql = 'SELECT COUNT(*) AS cnt FROM tenants WHERE apartment_id = ? AND status = "active"';
    db.query(checkSql, [apartment_id], (checkErr, rows) => {
      if (checkErr) return res.status(500).json({ message: 'Failed to validate apartment occupancy' });
      if (rows[0].cnt > 0) return res.status(409).json({ message: 'Apartment already has an active tenant' });
      const insertSql = `
        INSERT INTO tenants (tenant_id, password, name, email, phone, apartment_id, status, move_in_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [tenant_id, password, name, email || null, phone || null, apartment_id || null, status || 'active', move_in_date || null], (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'tenant_id already exists' });
          return res.status(500).json({ message: 'Failed to create tenant' });
        }
        // mark apartment occupied and return the created tenant row
        if (apartment_id && (status || 'active') === 'active') {
          db.query('UPDATE apartments SET status = "occupied" WHERE id = ?', [apartment_id], () => {
            db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [result.insertId], (sErr, sRows) => {
              if (sErr) return res.status(201).json({ id: result.insertId });
              res.status(201).json(sRows[0]);
            });
          });
        } else {
          db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [result.insertId], (sErr, sRows) => {
            if (sErr) return res.status(201).json({ id: result.insertId });
            res.status(201).json(sRows[0]);
          });
        }
      });
    });
    return;
  }

  const sql = `
    INSERT INTO tenants (tenant_id, password, name, email, phone, apartment_id, status, move_in_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [tenant_id, password, name, email || null, phone || null, apartment_id || null, status || 'active', move_in_date || null], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'tenant_id already exists' });
      return res.status(500).json({ message: 'Failed to create tenant' });
    }
    // If tenant assigned to an apartment and is active, mark apartment occupied
    if (apartment_id && (status || 'active') === 'active') {
      db.query('UPDATE apartments SET status = "occupied" WHERE id = ?', [apartment_id], () => {
        // ignore errors here, return tenant row
        db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [result.insertId], (sErr, sRows) => {
          if (sErr) return res.status(201).json({ id: result.insertId });
          res.status(201).json(sRows[0]);
        });
      });
    } else {
      db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [result.insertId], (sErr, sRows) => {
        if (sErr) return res.status(201).json({ id: result.insertId });
        res.status(201).json(sRows[0]);
      });
    }
  });
});

app.put('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, apartment_id, status, tenant_id } = req.body;
  // get current tenant state to handle apartment occupancy changes and pause/resume bills
  db.query('SELECT apartment_id, status FROM tenants WHERE id = ?', [id], (selErr, selRows) => {
    if (selErr) return res.status(500).json({ message: 'Failed to fetch tenant' });
    const prev = selRows[0] || {};
    const prevApartment = prev.apartment_id;
    const prevStatus = prev.status;

  // support both status string and boolean is_paused in requests
  const newStatus = (status !== undefined) ? status : prevStatus;
    const newApartment = (apartment_id !== undefined) ? apartment_id : prevApartment;

    const doUpdate = () => {
      // Build a partial update only for provided fields
      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (email !== undefined) { fields.push('email = ?'); values.push(email); }
      if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
      if (apartment_id !== undefined) { fields.push('apartment_id = ?'); values.push(apartment_id); }
      if (tenant_id !== undefined) { fields.push('tenant_id = ?'); values.push(tenant_id); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) {
        // nothing to update
        return db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [id], (sErr, sRows) => {
          if (sErr) return res.json({ message: 'Tenant updated' });
          return res.json(sRows[0]);
        });
      }

  const sql = `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`;
      values.push(id);
  db.query(sql, values, (err) => {
        if (err) return res.status(500).json({ message: 'Failed to update tenant' });

        // If tenant became active and has an apartment, mark that apartment occupied
        if (newApartment && newStatus === 'active') {
          db.query('UPDATE apartments SET status = "occupied" WHERE id = ?', [newApartment], () => {});
        }

        // If tenant changed apartment, and previous apartment no longer has active tenants, mark it vacant
        if (prevApartment && prevApartment !== newApartment) {
          db.query('SELECT COUNT(*) AS cnt FROM tenants WHERE apartment_id = ? AND status = "active"', [prevApartment], (cErr, cRows) => {
            if (!cErr && cRows[0].cnt === 0) {
              db.query('UPDATE apartments SET status = "vacant" WHERE id = ?', [prevApartment], () => {});
            }
          });
        }

        // If status changed to paused/resumed, update bills accordingly (do not delete tenants)
        if (prevStatus !== newStatus) {
          if (newStatus === 'paused') {
            db.query('UPDATE bills SET status = "paused" WHERE tenant_id = ?', [id], () => {});
            // mark tenant paused flag and set status
            db.query('UPDATE tenants SET is_paused = 1, status = "paused" WHERE id = ?', [id], () => {});
          } else if (newStatus === 'active') {
            db.query('UPDATE bills SET status = "pending" WHERE tenant_id = ? AND status = "paused"', [id], () => {});
            db.query('UPDATE tenants SET is_paused = 0, status = "active" WHERE id = ?', [id], () => {});
          }
        }

        // return updated tenant row
        db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [id], (sErr, sRows) => {
          if (sErr) return res.json({ message: 'Tenant updated' });
          res.json(sRows[0]);
        });
      });
    };

    if (apartment_id !== undefined && newStatus === 'active') {
      const checkSql = 'SELECT COUNT(*) AS cnt FROM tenants WHERE apartment_id = ? AND status = "active" AND id <> ?';
      db.query(checkSql, [apartment_id, id], (checkErr, rows) => {
        if (checkErr) return res.status(500).json({ message: 'Failed to validate apartment occupancy' });
        if (rows[0].cnt > 0) return res.status(409).json({ message: 'Apartment already has an active tenant' });
        doUpdate();
      });
    } else {
      doUpdate();
    }
  });
});

app.delete('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  // Try deleting related rows first (best-effort)
  const deleteBillsSql = 'DELETE FROM bills WHERE tenant_id = ?';
  db.query(deleteBillsSql, [id], (/*err1*/) => {
    // find apartment before delete
    db.query('SELECT * FROM tenants WHERE id = ?', [id], (sErr, sRows) => {
      const tenantRow = sRows && sRows[0] ? sRows[0] : null;
      console.log('DELETE /api/tenants requested for id=', id, 'tenant=', tenantRow);
      const aptId = tenantRow ? tenantRow.apartment_id : null;
      const sql = 'DELETE FROM tenants WHERE id = ?';
      db.query(sql, [id], (err, result) => {
        if (err) {
          if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ message: 'Cannot delete tenant: referenced by other records' });
          }
          console.error('Failed to delete tenant', err);
          return res.status(500).json({ message: 'Failed to delete tenant' });
        }
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Tenant not found' });
        console.log('Tenant deleted id=', id, 'affected=', result.affectedRows);
        // If tenant had an apartment, check if other active tenants remain; if none, mark apartment vacant
        if (aptId) {
          db.query('SELECT COUNT(*) AS cnt FROM tenants WHERE apartment_id = ? AND status = "active"', [aptId], (cErr, cRows) => {
            if (!cErr && cRows[0].cnt === 0) {
              db.query('UPDATE apartments SET status = "vacant" WHERE id = ?', [aptId], () => {});
            }
            res.json({ id: id, apartment_id: aptId });
          });
        } else {
          res.json({ id: id });
        }
      });
    });
  });
});

// Minimal API: Apartments
app.get('/api/apartments', (req, res) => {
  db.query('SELECT * FROM apartments', (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch apartments' });
    res.json(rows);
  });
});

// Bills API: include paused bills and paused_until handling
app.get('/api/bills', (req, res) => {
  const sql = `
    SELECT b.*, t.name AS tenant_name
    FROM bills b
    LEFT JOIN tenants t ON b.tenant_id = t.id
    ORDER BY b.due_date ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch bills' });
    res.json(rows);
  });
});

// NOTE: reports-by-day aggregation was removed in favor of strict reports data
// The active reports endpoint for the UI is defined later in this file and
// returns paid rows from `payment_history` joined to `bills`, and pending
// rows coming directly from `bills` (only those without payment_history).
// Keeping this comment here to avoid accidental re-introduction of the old logic.

// Reports: aggregated totals by bill_type for date range
app.get('/api/reports/by-type', (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate required (YYYY-MM-DD)' });
  // Strict sources: paid amounts come from payment_history.paid_at between dates;
  // pending amounts come from bills.due_date between dates but only for bills
  // that do NOT have a payment_history record. We UNION both and aggregate by bill_type.
  const sql = `
    SELECT bill_type, SUM(amount) AS total FROM (
      SELECT b.bill_type AS bill_type, ph.amount_paid AS amount
      FROM payment_history ph
      JOIN bills b ON ph.bill_id = b.id
      WHERE DATE(ph.paid_at) BETWEEN ? AND ?

      UNION ALL

      SELECT b.bill_type AS bill_type, b.amount AS amount
      FROM bills b
      WHERE DATE(b.due_date) BETWEEN ? AND ?
        AND (b.status IS NULL OR b.status <> 'paid')
    ) AS unioned
    GROUP BY bill_type
    ORDER BY total DESC
  `;
  // pass startDate,endDate for paid (paid_at) then for pending (due_date)
  db.query(sql, [startDate, endDate, startDate, endDate], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to aggregate by type' });
    res.json(rows.map(r => ({ type: r.bill_type, total: Number(r.total)||0 })));
  });
});

// REPLACED: QR code data endpoint - return tenant only (no bills)
app.get('/api/qr-codes/:id', (req, res) => {
  const { id } = req.params;
  const byNumeric = /^\d+$/.test(id);
  const tenantSql = byNumeric
    ? 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?'
    : 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.tenant_id = ?';
  db.query(tenantSql, [id], (tErr, tRows) => {
    if (tErr) return res.status(500).json({ message: 'Failed to fetch tenant for QR' });
    if (!tRows || tRows.length === 0) return res.status(404).json({ message: 'Tenant not found' });
    const tenant = tRows[0];
    // Return tenant only (do NOT fetch tenant bills)
    return res.json({ tenant });
  });
});

// REPLACED: QR scan processing endpoint - return tenant or device only (no bills)
app.post('/api/qr-codes/scan', (req, res) => {
  const { qr_data } = req.body;
  console.log('POST /api/qr-codes/scan received qr_data:', qr_data);
  if (!qr_data) return res.status(400).json({ message: 'No qr_data provided' });

  // If qr_data is a JWT token, verify and return tenant (no bills)
  if (typeof qr_data === 'string' && qr_data.split('.').length === 3) {
    try {
      const payload = jwt.verify(qr_data, QR_SECRET);
      const tenantId = payload.tid;
      db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [tenantId], (tErr, tRows) => {
        if (tErr) return res.status(500).json({ message: 'DB error' });
        if (!tRows || tRows.length === 0) return res.status(404).json({ message: 'Tenant not found' });
        return res.json({ tenant: tRows[0] });
      });
      return;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired QR token' });
    }
  }

  // Otherwise handle JSON or legacy payloads (device or tenant id)
  let parsed;
  try {
    parsed = typeof qr_data === 'string' ? JSON.parse(qr_data) : qr_data;
  } catch (e) {
    parsed = { tenant_id: qr_data };
  }

  if (parsed.device_id) {
    db.query('SELECT d.*, a.apartment_number FROM meter_devices d LEFT JOIN apartments a ON d.apartment_id = a.id WHERE d.device_id = ?', [parsed.device_id], (dErr, dRows) => {
      if (dErr) return res.status(500).json({ message: 'DB error' });
      if (!dRows || dRows.length === 0) return res.status(404).json({ message: 'Device not found' });
      const device = dRows[0];
      db.query('UPDATE meter_devices SET last_updated = NOW() WHERE device_id = ?', [parsed.device_id], () => {
        return res.json({ device });
      });
    });
    return;
  }

  const lookup = parsed.tenant_id || parsed.id;
  if (!lookup) return res.status(400).json({ message: 'QR does not contain tenant identifier' });
  const byNumeric = /^\d+$/.test(String(lookup));
  const tenantSql = byNumeric
    ? 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?'
    : 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.tenant_id = ?';
  db.query(tenantSql, [lookup], (tErr, tRows) => {
    if (tErr) return res.status(500).json({ message: 'DB error' });
    if (!tRows || tRows.length === 0) return res.status(404).json({ message: 'Tenant not found' });
    return res.json({ tenant: tRows[0] });
  });
});

// Create a short signed QR token for a tenant id (client will embed token into QR)
app.get('/api/qr-tokens/:id', (req, res) => {
  const { id } = req.params;
  const byNumeric = /^\d+$/.test(id);
  const tenantSql = byNumeric
    ? 'SELECT t.id FROM tenants t WHERE t.id = ?'
    : 'SELECT t.id FROM tenants t WHERE t.tenant_id = ?';
  db.query(tenantSql, [id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Tenant not found' });
    const tenantId = rows[0].id;
    const token = jwt.sign({ tid: tenantId }, QR_SECRET, { expiresIn: '12h' });
    res.json({ token });
  });
});

// Patch status endpoint to accept paused/pending/paid
app.patch('/api/bills/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (status === 'pending') {
    // revert payment: delete any payment_history rows and set bill to pending
    db.query('DELETE FROM payment_history WHERE bill_id = ?', [id], (delErr) => {
      if (delErr) {
        console.error('PATCH /api/bills/:id/status - pending delete payment_history error:', delErr);
        return res.status(500).json({ message: 'Failed to revert payment history', error: delErr.message });
      }
      db.query('UPDATE bills SET status = ? WHERE id = ?', [status, id], (uErr) => {
        if (uErr) {
          console.error('PATCH /api/bills/:id/status - pending update error:', uErr);
          return res.status(500).json({ message: 'Failed to update bill status', error: uErr.message });
        }
        return res.json({ message: 'Bill status updated and payment history removed' });
      });
    });
  } else if (status === 'paid') {
    // Mark as paid: insert into payment_history if not already present and update bill.status
    db.query('SELECT * FROM bills WHERE id = ?', [id], (bErr, bRows) => {
      if (bErr) {
        console.error('PATCH /api/bills/:id/status - select bill error:', bErr);
        return res.status(500).json({ message: 'DB error' });
      }
      if (!bRows || bRows.length === 0) return res.status(404).json({ message: 'Bill not found' });
      const bill = bRows[0];
      if ((bill.status || '').toString().toLowerCase() === 'paid') return res.status(409).json({ message: 'Bill already marked paid' });
      // check payment_history existence
      db.query('SELECT COUNT(*) AS cnt FROM payment_history WHERE bill_id = ?', [id], (phErr, phRows) => {
        if (phErr) return res.status(500).json({ message: 'DB error' });
        const cnt = (phRows && phRows[0] && phRows[0].cnt) || 0;
        if (cnt > 0) {
          // still update bill status for UI reflection
          db.query('UPDATE bills SET status = ? WHERE id = ?', ['paid', id], () => {});
          return res.status(409).json({ message: 'Payment history already exists for this bill' });
        }
        // insert payment record using bill.amount and NOW()
        db.query('INSERT INTO payment_history (bill_id, amount_paid, paid_at) VALUES (?, ?, NOW())', [id, bill.amount || 0], (insErr, insRes) => {
          if (insErr) {
            console.error('PATCH /api/bills/:id/status - insert payment_history error:', insErr);
            return res.status(500).json({ message: 'Failed to record payment', error: insErr.message });
          }
          db.query('UPDATE bills SET status = ? WHERE id = ?', ['paid', id], (uErr) => {
            if (uErr) console.warn('PATCH /api/bills/:id/status - update status after payment error:', uErr && uErr.message ? uErr.message : uErr);
            return res.json({ message: 'Bill marked paid and payment recorded', payment_id: insRes.insertId });
          });
        });
      });
    });
  } else if (status === 'paused') {
    // simple status change to paused; no paused_until handling
    const sql = 'UPDATE bills SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err) => {
      if (err) {
        console.error('PATCH /api/bills/:id/status - paused error:', err);
        return res.status(500).json({ message: 'Failed to pause bill', error: err.message });
      }
      return res.json({ message: 'Bill paused' });
    });
  } else {
    return res.status(400).json({ message: 'Unknown status' });
  }
});

// Note: explicit resume endpoint and paused_until scheduler removed. Tenant-level pause/resume exists.

app.post('/api/apartments', (req, res) => {
  const { apartment_number, floor, building, rent_amount, status } = req.body;
  if (!apartment_number) return res.status(400).json({ message: 'apartment_number is required' });
  const sql = 'INSERT INTO apartments (apartment_number, floor, building, rent_amount, status) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [apartment_number, floor || null, building || null, rent_amount || 0, status || 'vacant'], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'apartment_number already exists' });
      return res.status(500).json({ message: 'Failed to create apartment' });
    }
    db.query('SELECT * FROM apartments WHERE id = ?', [result.insertId], (sErr, sRows) => {
      if (sErr) return res.status(201).json({ id: result.insertId });
      res.status(201).json(sRows[0]);
    });
  });
});

app.put('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  const { apartment_number, floor, building, rent_amount, status } = req.body;
  const sql = 'UPDATE apartments SET apartment_number = ?, floor = ?, building = ?, rent_amount = ?, status = ? WHERE id = ?';
  db.query(sql, [apartment_number, floor || null, building || null, rent_amount || 0, status || 'vacant', id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update apartment' });
    db.query('SELECT * FROM apartments WHERE id = ?', [id], (sErr, sRows) => {
      if (sErr) return res.json({ message: 'Apartment updated' });
      res.json(sRows[0]);
    });
  });
});

app.delete('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  // Unassign tenants first
  db.query('UPDATE tenants SET apartment_id = NULL WHERE apartment_id = ?', [id], () => {
  db.query('DELETE FROM meter_devices WHERE apartment_id = ?', [id], () => {
      db.query('DELETE FROM apartments WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Failed to delete apartment' });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Apartment not found' });
        res.json({ message: 'Apartment deleted' });
      });
    });
  });
});

// Minimal API: Meter Devices (compatibility for older clients)
app.get('/api/meter-devices', (req, res) => {
  const sql = `
    SELECT d.*, a.apartment_number, t.name AS tenant_name
  FROM meter_devices d
    LEFT JOIN apartments a ON d.apartment_id = a.id
    LEFT JOIN tenants t ON a.id = t.apartment_id AND t.status = 'active'
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch devices' });
    res.json(rows);
  });
});

// Tenant-level pause/resume endpoint: pause or resume all bills for a tenant in one operation
app.post('/api/tenants/:id/pause', (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // expected 'pause' or 'resume'
  if (action === 'pause') {
    // mark tenant as paused (flag + status) and pause bills; keep tenant row intact
    const q1 = `UPDATE tenants SET is_paused = 1, status = 'paused' WHERE id = ?`;
    db.query(q1, [id], (tErr) => {
      if (tErr) return res.status(500).json({ message: 'Failed to mark tenant paused' });
      const sql = `UPDATE bills SET status = 'paused' WHERE tenant_id = ?`;
      db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Failed to pause tenant bills' });
        return res.json({ message: 'Tenant paused', affected: result.affectedRows });
      });
    });
  } else if (action === 'resume') {
    // clear paused flag and restore tenant status to active, resume paused bills
    const q2 = `UPDATE tenants SET is_paused = 0, status = 'active' WHERE id = ?`;
    db.query(q2, [id], (tErr) => {
      if (tErr) return res.status(500).json({ message: 'Failed to unmark tenant paused' });
      const sql = `UPDATE bills SET status = 'pending' WHERE tenant_id = ? AND status = 'paused'`;
      db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Failed to resume tenant bills' });
        return res.json({ message: 'Tenant resumed', affected: result.affectedRows });
      });
    });
  } else {
    return res.status(400).json({ message: 'Invalid action' });
  }
});

app.post('/api/meter-devices', (req, res) => {
  const { device_id, meter_type, type, apartment_id, previous_reading, present_reading, rate } = req.body;
  if (!device_id) return res.status(400).json({ message: 'device_id is required' });

  const prev = Number(previous_reading || 0);
  const pres = Number(present_reading || 0);
  const usage = Math.max(0, pres - prev);
  const r = Number(rate || 0);
  const total = parseFloat((usage * r).toFixed(2));

  const sql = 'INSERT INTO `meter_devices` (`device_id`, `meter_type`, `type`, `apartment_id`, `previous_reading`, `present_reading`, `consumption`, `rate`, `total_cost`, `current_reading`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [device_id, meter_type || null, type || null, apartment_id || null, prev, pres, usage, r, total, pres], (err, result) => {
    if (err) {
  console.error('Meter create error:', err);
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'device_id already exists' });
      return res.status(500).json({ message: 'Failed to create device', error: err.message });
    }
    res.status(201).json({ id: result.insertId });
  });
});

app.put('/api/meter-devices/:id', (req, res) => {
  const { id } = req.params;
  const { meter_type, type, apartment_id, previous_reading, present_reading, rate } = req.body;
  try {
    const prev = Number(previous_reading || 0);
    const pres = Number(present_reading || 0);
  const usage = Math.max(0, pres - prev);
    const r = Number(rate || 0);
    const total = parseFloat((usage * r).toFixed(2));
  const sql = 'UPDATE `meter_devices` SET `meter_type` = ?, `type` = ?, `apartment_id` = ?, `previous_reading` = ?, `present_reading` = ?, `consumption` = ?, `rate` = ?, `total_cost` = ?, `current_reading` = ?, `last_updated` = NOW() WHERE `id` = ?';
  db.query(sql, [meter_type || null, type || null, apartment_id || null, prev, pres, usage, r, total, pres, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update device', error: err.message });
      res.json({ message: 'Device updated' });
    });
  } catch (e) {
    res.status(400).json({ message: 'Invalid readings' });
  }
});

// Compatibility endpoints: expose new settings and billing-history and update-reading directly
app.get('/api/meter-devices/settings/rates', (req, res) => {
  return meterController.getRates(req, res);
});

app.post('/api/meter-devices/settings/rates', (req, res) => {
  return meterController.setRates(req, res);
});

app.get('/api/meter-devices/meter-history', (req, res) => {
  return meterController.getBillingHistory(req, res);
});

app.put('/api/meter-devices/update-reading/:id', (req, res) => {
  return meterController.updateReading(req, res);
});

app.delete('/api/meter-devices/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM meter_devices WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to delete device' });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Device not found' });
    res.json({ message: 'Device deleted' });
  });
});

// Optional: Endpoint used by phone QR scanner to mark a device as scanned
app.post('/api/meter-devices/scan', (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'No device_id provided' });
  const sql = 'UPDATE meter_devices SET last_updated = NOW() WHERE device_id = ?';
  db.query(sql, [device_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device updated successfully' });
  });
});

// REPLACED (duplicate later in file): QR code endpoints - GET tenant (no bills)
app.get('/api/qr-codes/:id', (req, res) => {
  const { id } = req.params;
  const byNumeric = /^\d+$/.test(id);
  const tenantSql = byNumeric
    ? 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?'
    : 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.tenant_id = ?';
  db.query(tenantSql, [id], (tErr, tRows) => {
    if (tErr) return res.status(500).json({ message: 'Failed to fetch tenant for QR' });
    if (!tRows || tRows.length === 0) return res.status(404).json({ message: 'Tenant not found' });
    return res.json({ tenant: tRows[0] });
  });
});

// REPLACED (duplicate later in file): QR scan handler - return tenant or device only (no bills)
app.post('/api/qr-codes/scan', (req, res) => {
  const { qr_data } = req.body;
  if (!qr_data) return res.status(400).json({ message: 'No qr_data provided' });
  let parsed;
  try {
    parsed = typeof qr_data === 'string' ? JSON.parse(qr_data) : qr_data;
  } catch (e) {
    parsed = { raw: qr_data };
  }

  if (parsed.device_id) {
    db.query('SELECT d.*, a.apartment_number FROM meter_devices d LEFT JOIN apartments a ON d.apartment_id = a.id WHERE d.device_id = ?', [parsed.device_id], (dErr, dRows) => {
      if (dErr) return res.status(500).json({ message: 'DB error' });
      if (!dRows || dRows.length === 0) return res.status(404).json({ message: 'Device not found' });
      const device = dRows[0];
      db.query('UPDATE meter_devices SET last_updated = NOW() WHERE device_id = ?', [parsed.device_id], () => {
        return res.json({ device });
      });
    });
    return;
  }

  const lookup = parsed.tenant_id || parsed.id || parsed.raw;
  if (!lookup) return res.status(400).json({ message: 'QR payload missing tenant or device id' });
  const byNumeric2 = /^\d+$/.test(String(lookup));
  const tenantSql2 = byNumeric2
    ? 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?'
    : 'SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.tenant_id = ?';
  db.query(tenantSql2, [lookup], (tErr2, tRows2) => {
    if (tErr2) return res.status(500).json({ message: 'DB error' });
    if (!tRows2 || tRows2.length === 0) return res.status(404).json({ message: 'Tenant not found' });
    const tenant = tRows2[0];
    // Return tenant only (no bills)
    return res.json({ tenant });
  });
});

// Bills API (simple): return bills with tenant name
app.get('/api/bills', (req, res) => {
  const sql = `
    SELECT b.*, t.name AS tenant_name
    FROM bills b
    LEFT JOIN tenants t ON b.tenant_id = t.id
    ORDER BY b.due_date ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch bills' });
    res.json(rows);
  });
});

// Mark bill as paid: creates payment_history entry (only if not already paid via payment_history)
app.post('/api/bills/:id/pay', (req, res) => {
  const { id } = req.params;
  let { amount_paid, paid_at } = req.body;
  amount_paid = amount_paid !== undefined ? amount_paid : null;
  // default paid_at to NOW() when not provided
  const paidAtSql = paid_at ? '?': 'NOW()';

  // Check bill exists and not already paid in payment_history
  db.query('SELECT * FROM bills WHERE id = ?', [id], (bErr, bRows) => {
    if (bErr) return res.status(500).json({ message: 'DB error' });
    if (!bRows || bRows.length === 0) return res.status(404).json({ message: 'Bill not found' });
    // check existing payment_history for this bill
    db.query('SELECT COUNT(*) AS cnt FROM payment_history WHERE bill_id = ?', [id], (phErr, phRows) => {
      if (phErr) return res.status(500).json({ message: 'DB error' });
      const cnt = (phRows && phRows[0] && phRows[0].cnt) || 0;
      if (cnt > 0) return res.status(409).json({ message: 'Bill already has payment history (already paid)' });

      // if amount_paid not provided, fall back to bill amount
      const amtPromise = new Promise((resolve) => { if (amount_paid !== null) return resolve(amount_paid); return resolve(bRows[0].amount || 0); });
      amtPromise.then((amt) => {
        const insertSql = `INSERT INTO payment_history (bill_id, amount_paid, paid_at) VALUES (?, ?, ${paidAtSql})`;
        const params = paid_at ? [id, amt, paid_at] : [id, amt];
        db.query(insertSql, params, (insErr, insRes) => {
          if (insErr) {
            console.error('Failed to insert payment_history:', insErr);
            return res.status(500).json({ message: 'Failed to record payment', error: insErr.message });
          }
          // update bills.status to paid for UI reflection (do not use bills.amount for revenue)
          db.query('UPDATE bills SET status = ? WHERE id = ?', ['paid', id], (uErr) => {
            if (uErr) console.warn('Failed to update bill status after payment:', uErr.message || uErr);
            return res.json({ message: 'Payment recorded', payment_id: insRes.insertId });
          });
        });
      });
    });
  });
});

// Revert payment: deletes payment_history entry for a bill (all entries) and set bill.status back to pending
app.delete('/api/bills/:id/pay', (req, res) => {
  const { id } = req.params;
  // delete payment_history entries
  db.query('DELETE FROM payment_history WHERE bill_id = ?', [id], (delErr, delRes) => {
    if (delErr) return res.status(500).json({ message: 'Failed to delete payment history' });
    // set bill status to pending
    db.query('UPDATE bills SET status = ? WHERE id = ?', ['pending', id], (uErr) => {
      if (uErr) return res.status(500).json({ message: 'Failed to revert bill status' });
      return res.json({ message: 'Payment reverted', deleted: delRes.affectedRows });
    });
  });
});

// Bulk mark bills as paid (toolbar global date applies to all)
app.post('/api/bills/pay', (req, res) => {
  const { bill_ids, paid_at, amount_paid } = req.body;
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) return res.status(400).json({ message: 'bill_ids array required' });

  const results = { inserted: 0, skipped: 0, errors: [] };
  const tasks = bill_ids.map(id => new Promise((resolve) => {
    db.query('SELECT * FROM bills WHERE id = ?', [id], (bErr, bRows) => {
      if (bErr) { results.errors.push({ id, error: bErr.message || bErr }); results.skipped++; return resolve(); }
      if (!bRows || bRows.length === 0) { results.skipped++; return resolve(); }
      db.query('SELECT COUNT(*) AS cnt FROM payment_history WHERE bill_id = ?', [id], (phErr, phRows) => {
        if (phErr) { results.errors.push({ id, error: phErr.message || phErr }); results.skipped++; return resolve(); }
        const cnt = (phRows && phRows[0] && phRows[0].cnt) || 0;
        if (cnt > 0) { results.skipped++; return resolve(); }
        const insSql = paid_at ? 'INSERT INTO payment_history (bill_id, amount_paid, paid_at) VALUES (?, ?, ?)' : 'INSERT INTO payment_history (bill_id, amount_paid, paid_at) VALUES (?, ?, NOW())';
        const amt = (amount_paid !== undefined && amount_paid !== null) ? amount_paid : (bRows[0].amount || 0);
        const params = paid_at ? [id, amt, paid_at] : [id, amt];
        db.query(insSql, params, (insErr, insRes) => {
          if (insErr) { results.errors.push({ id, error: insErr.message || insErr }); results.skipped++; return resolve(); }
          results.inserted++;
          db.query('UPDATE bills SET status = ? WHERE id = ?', ['paid', id], () => resolve());
        });
      });
    });
  }));

  Promise.all(tasks).then(() => res.json({ message: 'Bulk payment processed', results })).catch(e => res.status(500).json({ message: 'Bulk payment failed', error: e && e.message ? e.message : e }));
});

// Bulk revert/unpay selected bills
app.post('/api/bills/unpay', (req, res) => {
  const { bill_ids } = req.body;
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) return res.status(400).json({ message: 'bill_ids array required' });
  const results = { deleted: 0, errors: [] };
  const tasks = bill_ids.map(id => new Promise((resolve) => {
    db.query('DELETE FROM payment_history WHERE bill_id = ?', [id], (delErr, delRes) => {
      if (delErr) { results.errors.push({ id, error: delErr.message || delErr }); return resolve(); }
      results.deleted += (delRes && delRes.affectedRows) ? delRes.affectedRows : 0;
      db.query('UPDATE bills SET status = ? WHERE id = ?', ['pending', id], () => resolve());
    });
  }));
  Promise.all(tasks).then(() => res.json({ message: 'Bulk unpay processed', results })).catch(e => res.status(500).json({ message: 'Bulk unpay failed', error: e && e.message ? e.message : e }));
});

// List payment history (optionally filtered by tenant)
app.get('/api/payment-history', (req, res) => {
  const { tenantId } = req.query;
  let sql = `SELECT ph.*, b.tenant_id, b.bill_type, b.amount AS bill_amount FROM payment_history ph JOIN bills b ON ph.bill_id = b.id`;
  const params = [];
  if (tenantId) {
    sql += ' WHERE b.tenant_id = ?';
    params.push(tenantId);
  }
  sql += ' ORDER BY ph.paid_at DESC';
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch payment history' });
    res.json(rows);
  });
});

// Monthly income sum endpoint using payment_history
app.get('/api/payment-history/monthly/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const sql = 'SELECT IFNULL(SUM(amount_paid),0) AS total FROM payment_history WHERE MONTH(paid_at) = ? AND YEAR(paid_at) = ?';
  db.query(sql, [month, year], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to compute monthly income' });
    res.json({ total: (rows && rows[0] && rows[0].total) || 0 });
  });
});

// Reports API: combine pending bills (from bills) and paid entries (from payment_history)
// Strict sources: pending -> bills table (no payment_history entries), paid -> payment_history table
// Query params: startDate (YYYY-MM-DD) for inclusive start, endDate (YYYY-MM-DD) for inclusive end, tenantId optional
app.get('/api/reports/bills', (req, res) => {
  const { startDate, endDate, tenantId } = req.query;
  const paramsPending = [];
  const paramsPaid = [];

  // Build tenant filter (applied to both paid and pending selects)
  let tenantFilter = '';
  if (tenantId) {
    tenantFilter = 'AND b.tenant_id = ?';
  }

  // Apply server-side date filters when provided: startDate/endDate apply to
  // payment_history.paid_at for paid rows and bills.due_date for pending rows.
  let pendingDateFilter = '';
  let paidDateFilter = '';

  if (startDate && endDate) {
    paidDateFilter = 'AND DATE(ph.paid_at) BETWEEN ? AND ?';
    pendingDateFilter = 'AND DATE(b.due_date) BETWEEN ? AND ?';
    // params for paid select first, then pending select
    paramsPaid.push(startDate, endDate);
    paramsPending.push(startDate, endDate);
  }

  if (tenantId) {
    // tenantFilter will be interpolated into both SELECTs; we'll pass tenantId twice
    paramsPaid.push(tenantId);
    paramsPending.push(tenantId);
  }

  const sql = `
    SELECT
      ph.id AS payment_history_id,
      ph.bill_id AS bill_id,
      b.tenant_id,
      b.bill_type,
      ph.amount_paid AS amount,
      'paid' AS status,
      ph.paid_at AS due_date,
      t.name AS tenant_name,
      t.is_paused AS tenant_is_paused,
      t.status AS tenant_status
    FROM payment_history ph
    JOIN bills b ON ph.bill_id = b.id
    LEFT JOIN tenants t ON b.tenant_id = t.id
  WHERE 1=1 ${paidDateFilter} ${tenantFilter}

    UNION ALL

    SELECT
      NULL AS payment_history_id,
      b.id AS bill_id,
      b.tenant_id,
      b.bill_type,
      b.amount AS amount,
      b.status AS status,
      b.due_date AS due_date,
      t.name AS tenant_name,
      t.is_paused AS tenant_is_paused,
      t.status AS tenant_status
    FROM bills b
    LEFT JOIN tenants t ON b.tenant_id = t.id
    -- Match Bill Management: treat pending bills as those with status != 'paid'
    WHERE (b.status IS NULL OR b.status <> 'paid') ${pendingDateFilter} ${tenantFilter}

    ORDER BY due_date DESC
  `;

  // We'll pass paid params first (start,end,tenant?) then pending params
  const finalParams = paramsPaid.concat(paramsPending);
  db.query(sql, finalParams, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch reports bills' });
    res.json(rows);
  });
});

app.get('/api/bills/overdue', (req, res) => {
  const sql = `
    SELECT b.*, t.name AS tenant_name
    FROM bills b
    LEFT JOIN tenants t ON b.tenant_id = t.id
    WHERE b.status = "pending" AND b.due_date < CURDATE()
    ORDER BY b.due_date ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch overdue bills' });
    res.json(rows);
  });
});

app.post('/api/bills', (req, res) => {
  const { tenant_id, bill_type, amount, due_date } = req.body;
  if (!tenant_id || !bill_type || !amount || !due_date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  // normalize bill_type before inserting
  const normalizedBillType = normalizeBillType(bill_type);

  const sql = 'INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES (?, ?, ?, ?, "pending")';
  db.query(sql, [tenant_id, normalizedBillType, amount, due_date], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to create bill' });
    res.status(201).json({ id: result.insertId });
  });
});

// Bulk create bills endpoint
app.post('/api/bills/bulk', (req, res) => {
  const bills = req.body;
  console.debug('SERVER: /api/bills/bulk received payload:', Array.isArray(bills) ? `${bills.length} items` : typeof bills);
  if (!Array.isArray(bills) || bills.length === 0) {
    return res.status(400).json({ message: 'Request body must be a non-empty array of bills' });
  }
  // Normalize bill_type values for all valid bills
  const values = bills
    .filter(b => b.tenant_id && b.bill_type && b.amount && b.due_date)
    .map(b => [b.tenant_id, normalizeBillType(b.bill_type), b.amount, b.due_date, 'pending']);
  if (values.length === 0) {
    return res.status(400).json({ message: 'No valid bills to insert' });
  }
  const sqlBulk = 'INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES ?';
  db.query(sqlBulk, [values], (err, result) => {
    if (err) {
      console.error('Bulk bill insert error:', err);
      return res.status(500).json({ message: 'Failed to bulk create bills' });
    }
    console.debug('SERVER: /api/bills/bulk inserted rows:', result.affectedRows);
    res.status(201).json({ inserted: result.affectedRows });
  });
});

// Full bill update (for editing bills)
app.put('/api/bills/:id', (req, res) => {
  const { id } = req.params;
  const { tenant_id, bill_type, amount, due_date, status } = req.body;

  // If only status is provided, update just the status
  if (status && !tenant_id && !bill_type && !amount && !due_date) {
    const sql = 'UPDATE bills SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update bill status' });
      res.json({ message: 'Bill status updated' });
    });
  } else {
    // Full bill update
  // normalize bill_type on update
  const normalizedBillType = normalizeBillType(bill_type);
  const sql = 'UPDATE bills SET tenant_id = ?, bill_type = ?, amount = ?, due_date = ? WHERE id = ?';
  db.query(sql, [tenant_id, normalizedBillType, amount, due_date, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update bill' });
      res.json({ message: 'Bill updated' });
    });
  }
});


// Delete bill
app.delete('/api/bills/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM bills WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to delete bill' });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Bill not found' });
    res.json({ message: 'Bill deleted' });
  });
});

// DB Health check
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err, results) => {
    if (err) {
      console.error('Health check DB error:', err);
      return res.status(500).json({ status: 'error', db: false });
    }
    res.json({ status: 'ok', db: true, result: results[0] });
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const PORT = process.env.PORT || 5001;

// Register routes that don't depend on dynamic startup ordering
const meterDeviceRoutes = require('./routes/meterDeviceRoutes');
app.use('/api/meter-devices', meterDeviceRoutes);

// Start server first, then perform DB setup and print concise startup logs in the requested order.
app.listen(PORT, async () => {
  // Start line 1
  console.log('SMART APARTMENT server running on port ' + PORT);

  // Line 2: indicate we're performing schema/table setup
  console.log('Ensuring required tables...');

  try {
    // Wait for DB to connect
    await dbConnectPromise;
  // Ensure meter table and columns (do not print success per-item)
  await ensureMeterTable();
  await ensureMeterColumns();
  // Ensure tenants have is_paused column
  await ensureTenantIsPausedColumn();

    // Ensure payment_history table exists for revenue tracking
    const ensurePaymentHistorySql = `
    CREATE TABLE IF NOT EXISTS \`payment_history\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`bill_id\` INT NOT NULL,
      \`amount_paid\` DECIMAL(12,2) NOT NULL DEFAULT 0,
      \`paid_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    )`;
    db.query(ensurePaymentHistorySql, (err) => {
      if (err) console.warn('Failed to ensure payment_history table exists:', err && err.message ? err.message : err);
    });

    // Final connected message appears last after setup finishes
    console.log('Connected to MySQL database successfully');
  } catch (err) {
    // Print connection failure (keeps output concise)
    console.error('Database connection failed:', err && err.message ? err.message : err);
  }
});
