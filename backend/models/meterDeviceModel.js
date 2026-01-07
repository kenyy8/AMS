const db = require('../config/db');

exports.updateReadingByDeviceId = async (device_id, current_reading, last_reading_date) => {
  // if last_reading_date provided, set it and set last_updated to that timestamp; otherwise use NOW()
  if (last_reading_date) {
    const sql = 'UPDATE `meter_devices` SET `present_reading` = ?, `last_reading_date` = ?, `last_updated` = ? WHERE `device_id` = ?';
    const params = [current_reading, last_reading_date, last_reading_date, device_id];
    const [result] = await db.query(sql, params);
    return result;
  } else {
    const sql = 'UPDATE `meter_devices` SET `present_reading` = ?, `last_reading_date` = ?, `last_updated` = NOW() WHERE `device_id` = ?';
    const params = [current_reading, last_reading_date, device_id];
    const [result] = await db.query(sql, params);
    return result;
  }
};

exports.getDeviceByDeviceId = async (device_id) => {
  const [rows] = await db.query('SELECT d.*, a.apartment_number, a.floor AS apartment_floor, a.building AS apartment_building, t.name AS tenant_name FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id LEFT JOIN tenants t ON t.apartment_id = a.id WHERE d.device_id = ? LIMIT 1', [device_id]);
  return rows && rows[0];
};

/**
 * Insert an entry into meter_history table (legacy name was billing_history)
 */
exports.insertBillingHistory = async (history) => {
  try {
    const sql = `INSERT INTO meter_history
      (tenant_name, apartment_number, device_id, meter_type, previous_reading, present_reading, consumption, rate, total_cost, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      history.tenant_name || null,
      history.apartment_number || null,
      history.device_id,
      history.meter_type,
      history.previous_reading || 0,
      history.present_reading || 0,
      history.consumption || 0,
      history.rate || 0,
      history.total_cost || 0,
      history.recorded_at || new Date()
    ];
    const [res] = await db.query(sql, params);
    return res.insertId;
  } catch (e) {
    console.warn('insertBillingHistory failed, attempting to create table or skipping insertion:', e && e.message);
    try {
      const createSql = `CREATE TABLE IF NOT EXISTS meter_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_name VARCHAR(150),
        apartment_number VARCHAR(50),
        device_id VARCHAR(100),
        meter_type ENUM('water_meter','electricity_meter') NOT NULL,
        previous_reading DECIMAL(12,3) DEFAULT 0,
        present_reading DECIMAL(12,3) DEFAULT 0,
        consumption DECIMAL(12,3) DEFAULT 0,
        rate DECIMAL(12,3) DEFAULT 0,
        total_cost DECIMAL(12,2) DEFAULT 0,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`;
      await db.query(createSql);
      // retry once
      const sql = `INSERT INTO meter_history
        (tenant_name, apartment_number, device_id, meter_type, previous_reading, present_reading, consumption, rate, total_cost, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        history.tenant_name || null,
        history.apartment_number || null,
        history.device_id,
        history.meter_type,
        history.previous_reading || 0,
        history.present_reading || 0,
        history.consumption || 0,
        history.rate || 0,
        history.total_cost || 0,
        history.recorded_at || new Date()
      ];
      const [res2] = await db.query(sql, params);
      return res2.insertId;
    } catch (inner) {
      console.error('Failed to create meter_history table or insert:', inner && inner.message ? inner.message : inner);
      // don't throw further; history is best-effort
      return null;
    }
  }
};

/**
 * Insert an entry into meter_history table (stores reading changes). This is separate from billing_history.
 */
exports.insertMeterHistory = async (history) => {
  try {
    const sql = `INSERT INTO meter_history
      (tenant_name, apartment_number, device_id, meter_type, previous_reading, present_reading, consumption, rate, total_cost, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      history.tenant_name || null,
      history.apartment_number || null,
      history.device_id,
      history.meter_type,
      history.previous_reading || 0,
      history.present_reading || 0,
      history.consumption || 0,
      history.rate || 0,
      history.total_cost || 0,
      history.recorded_at || new Date()
    ];
    const [res] = await db.query(sql, params);
    return res.insertId;
  } catch (e) {
    console.warn('insertMeterHistory failed, attempting to create table or skipping insertion:', e && e.message);
    try {
      const createSql = `CREATE TABLE IF NOT EXISTS meter_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_name VARCHAR(150),
        apartment_number VARCHAR(50),
        device_id VARCHAR(100),
        meter_type VARCHAR(100),
        previous_reading DECIMAL(12,3) DEFAULT 0,
        present_reading DECIMAL(12,3) DEFAULT 0,
        consumption DECIMAL(12,3) DEFAULT 0,
        rate DECIMAL(12,3) DEFAULT 0,
        total_cost DECIMAL(12,2) DEFAULT 0,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`;
      await db.query(createSql);
      // retry once
      const sql = `INSERT INTO meter_history
        (tenant_name, apartment_number, device_id, meter_type, previous_reading, present_reading, consumption, rate, total_cost, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        history.tenant_name || null,
        history.apartment_number || null,
        history.device_id,
        history.meter_type,
        history.previous_reading || 0,
        history.present_reading || 0,
        history.consumption || 0,
        history.rate || 0,
        history.total_cost || 0,
        history.recorded_at || new Date()
      ];
      const [res2] = await db.query(sql, params);
      return res2.insertId;
    } catch (inner) {
      console.error('Failed to create meter_history table or insert:', inner && inner.message ? inner.message : inner);
      // don't throw further; history is best-effort
      return null;
    }
  }
};

/**
 * Update device readings by internal id: move present->previous, set new present, recalc consumption and total_cost
 */
exports.updateReadingById = async (id, newPresentReading, clientTimestamp) => {
  try {
    // Validate id
    if (!id) throw new Error('Invalid device id');

    // Fetch current device
  const [rows] = await db.query('SELECT d.*, a.apartment_number, t.name as tenant_name FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id LEFT JOIN tenants t ON t.apartment_id = a.id WHERE d.id = ?', [id]);
    const device = rows && rows[0];
    if (!device) throw new Error('Device not found');

    // determine rate: prefer device.rate, otherwise fallback to global settings
    const settings = await exports.getSettings();
  const deviceRate = (device.rate !== undefined && device.rate !== null && Number(device.rate) > 0) ? Number(device.rate) : null;
  const rate = deviceRate || (settings ? (device.meter_type && device.meter_type.toLowerCase().includes('electric') ? Number(settings.electricity_rate) : Number(settings.water_rate)) : 0);

  const previous = Number(device.present_reading || 0);
  const present = Number(newPresentReading || 0);
  const consumption = Number((present - previous).toFixed(3));
  const total_cost = Number((consumption * rate).toFixed(2));

  // If client provided a timestamp, attempt to use it for last_updated
  if (clientTimestamp) {
    const ts = new Date(clientTimestamp);
    if (!isNaN(ts.getTime())) {
      const updateSql = 'UPDATE `meter_devices` SET `previous_reading` = ?, `present_reading` = ?, `consumption` = ?, `total_cost` = ?, `last_updated` = ? WHERE `id` = ?';
      const params = [previous, present, consumption, total_cost, ts, id];
      await db.query(updateSql, params);
    } else {
      const updateSql = 'UPDATE `meter_devices` SET `previous_reading` = ?, `present_reading` = ?, `consumption` = ?, `total_cost` = ?, `last_updated` = NOW() WHERE `id` = ?';
      const params = [previous, present, consumption, total_cost, id];
      await db.query(updateSql, params);
    }
  } else {
    const updateSql = 'UPDATE `meter_devices` SET `previous_reading` = ?, `present_reading` = ?, `consumption` = ?, `total_cost` = ?, `last_updated` = NOW() WHERE `id` = ?';
    const params = [previous, present, consumption, total_cost, id];
    await db.query(updateSql, params);
  }

    // return the updated row
  const [updatedRows] = await db.query('SELECT d.*, a.apartment_number FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id WHERE d.id = ?', [id]);
    return { device: updatedRows[0], history: { tenant_name: device.tenant_name, apartment_number: device.apartment_number, device_id: device.device_id, meter_type: device.meter_type, previous_reading: previous, present_reading: present, consumption, rate, total_cost } };
  } catch (err) {
    console.error('updateReadingById error:', err && err.message ? err.message : err);
    throw err;
  }
};

exports.getSettings = async () => {
  try {
    const [rows] = await db.query('SELECT * FROM settings ORDER BY id LIMIT 1');
    return rows && rows[0];
  } catch (e) {
    console.warn('getSettings failed, attempting to create settings table or returning defaults:', e && e.message);
    // attempt to create table if missing
    try {
      const createSql = `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        electricity_rate DECIMAL(12,3) DEFAULT 0,
        water_rate DECIMAL(12,3) DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`;
      await db.query(createSql);
      // ensure a default row exists
      const [r2] = await db.query('SELECT * FROM settings ORDER BY id LIMIT 1');
      if (!r2 || r2.length === 0) {
        await db.query('INSERT INTO settings (electricity_rate, water_rate) VALUES (?, ?)', [14.66, 60.00]);
      }
      const [rowsNew] = await db.query('SELECT * FROM settings ORDER BY id LIMIT 1');
      return rowsNew && rowsNew[0];
    } catch (inner) {
      console.error('Failed to create settings table or default row:', inner && inner.message);
      // return safe defaults rather than throwing
      return { electricity_rate: 0, water_rate: 0 };
    }
  }
};

exports.setSettings = async (updates) => {
  // Upsert into single settings row; handle missing table gracefully
  try {
    const s = await exports.getSettings();
    if (!s) {
      const sql = 'INSERT INTO settings (electricity_rate, water_rate) VALUES (?, ?)';
      await db.query(sql, [updates.electricity_rate || 0, updates.water_rate || 0]);
      return await exports.getSettings();
    }
    const sql = 'UPDATE settings SET electricity_rate = ?, water_rate = ?, updated_at = NOW() WHERE id = ?';
    await db.query(sql, [updates.electricity_rate || s.electricity_rate, updates.water_rate || s.water_rate, s.id]);
    return await exports.getSettings();
  } catch (e) {
    console.warn('setSettings encountered error, attempting to create settings table and retry:', e && e.message);
    try {
      const createSql = `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        electricity_rate DECIMAL(12,3) DEFAULT 0,
        water_rate DECIMAL(12,3) DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`;
      await db.query(createSql);
      await db.query('INSERT INTO settings (electricity_rate, water_rate) VALUES (?, ?)', [updates.electricity_rate || 0, updates.water_rate || 0]);
      return await exports.getSettings();
    } catch (inner) {
      console.error('Failed to create settings table during setSettings:', inner && inner.message);
      return { electricity_rate: 0, water_rate: 0 };
    }
  }
};

exports.getBillingHistory = async ({ tenant, from, to, limit = 200 }) => {
  const where = [];
  const params = [];
  if (tenant) { where.push('(tenant_name LIKE ? OR apartment_number LIKE ?)'); params.push(`%${tenant}%`, `%${tenant}%`); }
  if (from) { where.push('recorded_at >= ?'); params.push(from); }
  if (to) { where.push('recorded_at <= ?'); params.push(to); }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const sql = `SELECT * FROM meter_history ${whereSql} ORDER BY recorded_at DESC LIMIT ?`;
  params.push(Number(limit));
  const [rows] = await db.query(sql, params);
  return rows;
};

exports.deleteMeterHistoryById = async (id) => {
  try {
    const [res] = await db.query('DELETE FROM meter_history WHERE id = ?', [id]);
    return res;
  } catch (e) {
    console.error('deleteMeterHistoryById error:', e && e.message ? e.message : e);
    throw e;
  }
};

exports.getAllDevices = async () => {
  const [rows] = await db.query('SELECT d.*, a.apartment_number, a.floor AS apartment_floor, a.building AS apartment_building FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id ORDER BY d.id DESC');
  return rows;
};

exports.createDevice = async (device) => {
  const { device_id, meter_type, type, apartment_id, previous_reading, present_reading, consumption, rate, total_cost } = device;
  const sql = 'INSERT INTO `meter_devices` (`device_id`,`meter_type`,`type`,`apartment_id`,`previous_reading`,`present_reading`,`consumption`,`rate`,`total_cost`,`last_updated`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())';
  const params = [device_id, meter_type, type, apartment_id || null, previous_reading || 0, present_reading || 0, consumption || 0, rate || 0, total_cost || 0];
  const [result] = await db.query(sql, params);
  const insertId = result.insertId;
  const [rows] = await db.query('SELECT d.*, a.apartment_number, a.floor AS apartment_floor, a.building AS apartment_building FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id WHERE d.id = ?', [insertId]);
  return rows[0];
};

exports.updateDeviceById = async (id, changes) => {
  const keys = Object.keys(changes || {});
  if (keys.length === 0) return null;
  // If client provided last_updated, include it; otherwise set last_updated = NOW()
  const hasLastUpdated = keys.includes('last_updated');
  const sets = keys.map(k => `\`${k}\` = ?`).join(', ');
  const params = keys.map(k => changes[k]);
  let sql;
  if (hasLastUpdated) {
    sql = 'UPDATE `meter_devices` SET ' + sets + ' WHERE `id` = ?';
  } else {
    sql = 'UPDATE `meter_devices` SET ' + sets + ', `last_updated` = NOW() WHERE `id` = ?';
  }
  params.push(id);
  const [res] = await db.query(sql, params);
  const [rows] = await db.query('SELECT d.*, a.apartment_number FROM `meter_devices` d LEFT JOIN `apartments` a ON d.apartment_id = a.id WHERE d.id = ?', [id]);
  return rows[0];
};

exports.deleteDeviceById = async (id) => {
  const [res] = await db.query('DELETE FROM `meter_devices` WHERE `id` = ?', [id]);
  return res;
};

