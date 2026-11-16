const bcrypt=require('bcryptjs');
const {accounts}=require('./demoAccounts');
const {SEED_KEY}=require('../scripts/demo-support');
function reconcileHostedAccounts(db) {
  const {isProduction,publicOrigin}=require('../config/environment');
  if(!isProduction||process.env.HOSTED_DEMO!=='true')throw new Error('Hosted account repair cannot modify the local database.');
  const run=db.get('SELECT * FROM demo_seed_runs WHERE seed_key=?',[SEED_KEY]);
  if(!run||JSON.parse(run.metadata_json).hosted!==true)throw new Error('Hosted provenance is required before account initialization.');
  const profiles=accounts({passwordSeed:process.env.DEMO_PASSWORD_SEED,origin:publicOrigin(),hosted:true});
  return db.transaction(()=>{
    const owned=table=>db.all(`SELECT t.* FROM ${table} t JOIN demo_seed_records d ON d.table_name=? AND d.record_id=t.id AND d.seed_key=?`,[table,SEED_KEY]);
    function preferred(table,profile,key) {
      const owner=db.get('SELECT record_id FROM demo_seed_records WHERE seed_key=? AND table_name=? AND logical_key=?',[SEED_KEY,table,key]);
      const row=db.get(`SELECT * FROM ${table} WHERE email=?`,[profile.email]) || (owner?db.get(`SELECT * FROM ${table} WHERE id=?`,[owner.record_id]):null);
      if(!row)throw new Error('The seeded hosted account is missing; refusing to create a disconnected duplicate.');
      const hash=/^\$2[aby]\$/.test(row.password)&&bcrypt.compareSync(profile.temporary_password,row.password)?row.password:bcrypt.hashSync(profile.temporary_password,12);
      if(table==='property_managers')db.run("UPDATE property_managers SET email=?,name=?,password=?,role='manager' WHERE id=?",[profile.email,profile.display_name,hash,row.id]);
      else {
        if(!row.apartment_id||!db.get('SELECT id FROM apartments WHERE id=?',[row.apartment_id]))throw new Error('Preferred hosted tenant must retain a valid apartment assignment.');
        db.run("UPDATE tenants SET email=?,name=?,password=? WHERE id=?",[profile.email,profile.display_name,hash,row.id]);
      }
      return row.id;
    }
    const managerId=preferred('property_managers',profiles[0],'manager');
    const tenantId=preferred('tenants',profiles[1],'tenant-1');
    // Presentation labels change only inside the isolated hosted dataset.
    for(const row of owned('apartments')){
      const number=row.apartment_number.replace(/^DEMO-/,''),building=row.building?.replace(/^DEMO\s+/,'');
      if(number!==row.apartment_number||building!==row.building)db.run('UPDATE apartments SET apartment_number=?,building=? WHERE id=?',[number,building,row.id]);
    }
    for(const row of owned('tenants')){
      const name=row.name.replace(/^Demo /,''),identifier=row.tenant_id.replace(/^DEMO-APT-/,'APT-'+run.as_of.slice(0,4)+'-');
      if(name!==row.name||identifier!==row.tenant_id)db.run('UPDATE tenants SET name=?,tenant_id=? WHERE id=?',[name,identifier,row.id]);
    }
    for(const row of owned('meter_devices')){
      const identifier=row.device_id.replace(/^DEMO-/,'APT-');
      if(identifier!==row.device_id)db.run('UPDATE meter_devices SET device_id=? WHERE id=?',[identifier,row.id]);
    }
    for(const row of owned('meter_history')){
      const name=row.tenant_name?.replace(/^Demo /,''),number=row.apartment_number?.replace(/^DEMO-/,''),identifier=row.device_id.replace(/^DEMO-/,'APT-');
      if(name!==row.tenant_name||number!==row.apartment_number||identifier!==row.device_id)db.run('UPDATE meter_history SET tenant_name=?,apartment_number=?,device_id=? WHERE id=?',[name,number,identifier,row.id]);
    }
    if(db.all('PRAGMA foreign_key_check').length)throw new Error('Hosted relationship validation failed.');
    return {managerId,tenantId};
  });
}
module.exports={reconcileHostedAccounts};
