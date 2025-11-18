const db = require('../config/db');

exports.create = async (apartment_number, floor, building, rent_amount, status = 'available') => {
  try {
    const [result] = await db.query(
      'INSERT INTO apartments (apartment_number, floor, building, rent_amount, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [apartment_number, floor, building, rent_amount, status]
    );
    return result.insertId;
  } catch (err) {
    console.error('Error creating apartment:', err);
    throw err;
  }
};

exports.getAll = async () => {
  const [rows] = await db.query('SELECT * FROM apartments ORDER BY apartment_number');
  return rows;
};

exports.getById = async (id) => {
  const [rows] = await db.query('SELECT * FROM apartments WHERE id = ?', [id]);
  return rows[0];
};

exports.getByNumber = async (apartment_number) => {
  const [rows] = await db.query('SELECT * FROM apartments WHERE apartment_number = ?', [apartment_number]);
  return rows[0];
};

exports.update = async (id, apartment_number, floor, building, rent_amount, status) => {
  await db.query(
    'UPDATE apartments SET apartment_number = ?, floor = ?, building = ?, rent_amount = ?, status = ? WHERE id = ?',
    [apartment_number, floor, building, rent_amount, status, id]
  );
};

exports.delete = async (id) => {
  await db.query('DELETE FROM apartments WHERE id = ?', [id]);
};

exports.getAvailable = async () => {
  const [rows] = await db.query('SELECT * FROM apartments WHERE status = "available"');
  return rows;
};

exports.getOccupied = async () => {
  const [rows] = await db.query('SELECT * FROM apartments WHERE status = "occupied"');
  return rows;
};
