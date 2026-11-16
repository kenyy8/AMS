module.exports = (app, { db, fail, tenantRow, QRCode }) => {
  const jwt = require('jsonwebtoken');
  function getTenant(value) { const tenant=tenantRow(value);if(!tenant)fail('Tenant not found',404);return tenant; }
  function tokenFor(tenant) { return require('../services/tenantQr').createTenantToken(tenant.id); }
  app.get('/api/qr-codes/:id',async(req,res)=>{const tenant=getTenant(req.params.id);res.json({tenant,qr_url:await QRCode.toDataURL(tokenFor(tenant),{width:180})});});
  app.get('/api/qr-tokens/:id',(req,res)=>res.json({token:tokenFor(getTenant(req.params.id))}));
  app.post('/api/qr-codes/create-tenant-token',async(req,res)=>{const tenant=getTenant(req.body.tenant_id);const token=tokenFor(tenant);res.json({token,qr_url:await QRCode.toDataURL(token,{width:300}),tenant});});
  app.post('/api/qr-codes/generate',async(req,res)=>{const device=db.get('SELECT * FROM meter_devices WHERE device_id=?',[req.body.device_id]);if(!device)fail('Device not found',404);const qr_data={device_id:device.device_id,type:device.type,apartment_id:device.apartment_id};res.json({qr_data,qr_url:await QRCode.toDataURL(JSON.stringify(qr_data))});});
  app.post('/api/qr-codes/scan',(req,res)=>{
    let parsed=req.body.qr_data;
    if(!parsed)fail('qr_data is required');
    if(typeof parsed==='string') {
      if(parsed.split('.').length===3){try{const payload=jwt.verify(parsed,process.env.QR_SECRET,{algorithms:['HS256']});if(payload.type!=='tenant_qr')fail('Invalid QR');return res.json({tenant:getTenant(payload.tid)});}catch(_){fail('Invalid or expired QR token');}}
      try{parsed=JSON.parse(parsed);}catch(_){parsed={tenant_id:parsed};}
    }
    if(!parsed || typeof parsed!=='object')fail('Invalid QR payload');
    if(parsed.device_id){const device=db.get('SELECT d.*,a.apartment_number FROM meter_devices d LEFT JOIN apartments a ON a.id=d.apartment_id WHERE d.device_id=?',[parsed.device_id]);if(!device)fail('Device not found',404);return res.json({device});}
    res.json({tenant:getTenant(parsed.tenant_id || parsed.id)});
  });
};
