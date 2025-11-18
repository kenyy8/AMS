const MeterDevices = require('../models/meterDeviceModel');

function initMeterGateway(io) {
  io.on('connection', (socket) => {
  socket.on('meter-reading', async (data) => {
      try {
        const { deviceId, reading, timestamp } = data;
    await MeterDevices.updateReadingByDeviceId(deviceId, reading, timestamp);
    io.to(`apartment-${data.apartmentId || data.apartment_id || ''}`).emit('meter-update', data);
      } catch (error) {
    console.error('Error processing meter reading:', error);
      }
    });
  });
}

module.exports = { initMeterGateway };
