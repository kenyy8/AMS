const jwt = require('jsonwebtoken');
const Admin = require('../models/propertyManagerModel');
const bcrypt = require('bcryptjs');
const { passwordMatches } = require('../middleware/security');

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findByEmail(email);
  if (!admin) return res.status(400).json({ message: 'Invalid credentials' });

  if (!passwordMatches(password, admin.password)) return res.status(400).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: admin.id, role: 'manager' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
};

exports.create = async (req, res) => {
  const { email, password } = req.body;
  const id = await Admin.create(email, await bcrypt.hash(password, 12), req.body.name || email);
  res.status(201).json({ id, email });
};

exports.getAll = async (req, res) => {
  const admins = await Admin.getAll();
  res.json(admins);
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;
  await Admin.update(id, email, await bcrypt.hash(password, 12));
  res.json({ message: 'Admin updated' });
};

exports.delete = async (req, res) => {
  const { id } = req.params;
  await Admin.delete(id);
  res.json({ message: 'Admin deleted' });
};
