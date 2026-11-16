const db = require('../config/db');

exports.findByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM property_managers WHERE email = ?', [email]);
  return rows[0];
};

exports.create = async (email, password, name = email) => {
  const [result] = await db.query('INSERT INTO property_managers (email, password, name) VALUES (?, ?, ?)', [email, password, name]);
  return result.insertId;
};

exports.getAll = async () => {
  const [rows] = await db.query('SELECT id, email, password FROM property_managers');
  return rows;
};

exports.update = async (id, email, password) => {
  await db.query('UPDATE property_managers SET email = ?, password = ? WHERE id = ?', [email, password, id]);
};

exports.delete = async (id) => {
  await db.query('DELETE FROM property_managers WHERE id = ?', [id]);
};
