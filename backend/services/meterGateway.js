const jwt = require('jsonwebtoken');
const db = require('../config/sqlite');
function initMeterGateway(io, app) {
  io.use((socket, next) => {
    try { socket.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (!['tenant','manager'].includes(socket.user.role) || !Number.isInteger(socket.user.id)) throw new Error();
      const table=socket.user.role==='manager'?'property_managers':'tenants';
      if(!db.get('SELECT id FROM '+table+' WHERE id=?',[socket.user.id]))throw new Error();
      next();
    } catch (_) { next(new Error('Authentication required')); }
  });
  io.on('connection', socket => {
    socket.on('join-apartment', value => {
      const apartment = Number(value);
      if (!Number.isSafeInteger(apartment) || apartment < 1) return;
      if (socket.user.role === 'manager' || db.get('SELECT id FROM tenants WHERE id=? AND apartment_id=?',[socket.user.id,apartment])) socket.join('apartment-' + apartment);
    });
    socket.on('meter-reading', data => {
      if (socket.user.role !== 'manager') return;
      try { const row=db.get('SELECT id FROM meter_devices WHERE device_id=?',[data.deviceId]); if (!row) return;
        app.get('applyMeterReading')(row.id,data.reading,data.timestamp);
      } catch (_) { socket.emit('meter-error',{message:'Reading rejected'}); }
    });
  });
}
module.exports = { initMeterGateway };
