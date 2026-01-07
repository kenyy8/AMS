const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tenant = require('../models/tenantModel');
const QRCode = require('qrcode');
const db = require('../config/db');

exports.login = async (req, res) => {
  const { tenant_id } = req.body;
  const tenant = await Tenant.findByTenantId(tenant_id);
  if (!tenant) return res.status(400).json({ message: 'Invalid tenant ID' });

  const token = jwt.sign({ id: tenant.id, tenant_id: tenant.tenant_id, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, tenant });
};

exports.create = async (req, res) => {
  try {
    const { name, email, phone, apartment_id, move_in_date } = req.body;
    const id = await Tenant.create(name, email, phone, apartment_id, move_in_date || null);
    // fetch the created tenant row
    const [rows] = await db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [id]);
    const tenant = rows && rows[0] ? rows[0] : null;
    // Generate QR code for the tenant
    const qrData = {
      tenant_id: tenant ? tenant.tenant_id : null,
      name: tenant ? tenant.name : name,
      apartment_id: tenant ? tenant.apartment_id : apartment_id,
      portal_url: '/tenant/'
    };
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
    res.status(201).json({ tenant, qr_code: qrCode });
  } catch (err) {
    console.error('Error creating tenant:', err);
    res.status(500).json({ message: 'Failed to create tenant' });
  }
};

exports.getAll = async (req, res) => {
  const tenants = await Tenant.getAll();
  res.json(tenants);
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { tenant_id, name, email, phone, apartment_id, move_in_date } = req.body;
  await Tenant.update(id, tenant_id, name, email, phone, apartment_id, move_in_date);
  // return updated row
  const [rows] = await db.query('SELECT t.*, a.apartment_number FROM tenants t LEFT JOIN apartments a ON t.apartment_id = a.id WHERE t.id = ?', [id]);
  res.json(rows && rows[0] ? rows[0] : { message: 'Tenant updated' });
};

exports.delete = async (req, res) => {
  const { id } = req.params;
  await Tenant.delete(id);
  res.json({ message: 'Tenant deleted' });
};

exports.getMe = async (req, res) => {
  const tenant = await Tenant.findByTenantId(req.user.tenant_id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json({ 
    tenant_id: tenant.tenant_id, 
    name: tenant.name, 
    email: tenant.email, 
    phone: tenant.phone, 
    apartment_id: tenant.apartment_id 
  });
};

exports.getByQRCode = async (req, res) => {
  try {
    const { qr_data } = req.body;
    const data = JSON.parse(qr_data);
    const tenant = await Tenant.findByTenantId(data.tenant_id);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    res.json({ tenant, portal_url: data.portal_url });
  } catch (err) {
    console.error('Error processing QR code:', err);
    res.status(400).json({ message: 'Invalid QR code data' });
  }
};

exports.generateQRCode = async (req, res) => {
  try {
    const { tenant_id } = req.params;
    const tenant = await Tenant.findByTenantId(tenant_id);
    
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    const qrData = {
      tenant_id: tenant.tenant_id,
      name: tenant.name,
      apartment_id: tenant.apartment_id,
      portal_url: '/tenant/'
    };
    
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
    res.json({ qr_code: qrCode, tenant_data: qrData });
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ message: 'Failed to generate QR code' });
  }
};
