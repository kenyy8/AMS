const db = require('../config/db');

exports.create = async (tenant_id, bill_type, amount, due_date, status = 'pending') => {
  try {
    const [result] = await db.query(
      'INSERT INTO bills (tenant_id, bill_type, amount, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [tenant_id, bill_type, amount, due_date, status]
    );
    return result.insertId;
  } catch (err) {
    console.error('Error creating bill:', err);
    throw err;
  }
};

exports.getAll = async () => {
  const [rows] = await db.query('SELECT b.*, t.name as tenant_name, t.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id');
  return rows;
};

exports.getByTenant = async (tenant_id) => {
  const [rows] = await db.query('SELECT * FROM bills WHERE tenant_id = ? ORDER BY due_date DESC', [tenant_id]);
  return rows;
};

exports.getPending = async () => {
  const [rows] = await db.query('SELECT b.*, t.name as tenant_name, t.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id WHERE b.status = "pending"');
  return rows;
};

exports.getOverdue = async () => {
  const [rows] = await db.query('SELECT b.*, t.name as tenant_name, t.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id WHERE b.status = "pending" AND b.due_date < CURDATE()');
  return rows;
};

exports.updateStatus = async (id, status) => {
  await db.query('UPDATE bills SET status = ? WHERE id = ?', [status, id]);
};

exports.update = async (id, tenant_id, bill_type, amount, due_date) => {
  try {
    await db.query(
      'UPDATE bills SET tenant_id = ?, bill_type = ?, amount = ?, due_date = ? WHERE id = ?',
      [tenant_id, bill_type, amount, due_date, id]
    );
  } catch (err) {
    console.error('Error updating bill:', err);
    throw err;
  }
};

exports.delete = async (id) => {
  try {
    await db.query('DELETE FROM bills WHERE id = ?', [id]);
  } catch (err) {
    console.error('Error deleting bill:', err);
    throw err;
  }
};

exports.getMonthlyBills = async (tenant_id, month, year) => {
  const [rows] = await db.query('SELECT * FROM bills WHERE tenant_id = ? AND MONTH(due_date) = ? AND YEAR(due_date) = ?', [tenant_id, month, year]);
  return rows;
};

exports.createRentBill = async (tenant_id, amount, due_date) => {
  return await this.create(tenant_id, 'rent', amount, due_date);
};

exports.createWaterBill = async (tenant_id, amount, due_date) => {
  return await this.create(tenant_id, 'water', amount, due_date);
};

exports.createElectricityBill = async (tenant_id, amount, due_date) => {
  return await this.create(tenant_id, 'electricity', amount, due_date);
};
