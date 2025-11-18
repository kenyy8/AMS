// Bulk create bills
exports.bulkCreate = async (req, res) => {
  try {
    const bills = req.body;
    if (!Array.isArray(bills)) {
      return res.status(400).json({ message: 'Request body must be an array of bills' });
    }
    const results = [];
    for (const bill of bills) {
      const { tenant_id, bill_type, amount, due_date } = bill;
      const id = await Bill.create(tenant_id, bill_type, amount, due_date);
      results.push({ id, tenant_id, bill_type, amount, due_date });
    }
    res.status(201).json(results);
  } catch (err) {
    console.error('Error bulk creating bills:', err);
    res.status(500).json({ message: 'Failed to bulk create bills' });
  }
};
const Bill = require('../models/billModel');
const Tenant = require('../models/tenantModel');

exports.create = async (req, res) => {
  try {
    const { tenant_id, bill_type, amount, due_date } = req.body;
    const id = await Bill.create(tenant_id, bill_type, amount, due_date);
    res.status(201).json({ id, tenant_id, bill_type, amount, due_date });
  } catch (err) {
    console.error('Error creating bill:', err);
    res.status(500).json({ message: 'Failed to create bill' });
  }
};

exports.getByTenantId = async (req, res) => {
  const { tenant_id } = req.params;
  const bills = await Bill.getByTenant(tenant_id);
  res.json(bills);
};

exports.getAll = async (req, res) => {
  const bills = await Bill.getAll();
  res.json(bills);
};

exports.getPending = async (req, res) => {
  const bills = await Bill.getPending();
  res.json(bills);
};

exports.getOverdue = async (req, res) => {
  const bills = await Bill.getOverdue();
  res.json(bills);
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  await Bill.updateStatus(id, status);
  res.json({ message: 'Bill status updated' });
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id, bill_type, amount, due_date } = req.body;
    await Bill.update(id, tenant_id, bill_type, amount, due_date);
    res.json({ message: 'Bill updated successfully' });
  } catch (err) {
    console.error('Error updating bill:', err);
    res.status(500).json({ message: 'Failed to update bill' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await Bill.delete(id);
    res.json({ message: 'Bill deleted successfully' });
  } catch (err) {
    console.error('Error deleting bill:', err);
    res.status(500).json({ message: 'Failed to delete bill' });
  }
};

exports.createRentBill = async (req, res) => {
  try {
    const { tenant_id, amount, due_date } = req.body;
    const id = await Bill.createRentBill(tenant_id, amount, due_date);
    res.status(201).json({ id, tenant_id, bill_type: 'rent', amount, due_date });
  } catch (err) {
    console.error('Error creating rent bill:', err);
    res.status(500).json({ message: 'Failed to create rent bill' });
  }
};

exports.createWaterBill = async (req, res) => {
  try {
    const { tenant_id, amount, due_date } = req.body;
    const id = await Bill.createWaterBill(tenant_id, amount, due_date);
    res.status(201).json({ id, tenant_id, bill_type: 'water', amount, due_date });
  } catch (err) {
    console.error('Error creating water bill:', err);
    res.status(500).json({ message: 'Failed to create water bill' });
  }
};

exports.createElectricityBill = async (req, res) => {
  try {
    const { tenant_id, amount, due_date } = req.body;
    const id = await Bill.createElectricityBill(tenant_id, amount, due_date);
    res.status(201).json({ id, tenant_id, bill_type: 'electricity', amount, due_date });
  } catch (err) {
    console.error('Error creating electricity bill:', err);
    res.status(500).json({ message: 'Failed to create electricity bill' });
  }
};

exports.getMonthlyBills = async (req, res) => {
  try {
    const { tenant_id, month, year } = req.params;
    const bills = await Bill.getMonthlyBills(tenant_id, month, year);
    res.json(bills);
  } catch (err) {
    console.error('Error getting monthly bills:', err);
    res.status(500).json({ message: 'Failed to get monthly bills' });
  }
};
