const MeterDevices = require('../models/meterDeviceModel');
const fs = require('fs');
const path = require('path');
const localFile = path.join(__dirname, '../../config/local_devices.json');

function ensureLocalFile() {
  const dir = path.dirname(localFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(localFile)) fs.writeFileSync(localFile, JSON.stringify([], null, 2));
}

exports.getAll = async (req, res) => {
  try {
  const devices = await MeterDevices.getAllDevices();

    // Group by tenant/apartment to find pairs (electricity + water)
    const grouped = {};
    devices.forEach(d => {
      const key = (d.tenant_name || d.apartment_number || 'unknown');
      if (!grouped[key]) grouped[key] = { tenant_name: d.tenant_name || null, apartment_number: d.apartment_number || null, devices: [] };
      grouped[key].devices.push(d);
    });

    // create pairs array for tenants who have both meters
    const pairs = [];
    Object.values(grouped).forEach(g => {
      const hasElec = g.devices.find(x => x.meter_type && x.meter_type.toLowerCase().includes('electric'));
      const hasWater = g.devices.find(x => x.meter_type && x.meter_type.toLowerCase().includes('water'));
      if (hasElec && hasWater) {
        pairs.push({ tenant_name: g.tenant_name, apartment_number: g.apartment_number, electricity: hasElec, water: hasWater });
      }
    });

    return res.json({ devices, pairs });
  } catch (e) {
  console.error('getAll devices DB error, falling back to local file:', e);
    try {
      ensureLocalFile();
      const raw = fs.readFileSync(localFile, 'utf8');
      const data = JSON.parse(raw || '[]');
      return res.json(data);
    } catch (fe) {
      console.error('Failed to read local devices file:', fe);
      return res.status(500).json({ message: 'Failed to fetch devices' });
    }
  }
};

exports.postReading = async (req, res) => {
  try {
    const { deviceId, reading, timestamp } = req.body;
  await MeterDevices.updateReadingByDeviceId(deviceId, reading, timestamp || new Date());
    res.json({ message: 'Reading updated' });
  } catch (e) {
    console.error('postReading error:', e);
    res.status(500).json({ message: 'Failed to update reading' });
  }
};

/**
 * Update reading by device internal id (moves present->previous, recalculates, stores history)
 */
exports.updateReading = async (req, res) => {
  try {
    const id = req.params.id;
    const { presentReading } = req.body;
    if (presentReading === undefined || presentReading === null) return res.status(400).json({ message: 'presentReading is required' });

    const parsed = Number(presentReading);
    if (!Number.isFinite(parsed)) return res.status(400).json({ message: 'presentReading must be a number' });

    // perform update
    let device, history;
    try {
  const result = await MeterDevices.updateReadingById(id, parsed);
      device = result.device;
      history = result.history;
    } catch (innerErr) {
      console.error('updateReading model error:', innerErr && innerErr.message ? innerErr.message : innerErr);
      if (innerErr && String(innerErr.message).toLowerCase().includes('device not found')) {
        return res.status(404).json({ message: 'Device not found' });
      }
      // propagate other errors to outer catch which returns 500
      throw innerErr;
    }

    // persist meter history (best-effort) - only records meter readings history
    try {
      await MeterDevices.insertMeterHistory({
        tenant_name: history.tenant_name,
        apartment_number: history.apartment_number,
        device_id: history.device_id,
        meter_type: history.meter_type,
        previous_reading: history.previous_reading,
        present_reading: history.present_reading,
        consumption: history.consumption,
        rate: history.rate,
        total_cost: history.total_cost,
        recorded_at: new Date()
      });
    } catch (hbErr) {
      console.error('Failed to insert meter history:', hbErr);
      // continue even if history insert fails
    }

  return res.json(device);
  } catch (e) {
    console.error('updateReading controller error:', e);
  return res.status(500).json({ message: 'Failed to update reading', error: e && e.message ? e.message : undefined });
  }
};

exports.getBillingHistory = async (req, res) => {
  try {
    const { tenant, from, to, limit } = req.query;
  const rows = await MeterDevices.getBillingHistory({ tenant, from, to, limit: limit || 500 });
    return res.json(rows);
  } catch (e) {
    console.error('getBillingHistory error:', e);
    return res.status(500).json({ message: 'Failed to fetch billing history' });
  }
};

// Delete a meter history row by id
exports.deleteMeterHistory = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'id required' });
    try {
      await MeterDevices.deleteMeterHistoryById(id);
      return res.json({ message: 'Deleted' });
    } catch (dbErr) {
      console.error('Failed to delete meter history:', dbErr);
      return res.status(500).json({ message: 'Failed to delete meter history' });
    }
  } catch (e) {
    console.error('deleteMeterHistory error:', e);
    return res.status(500).json({ message: 'Failed to delete meter history' });
  }
};

exports.getRates = async (req, res) => {
  try {
  const s = await MeterDevices.getSettings();
    return res.json(s || { electricity_rate: 0, water_rate: 0 });
  } catch (e) {
    console.error('getRates error:', e);
    return res.status(500).json({ message: 'Failed to fetch rates' });
  }
};

exports.setRates = async (req, res) => {
  try {
    const { electricity_rate, water_rate } = req.body || {};
  const updated = await MeterDevices.setSettings({ electricity_rate, water_rate });
    return res.json(updated);
  } catch (e) {
    console.error('setRates error:', e);
    return res.status(500).json({ message: 'Failed to update rates' });
  }
};

exports.create = async (req, res) => {
  try {
    const body = req.body || {};
    const device = {
      device_id: body.device_id || body.deviceId || body.deviceIdString || `dev-${Date.now() % 100000}-${Math.floor(Math.random()*9000)}`,
      meter_type: body.meter_type || body.meterType || 'Electricity Meter',
      type: body.type || 'meter',
      apartment_id: body.apartment_id || body.apartmentId || null,
      previous_reading: Number(body.previous_reading || body.previousReading || 0),
      present_reading: Number(body.present_reading || body.presentReading || 0),
  consumption: Number(body.usage || body.consumption || 0),
      rate: Number(body.rate || 0),
      total_cost: Number(body.total_cost || body.totalCost || 0)
    };

    // always persist to local file first so API is resilient
    try {
      ensureLocalFile();
      const raw = fs.readFileSync(localFile, 'utf8');
      const arr = raw ? JSON.parse(raw) : [];
      const localId = `local-${Date.now()}`;
      const deviceObj = {
        id: localId,
        device_id: device.device_id,
        meter_type: device.meter_type,
        type: device.type,
        apartment_id: device.apartment_id || null,
        apartment_number: null,
        tenant_name: null,
        previous_reading: device.previous_reading,
        present_reading: device.present_reading,
  consumption: device.consumption || device.usage || 0,
        rate: device.rate,
        total_cost: device.total_cost,
        last_updated: new Date().toISOString()
      };
      arr.unshift(deviceObj);
      fs.writeFileSync(localFile, JSON.stringify(arr, null, 2));

      // attempt DB insert asynchronously but don't block response
      (async () => {
        try {
          await MeterDevices.createDevice(device);
        } catch (dbErr) {
          console.error('Async DB create failed (ignored):', dbErr);
        }
      })();

      return res.json(deviceObj);
    } catch (fe) {
      console.error('Failed to write local devices file in create:', fe);
      // As a last resort, try DB insert and return that result or error
      try {
  const created = await MeterDevices.createDevice(device);
        return res.json(created);
      } catch (dbErr2) {
        console.error('DB create failed and local write failed:', dbErr2);
        return res.status(500).json({ message: 'Failed to create device' });
      }
    }
  } catch (e) {
    console.error('create device error:', e);
    res.status(500).json({ message: 'Failed to create device' });
  }
};

exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    const changes = req.body || {};
    try {
  const updated = await MeterDevices.updateDeviceById(id, changes);
      return res.json(updated);
    } catch (dbErr) {
      console.error('DB update failed:', dbErr);
      return res.status(500).json({ message: 'Failed to update device' });
    }
  } catch (e) {
    console.error('update device error:', e);
    res.status(500).json({ message: 'Failed to update device' });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = req.params.id;
    try {
  await MeterDevices.deleteDeviceById(id);
      return res.json({ message: 'Deleted' });
    } catch (dbErr) {
      console.error('DB delete failed:', dbErr);
      // try delete from local file
      try {
        ensureLocalFile();
        const raw = fs.readFileSync(localFile, 'utf8');
        let arr = JSON.parse(raw || '[]');
        arr = arr.filter(d => String(d.id) !== String(id) && String(d.device_id) !== String(id));
        fs.writeFileSync(localFile, JSON.stringify(arr, null, 2));
        return res.json({ message: 'Deleted (local)' });
      } catch (fe) {
        console.error('Failed to delete local device:', fe);
        return res.status(500).json({ message: 'Failed to delete device' });
      }
    }
  } catch (e) {
    console.error('delete device error:', e);
    res.status(500).json({ message: 'Failed to delete device' });
  }
};
