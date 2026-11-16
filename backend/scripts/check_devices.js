const db=require('../config/sqlite'); console.log(db.all('SELECT id,device_id,meter_type,apartment_id FROM meter_devices LIMIT 20')); db.close();
