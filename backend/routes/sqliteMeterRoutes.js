module.exports = (app, { db, fail, id, exists, number, text }) => {
  const select = `SELECT d.*,a.apartment_number,a.floor AS apartment_floor,a.building AS apartment_building,t.name AS tenant_name
    FROM meter_devices d LEFT JOIN apartments a ON a.id=d.apartment_id LEFT JOIN tenants t ON t.apartment_id=a.id AND t.status='active'`;
  function device(value) { const row = db.get(select + ' WHERE d.id=?', [id(value)]); if (!row) fail('Device not found', 404); return row; }
  function rates() { return db.get('SELECT * FROM settings WHERE id=1'); }
  function applyReading(deviceId, value, timestamp) {
    const result = db.transaction(() => {
      const row = device(deviceId);
      const present = number(value, 'reading');
      const previous = Number(row.present_reading || 0);
      if (present < previous) fail('Reading cannot be lower than the previous reading');
      const settings = rates();
      const rate = row.rate > 0 ? row.rate : /elect/i.test(row.meter_type) ? settings.electricity_rate : settings.water_rate;
      const consumption = Math.round((present - previous) * 1000) / 1000;
      const total = Math.round(consumption * rate * 100) / 100;
      const at = timestamp ? new Date(timestamp) : new Date();
      if (!Number.isFinite(at.getTime())) fail('Invalid reading timestamp');
      const recordedAt = at.toISOString();
      db.run('UPDATE meter_devices SET previous_reading=?,present_reading=?,current_reading=?,consumption=?,rate=?,total_cost=?,last_reading_date=?,last_updated=? WHERE id=?', [previous,present,present,consumption,rate,total,recordedAt,recordedAt,row.id]);
      db.run('INSERT INTO meter_history(tenant_name,apartment_number,device_id,meter_type,previous_reading,present_reading,consumption,rate,total_cost,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [row.tenant_name,row.apartment_number,row.device_id,row.meter_type,previous,present,consumption,rate,total,recordedAt]);
      return device(row.id);
    });
    app.get('io')?.to(`apartment-${result.apartment_id}`).emit('meter-update', result);
    return result;
  }
  app.set('applyMeterReading', applyReading);
  app.get('/api/meter-devices', (req,res) => {
    const scope = req.user.role === 'tenant' ? req.user.id : null;
    res.json(db.all(select + ' WHERE (? IS NULL OR t.id=?) ORDER BY d.id DESC', [scope,scope]));
  });
  app.get('/api/meter-devices/settings/rates', (req,res) => res.json(rates()));
  function setRates(req,res) {
    const body = req.body, old = rates();
    const electric = number(body.electricity_rate ?? body.electricityRate, 'electricity_rate', old.electricity_rate);
    const water = number(body.water_rate ?? body.waterRate, 'water_rate', old.water_rate);
    db.transaction(() => db.run('UPDATE settings SET electricity_rate=?,water_rate=?,updated_at=CURRENT_TIMESTAMP WHERE id=1', [electric,water]));
    res.json(rates());
  }
  app.post('/api/meter-devices/settings/rates', setRates);
  app.get('/api/settings/rates', (req,res) => res.json(rates()));
  app.post('/api/settings/rates', setRates);
  app.get('/api/meter-devices/meter-history', (req,res) => {
    const { tenant,from,to } = req.query;
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    res.json(db.all(`SELECT * FROM meter_history WHERE (? IS NULL OR tenant_name LIKE ? OR apartment_number LIKE ?) AND (? IS NULL OR date(recorded_at)>=date(?)) AND (? IS NULL OR date(recorded_at)<=date(?)) ORDER BY recorded_at DESC,id DESC LIMIT ?`, [tenant || null,`%${tenant || ''}%`,`%${tenant || ''}%`,from || null,from || null,to || null,to || null,limit]));
  });
  app.delete('/api/meter-devices/meter-history/:id', (req,res) => { exists('meter_history',req.params.id); db.run('DELETE FROM meter_history WHERE id=?',[id(req.params.id)]); res.json({message:'History deleted'}); });
  app.post('/api/meter-devices/reading', (req,res) => {
    const row = db.get('SELECT id FROM meter_devices WHERE device_id=?',[req.body.deviceId || req.body.device_id]);
    if (!row) fail('Device not found',404);
    res.json(applyReading(row.id,req.body.reading,req.body.reading_date || req.body.timestamp));
  });
  app.put('/api/meter-devices/update-reading/:id', (req,res) => res.json(applyReading(req.params.id,req.body.presentReading,req.body.lastUpdated || req.body.timestamp || req.body.last_updated)));
  function save(body, previous) {
    const merged = {...previous,...body};
    let apartment = merged.apartment_id || merged.apartmentId || null;
    if (!apartment && merged.apartment_number) apartment = db.get('SELECT id FROM apartments WHERE apartment_number=?',[String(merged.apartment_number)])?.id;
    if (apartment) { apartment=id(apartment); exists('apartments',apartment); if (db.get('SELECT COUNT(*) AS n FROM meter_devices WHERE apartment_id=? AND id<>?',[apartment,previous?.id || 0]).n >= 2) fail('Maximum of 2 devices allowed per apartment'); }
    let deviceId = merged.device_id || merged.deviceId;
    if (!deviceId) {
      const base = apartment ? `apt:${apartment}` : `dev:${require('crypto').randomUUID()}`;
      let suffix=1; while (db.get('SELECT id FROM meter_devices WHERE device_id=?',[`${base}_${suffix}`])) suffix++;
      deviceId=`${base}_${suffix}`;
    }
    const before=number(merged.previous_reading ?? merged.previousReading,'previous_reading',0), present=number(merged.present_reading ?? merged.presentReading,'present_reading',0), rate=number(merged.rate,'rate',0);
    if (present<before) fail('Present reading cannot be below previous reading');
    const at=merged.reading_date || merged.last_updated || new Date().toISOString();
    if (!Number.isFinite(Date.parse(at))) fail('Invalid reading date');
    const values=[text(deviceId,'device_id',true,100),text(merged.meter_type || merged.meterType || 'electricity_meter','meter_type',true,50),text(merged.type || 'meter','type',true,50),apartment,before,present,present-before,rate,Math.round((present-before)*rate*100)/100,present,new Date(at).toISOString()];
    let recordId;
    if (previous) {recordId=previous.id; db.run('UPDATE meter_devices SET device_id=?,meter_type=?,type=?,apartment_id=?,previous_reading=?,present_reading=?,consumption=?,rate=?,total_cost=?,current_reading=?,last_updated=? WHERE id=?',[...values,recordId]);}
    else recordId=db.run('INSERT INTO meter_devices(device_id,meter_type,type,apartment_id,previous_reading,present_reading,consumption,rate,total_cost,current_reading,last_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)',values).insertId;
    return device(recordId);
  }
  app.post('/api/meter-devices', (req,res) => res.status(201).json(db.transaction(()=>save(req.body))));
  app.put('/api/meter-devices/:id', (req,res) => res.json(db.transaction(()=>save(req.body,device(req.params.id)))));
  app.delete('/api/meter-devices/:id',(req,res)=>{ const row=device(req.params.id);db.run('DELETE FROM meter_devices WHERE id=?',[row.id]);res.json({message:'Device deleted'}); });
  app.post('/api/meter-devices/scan',(req,res)=>{const row=db.get('SELECT id FROM meter_devices WHERE device_id=?',[req.body.device_id]);if(!row)fail('Device not found',404);res.json({device:device(row.id)});});
};
