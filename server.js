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

db.connect((err) => {
  if (err) {
    console.error('DB connection error:', err);
  } else {
    console.log('DB connected');
  }
});
// Get Meter devices
app.get('/api/meter-devices', (req, res) => {
  const sql = 'SELECT d.*, a.apartment_number FROM meter_devices d LEFT JOIN apartments a ON d.apartment_id = a.id';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch Meter devices' });
    res.json(results);
  });
});
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

    const token = jwt.sign({ id: user.id, role: 'admin' }, 'secret_key', { expiresIn: '24h' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  });
});

// Tenant Login (plaintext password)
app.post('/api/tenants/login', (req, res) => {
  const { tenant_id, password } = req.body;

  const query = 'SELECT * FROM tenants WHERE tenant_id = ?';
  db.query(query, [tenant_id], (err, results) => {
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

    const token = jwt.sign({ id: user.id, role: 'tenant' }, 'secret_key', { expiresIn: '24h' });

    res.json({ token, tenant: user });
  });
});

// Create tenant
app.post('/api/tenants', (req, res) => {
  const { name, email, phone, apartment_id, tenant_id, password } = req.body;
  if (!name || !email || !phone || !apartment_id || !tenant_id || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const sql = 'INSERT INTO tenants (name, email, phone, apartment_id, tenant_id, password, status) VALUES (?, ?, ?, ?, ?, ?, "active")';
  db.query(sql, [name, email, phone, apartment_id, tenant_id, password], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to create tenant' });
    res.status(201).json({ id: result.insertId });
  });
});

// Update tenant
app.put('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, apartment_id, status } = req.body;
  const sql = 'UPDATE tenants SET name = ?, email = ?, phone = ?, apartment_id = ?, status = ? WHERE id = ?';
  db.query(sql, [name, email, phone, apartment_id, status, id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update tenant' });
    res.json({ message: 'Tenant updated' });
  });
});

// Delete tenant
app.delete('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM tenants WHERE id = ?';
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete tenant' });
    res.json({ message: 'Tenant deleted' });
  });
});

// Get all apartments
app.get('/api/apartments', (req, res) => {
  const sql = 'SELECT * FROM apartments';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch apartments' });
    res.json(results);
  });
});

// Create apartment
app.post('/api/apartments', (req, res) => {
  const { apartment_number, building, floor, rent_amount } = req.body;
  if (!apartment_number || !building || !floor || !rent_amount) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const sql = 'INSERT INTO apartments (apartment_number, building, floor, rent_amount, status) VALUES (?, ?, ?, ?, "available")';
  db.query(sql, [apartment_number, building, floor, rent_amount], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to create apartment' });
    res.status(201).json({ id: result.insertId });
  });
});

// Update apartment
app.put('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  const { apartment_number, building, floor, rent_amount, status } = req.body;
  const sql = 'UPDATE apartments SET apartment_number = ?, building = ?, floor = ?, rent_amount = ?, status = ? WHERE id = ?';
  db.query(sql, [apartment_number, building, floor, rent_amount, status, id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update apartment' });
    res.json({ message: 'Apartment updated' });
  });
});

// Delete apartment
app.delete('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM apartments WHERE id = ?';
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete apartment' });
    res.json({ message: 'Apartment deleted' });
  });
});

// Get all bills
app.get('/api/bills', (req, res) => {
  const sql = 'SELECT b.*, t.name as tenant_name, t.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id ORDER BY b.created_at DESC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch bills' });
    res.json(results);
  });
});

// Get bills by tenant
app.get('/api/bills/tenant/:tenant_id', (req, res) => {
  const { tenant_id } = req.params;
  const sql = 'SELECT * FROM bills WHERE tenant_id = ? ORDER BY due_date DESC';
  db.query(sql, [tenant_id], (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch bills' });
    res.json(results);
  });
});

// Get overdue bills
app.get('/api/bills/overdue', (req, res) => {
  const sql = 'SELECT b.*, t.name as tenant_name, t.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id WHERE b.status = "pending" AND b.due_date < CURDATE()';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch overdue bills' });
    res.json(results);
  });
});

// Create bill
app.post('/api/bills', (req, res) => {
  const { tenant_id, bill_type, amount, due_date } = req.body;
  if (!tenant_id || !bill_type || !amount || !due_date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const sql = 'INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES (?, ?, ?, ?, "pending")';
  db.query(sql, [tenant_id, bill_type, amount, due_date], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to create bill' });
    res.status(201).json({ id: result.insertId });
  });
});

// Update bill
app.put('/api/bills/:id', (req, res) => {
  const { id } = req.params;
  const { tenant_id, bill_type, amount, due_date, status } = req.body;
  
  if (status) {
    // Update status only
    const sql = 'UPDATE bills SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update bill status' });
      res.json({ message: 'Bill status updated' });
    });
  } else {
    // Update full bill
    const sql = 'UPDATE bills SET tenant_id = ?, bill_type = ?, amount = ?, due_date = ? WHERE id = ?';
    db.query(sql, [tenant_id, bill_type, amount, due_date, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update bill' });
      res.json({ message: 'Bill updated' });
    });
  }
});

// Delete bill
app.delete('/api/bills/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM bills WHERE id = ?';
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete bill' });
    res.json({ message: 'Bill deleted' });
  });
});

// Compatibility: expose legacy IoT routes by delegating to meter (legacy) controller
try {
  const meterController = require('./backend/controllers/meterDeviceController');

  app.put('/api/iot-devices/update-reading/:id', (req, res) => {
    return meterController.updateReading(req, res);
  });

  app.get('/api/iot-devices/billing-history', (req, res) => {
    return meterController.getBillingHistory(req, res);
  });

  app.get('/api/iot-devices/settings/rates', (req, res) => {
    return meterController.getRates(req, res);
  });

  app.post('/api/iot-devices/settings/rates', (req, res) => {
    return meterController.setRates(req, res);
  });
} catch (e) {
  console.warn('Meter controller compatibility routes not loaded:', e && e.message ? e.message : e);
}

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
app.listen(PORT, () => {
  console.log('SMART APARTMENT server running on port ' + PORT);
});
