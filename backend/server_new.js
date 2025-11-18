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
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

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
        res.status(201).json({ id: result.insertId });
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
    res.status(201).json({ id: result.insertId });
  });
});

app.put('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, apartment_id, status } = req.body;
  const doUpdate = () => {
    const sql = 'UPDATE tenants SET name = ?, email = ?, phone = ?, apartment_id = ?, status = ? WHERE id = ?';
    db.query(sql, [name || null, email || null, phone || null, apartment_id || null, status || 'active', id], (err) => {
      console.log(err);
      if (err) return res.status(500).json({ message: 'Failed to update tenant' });
      res.json({ message: 'Tenant updated' });
    });
  };
  if (apartment_id && (status || 'active') === 'active') {
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

app.delete('/api/tenants/:id', (req, res) => {
  const { id } = req.params;
  // Try deleting related rows first (best-effort)
  const deleteBillsSql = 'DELETE FROM bills WHERE tenant_id = ?';
  db.query(deleteBillsSql, [id], (/*err1*/) => {
    const sql = 'DELETE FROM tenants WHERE id = ?';
    db.query(sql, [id], (err, result) => {
      if (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
          return res.status(409).json({ message: 'Cannot delete tenant: referenced by other records' });
        }
        return res.status(500).json({ message: 'Failed to delete tenant' });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Tenant not found' });
      res.json({ message: 'Tenant deleted' });
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

app.post('/api/apartments', (req, res) => {
  const { apartment_number, floor, building, rent_amount, status } = req.body;
  if (!apartment_number) return res.status(400).json({ message: 'apartment_number is required' });
  const sql = 'INSERT INTO apartments (apartment_number, floor, building, rent_amount, status) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [apartment_number, floor || null, building || null, rent_amount || 0, status || 'vacant'], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'apartment_number already exists' });
      return res.status(500).json({ message: 'Failed to create apartment' });
    }
    res.status(201).json({ id: result.insertId });
  });
});

app.put('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  const { apartment_number, floor, building, rent_amount, status } = req.body;
  const sql = 'UPDATE apartments SET apartment_number = ?, floor = ?, building = ?, rent_amount = ?, status = ? WHERE id = ?';
  db.query(sql, [apartment_number, floor || null, building || null, rent_amount || 0, status || 'vacant', id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update apartment' });
    res.json({ message: 'Apartment updated' });
  });
});

app.delete('/api/apartments/:id', (req, res) => {
  const { id } = req.params;
  // Unassign tenants first
  db.query('UPDATE tenants SET apartment_id = NULL WHERE apartment_id = ?', [id], () => {
    db.query('DELETE FROM iot_devices WHERE apartment_id = ?', [id], () => {
      db.query('DELETE FROM apartments WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Failed to delete apartment' });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Apartment not found' });
        res.json({ message: 'Apartment deleted' });
      });
    });
  });
});

// Minimal API: IoT Devices
app.get('/api/iot-devices', (req, res) => {
  const sql = `
    SELECT d.*, a.apartment_number 
    FROM iot_devices d
    LEFT JOIN apartments a ON d.apartment_id = a.id
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch devices' });
    res.json(rows);
  });
});

app.post('/api/iot-devices', (req, res) => {
  const { device_id, type, apartment_id, current_reading } = req.body;
  if (!device_id) return res.status(400).json({ message: 'device_id is required' });
  const sql = 'INSERT INTO iot_devices (device_id, type, apartment_id, current_reading, last_updated) VALUES (?, ?, ?, ?, NOW())';
  db.query(sql, [device_id, type || null, apartment_id || null, current_reading || 0], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'device_id already exists' });
      return res.status(500).json({ message: 'Failed to create device' });
    }
    res.status(201).json({ id: result.insertId });
  });
});

app.put('/api/iot-devices/:id', (req, res) => {
  const { id } = req.params;
  const { type, apartment_id, current_reading } = req.body;
  const sql = 'UPDATE iot_devices SET type = ?, apartment_id = ?, current_reading = ?, last_updated = NOW() WHERE id = ?';
  db.query(sql, [type || null, apartment_id || null, current_reading || 0, id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update device' });
    res.json({ message: 'Device updated' });
  });
});

app.delete('/api/iot-devices/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM iot_devices WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to delete device' });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Device not found' });
    res.json({ message: 'Device deleted' });
  });
});

// Enhanced API: Bills
app.get('/api/bills', (req, res) => {
  const { tenantId } = req.query;
  const params = [];
  let where = '';
  if (tenantId) {
    where = 'WHERE b.tenant_id = ?';
    params.push(tenantId);
  }
  const sql = `
    SELECT b.*, t.name AS tenant_name 
    FROM bills b
    LEFT JOIN tenants t ON b.tenant_id = t.id 
    ${where}
    ORDER BY b.due_date DESC
  `;
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch bills' });
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
  const sql = 'INSERT INTO bills (tenant_id, bill_type, amount, due_date, status) VALUES (?, ?, ?, ?, "pending")';
  db.query(sql, [tenant_id, bill_type, amount, due_date], (err, result) => {
    if (err) return res.status(500).json({ message: 'Failed to create bill' });
    res.status(201).json({ id: result.insertId });
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
    const sql = 'UPDATE bills SET tenant_id = ?, bill_type = ?, amount = ?, due_date = ? WHERE id = ?';
    db.query(sql, [tenant_id, bill_type, amount, due_date, id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to update bill' });
      res.json({ message: 'Bill updated' });
    });
  }
});

// Update bill status only
app.patch('/api/bills/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const sql = 'UPDATE bills SET status = ? WHERE id = ?';
  db.query(sql, [status, id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to update bill status' });
    res.json({ message: 'Bill status updated' });
  });
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

// QR Code Routes
// Get QR code data for a specific tenant
app.get("/api/qr-codes/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;
    const sql = "SELECT * FROM tenants WHERE tenant_id = ?";
    db.query(sql, [tenantId], (err, rows) => {
      if (err) {
        console.error("Error fetching tenant QR data:", err);
        return res.status(500).json({ message: "Failed to fetch tenant data" });
      }
      
      if (rows.length === 0) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      const tenant = rows[0];
      const qrData = {
        tenant_id: tenant.tenant_id,
        name: tenant.name,
        apartment_id: tenant.apartment_id,
        status: tenant.status
      };
      
      res.json(qrData);
    });
  } catch (err) {
    console.error("Error fetching tenant QR data:", err);
    res.status(500).json({ message: "Failed to fetch tenant data" });
  }
});

// Generate QR code for IoT device
app.post("/api/qr-codes/generate", async (req, res) => {
  try {
    const { device_id } = req.body;
    
    if (!device_id) {
      return res.status(400).json({ message: "Device ID is required" });
    }
    
    // Check if device exists
    const sql = "SELECT * FROM iot_devices WHERE device_id = ?";
    db.query(sql, [device_id], (err, rows) => {
      if (err) {
        console.error("Error checking device:", err);
        return res.status(500).json({ message: "Failed to check device" });
      }
      
      if (rows.length === 0) {
        return res.status(404).json({ message: "IoT device not found" });
      }
      
      const device = rows[0];
      const qrData = {
        device_id: device.device_id,
        type: device.type,
        apartment_id: device.apartment_id,
        current_reading: device.current_reading,
        last_updated: device.last_updated
      };
      
      res.json({
        message: "QR code data generated",
        qr_data: qrData,
        qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify(qrData))}`
      });
    });
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.status(500).json({ message: "Failed to generate QR code" });
  }
});

// Scan QR code and get device info
app.post("/api/qr-codes/scan", async (req, res) => {
  try {
    const { qr_data } = req.body;
    
    if (!qr_data) {
      return res.status(400).json({ message: "QR data is required" });
    }
    
    let deviceData;
    try {
      deviceData = typeof qr_data === "string" ? JSON.parse(qr_data) : qr_data;
    } catch (parseErr) {
      // If not JSON, treat as simple device ID
      deviceData = { device_id: qr_data };
    }
    
    // Get device information
    const sql = "SELECT d.*, a.apartment_number FROM iot_devices d LEFT JOIN apartments a ON d.apartment_id = a.id WHERE d.device_id = ?";
    db.query(sql, [deviceData.device_id], (err, rows) => {
      if (err) {
        console.error("Error scanning QR code:", err);
        return res.status(500).json({ message: "Failed to scan QR code" });
      }
      
      if (rows.length === 0) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      const device = rows[0];
      
      res.json({
        message: "Device scanned successfully",
        device: {
          id: device.id,
          device_id: device.device_id,
          type: device.type,
          apartment_id: device.apartment_id,
          apartment_number: device.apartment_number,
          current_reading: device.current_reading,
          last_updated: device.last_updated
        }
      });
    });
  } catch (err) {
    console.error("Error scanning QR code:", err);
    res.status(500).json({ message: "Failed to scan QR code" });
  }
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
app.listen(PORT, () => {
  console.log('Smart Apartment Management Server running on port ' + PORT);

 
 / /   Q R   C o d e   S c a n   E n d p o i n t   f o r   I o T   D e v i c e s 
 a p p . p o s t ( " / a p i / i o t - d e v i c e s / s c a n " ,   a s y n c   ( r e q ,   r e s )   = >   { 
     c o n s t   {   d e v i c e _ i d   }   =   r e q . b o d y ; 
 
     i f   ( ! d e v i c e _ i d )   { 
         r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( {   e r r o r :   " N o   d e v i c e _ i d   p r o v i d e d "   } ) ; 
     } 
 
     t r y   { 
         c o n s t   s q l   =   " U P D A T E   i o t _ d e v i c e s   S E T   l a s t _ u p d a t e d   =   N O W ( )   W H E R E   d e v i c e _ i d   =   ? " ; 
         d b . q u e r y ( s q l ,   [ d e v i c e _ i d ] ,   ( e r r ,   r e s u l t )   = >   { 
             i f   ( e r r )   { 
                 c o n s o l e . e r r o r ( " D a t a b a s e   e r r o r : " ,   e r r ) ; 
                 r e t u r n   r e s . s t a t u s ( 5 0 0 ) . j s o n ( {   e r r o r :   " D a t a b a s e   e r r o r "   } ) ; 
             } 
 
             i f   ( r e s u l t . a f f e c t e d R o w s   = = =   0 )   { 
                 r e t u r n   r e s . s t a t u s ( 4 0 4 ) . j s o n ( {   e r r o r :   " D e v i c e   n o t   f o u n d "   } ) ; 
             } 
 
             r e s . j s o n ( {   
                 m e s s a g e :   " D e v i c e   s c a n n e d   s u c c e s s f u l l y " , 
                 d e v i c e _ i d :   d e v i c e _ i d , 
                 t i m e s t a m p :   n e w   D a t e ( ) . t o I S O S t r i n g ( ) 
             } ) ; 
         } ) ; 
     }   c a t c h   ( e r r )   { 
         c o n s o l e . e r r o r ( " S e r v e r   e r r o r : " ,   e r r ) ; 
         r e s . s t a t u s ( 5 0 0 ) . j s o n ( {   e r r o r :   " S e r v e r   e r r o r "   } ) ; 
     } 
 } ) ;  
 