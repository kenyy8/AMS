const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { DatabaseSync, backup } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
require('../config/environment');
const { requireSecrets } = require('../config/environment');
const { SEED_KEY,root,manifestPath,writePrivate,protect,csv,readAccounts,snapshot,summarize } = require('./demo-support');

const { names,specifications,unitName,email,managerEmail,accounts:makeAccounts } = require('../services/demoAccounts');
const date=(year,month,day)=>new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const timestamp=d=>d+'T04:00:00.000Z';

async function main({keepOpen=false} = {}) {
  requireSecrets();
  const {isProduction,databasePath,publicOrigin}=require('../config/environment');
  const hosted=isProduction && process.env.HOSTED_DEMO==='true';
  const target=databasePath();
  if (target===path.resolve(':memory:') || process.env.SQLITE_PATH===':memory:') throw new Error('Demo seeding requires a persistent SQLite file.');
  const stateDir=path.join(path.dirname(target),'demo');
  fs.mkdirSync(stateDir,{recursive:true});
  const lock=path.join(stateDir,'seed.lock');
  fs.closeSync(fs.openSync(lock,'wx',0o600));
  let db;
  try {
    // Back up the actual file before importing the auto-migrating database module.
    if(!hosted && fs.existsSync(target)) {
      const source=new DatabaseSync(target,{readOnly:true});
      const destination=path.join(path.dirname(target),'backups','ams-before-demo-'+Date.now()+'.db');
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      try{await backup(source,destination);}finally{source.close();}
      console.log('[demo] Existing database backed up under backend/data/backups.');
    }
    db=require('../config/sqlite');
    const existing=db.get('SELECT * FROM demo_seed_runs WHERE seed_key=?',[SEED_KEY]);
    if(hosted && existing) {
      if(JSON.parse(existing.metadata_json).hosted!==true) throw new Error('Refusing to host a database that was not created as a fresh hosted demo.');
      console.log('[demo] Hosted fictional database already initialized; no duplicate records added.');
      return;
    }
    if(hosted && ['property_managers','apartments','tenants','bills','payment_history','meter_devices','meter_history','notifications'].some(table=>db.get('SELECT COUNT(*) AS n FROM '+table).n)) throw new Error('Hosted initialization requires an empty fictional database.');
    const stage=path.join(path.dirname(manifestPath),path.basename(manifestPath,'.csv')+'.pending.csv');
    const asOf=existing?.as_of || process.argv.find(a=>a.startsWith('--as-of='))?.slice(8) || today();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf)))throw new Error('Invalid demo reference date.');
    const [year,month,day]=asOf.split('-').map(Number);
    const months=Array.from({length:6},(_,i)=>({year:new Date(Date.UTC(year,month-6+i,1)).getUTCFullYear(),month:new Date(Date.UTC(year,month-6+i,1)).getUTCMonth()}));
    const directory=path.join(stateDir,'qr');
    let accounts;
    if(existing) {
      if(!fs.existsSync(manifestPath)&&fs.existsSync(stage)){fs.linkSync(stage,manifestPath);fs.unlinkSync(stage);}
      if(!fs.existsSync(manifestPath))throw new Error('Credential manifest is missing. Restore it from your private copy; existing passwords will not be reset.');
      protect(manifestPath);
      accounts=readAccounts();
      const ledger=db.all('SELECT table_name,record_id FROM demo_seed_records WHERE seed_key=?',[SEED_KEY]);
      for(const record of ledger)if(!db.get(`SELECT id FROM ${record.table_name} WHERE id=?`,[record.record_id]))throw new Error('A tracked demo record was changed/deleted. No replacement or reset was attempted.');
      if(accounts.length!==16)throw new Error('Credential manifest is incomplete; existing data was preserved.');
      for(const account of accounts){const row=db.get(`SELECT id,password FROM ${account.role==='manager'?'property_managers':'tenants'} WHERE email=?`,[account.email]);if(!row||!bcrypt.compareSync(account.temporary_password,row.password))throw new Error('A demo account password changed. Update the private manifest; seeding never resets passwords.');}
      console.log('[demo] Existing dataset verified. No business records or passwords were inserted, overwritten, or duplicated.');
    } else {
      if(!hosted && fs.existsSync(manifestPath))throw new Error('A credential manifest already exists without this seed ledger. It was not overwritten.');
      accounts=hosted?makeAccounts({passwordSeed:process.env.DEMO_PASSWORD_SEED,origin:publicOrigin()}):(fs.existsSync(stage)?readAccounts(stage):makeAccounts());
      assert.equal(accounts.length,16);
      assert.equal(accounts[0].email,managerEmail);
      accounts.slice(1).forEach((a,i)=>assert.equal(a.email,email(i)));
      if(!hosted && !fs.existsSync(stage))writePrivate(stage,csv(accounts),true);
      const hashes=accounts.map(a=>bcrypt.hashSync(a.temporary_password,12));
      db.transaction(()=>{
        const preserved=snapshot(db);
        if(db.get('SELECT id FROM property_managers WHERE email=?',[managerEmail]))throw new Error('Demo manager identifier collides with an existing account.');
        for(let i=0;i<20;i++)if(db.get('SELECT id FROM apartments WHERE apartment_number=?',[unitName(i)]))throw new Error('Demo unit identifier collides with an existing record.');
        for(let i=0;i<15;i++)if(db.get('SELECT id FROM tenants WHERE email=? OR tenant_id=?',[email(i),`DEMO-APT-${String(i+1).padStart(4,'0')}`]))throw new Error('Demo tenant identifier collides with an existing account.');
        const property={name:'DEMO Amihan Courtyard',location:'Fictional Sample Lane, Quezon City, Metro Manila',building:'DEMO Amihan Courtyard - Quezon City',currency:'PHP',period_start:date(months[0].year,months[0].month,1),period_end:date(year,month-1,day),electricity_rate:12.5,water_rate:45,rates_are_fictional:true};
        db.run('INSERT INTO demo_seed_runs(seed_key,as_of,metadata_json) VALUES (?,?,?)',[SEED_KEY,asOf,JSON.stringify({property,preserved,hosted})]);
        const track=(table,recordId,key)=>{db.run('INSERT INTO demo_seed_records(seed_key,table_name,record_id,logical_key) VALUES (?,?,?,?)',[SEED_KEY,table,recordId,key]);return recordId;};
        let managerId;
        if(db.get('SELECT COUNT(*) AS n FROM property_managers').n===0)managerId=require('../services/managerBootstrap').bootstrapManager(db,{name:accounts[0].display_name,email:managerEmail,password:accounts[0].temporary_password}).id;
        else managerId=db.run("INSERT INTO property_managers(name,email,password,role) VALUES (?,?,?,'manager')",[accounts[0].display_name,managerEmail,hashes[0]]).insertId;
        track('property_managers',managerId,'manager');
        const apartmentIds=[];
        for(let i=0;i<20;i++)apartmentIds.push(track('apartments',db.run('INSERT INTO apartments(apartment_number,floor,building,rent_amount,status,created_at) VALUES (?,?,?,?,?,?)',[unitName(i),String(Math.floor(i/5)+1),property.building,specifications[i][1],i<15?'occupied':'available',timestamp(date(months[0].year,months[0].month-2,1))]).insertId,`unit-${i+1}`));
        for(let i=0;i<15;i++){
          const moveIn=date(months[0].year,months[0].month-1,1+i%8);
          const tenantId=track('tenants',db.run("INSERT INTO tenants(tenant_id,name,email,phone,password,apartment_id,status,move_in_date,created_at) VALUES (?,?,?,?,?,?,'active',?,?)",[`DEMO-APT-${String(i+1).padStart(4,'0')}`,accounts[i+1].display_name,email(i),`+63 900 000 ${String(101+i).padStart(4,'0')}`,hashes[i+1],apartmentIds[i],moveIn,timestamp(moveIn)]).insertId,`tenant-${i+1}`);
          const createBill=(type,amount,due,created,paid,paidAt,key)=>{
            const billId=track('bills',db.run('INSERT INTO bills(tenant_id,bill_type,amount,due_date,status,paid_at,created_at) VALUES (?,?,?,?,?,?,?)',[tenantId,type,amount,due,paid?'paid':'pending',paid?paidAt:null,created]).insertId,key);
            if(paid)track('payment_history',db.run('INSERT INTO payment_history(bill_id,amount_paid,paid_at,payment_type,created_at) VALUES (?,?,?,?,?)',[billId,amount,paidAt,type==='rent'?'RENT':'UTILITY',timestamp(paidAt.slice(0,10))]).insertId,`payment-${key}`);
          };
          for(let m=0;m<6;m++){
            const period=months[m],dueDay=i%3===2?20:5,current=m===5;
            const paid=current?i%5===0:!((i%5===4&&[3,4].includes(m))||(i%7===6&&m===4));
            const paidDay=current?Math.min(day,dueDay===20?12:4):Math.min(28,dueDay+(i%4===0?3:-2));
            createBill('rent',specifications[i][1],date(period.year,period.month,dueDay),timestamp(date(period.year,period.month,1)),paid,date(period.year,period.month,paidDay),`rent-${i+1}-${date(period.year,period.month,1).slice(0,7)}`);
          }
          for(const [kind,rate]of [['electricity',property.electricity_rate],['water',property.water_rate]]){
            const deviceCode=`DEMO-${i+1}-${kind.toUpperCase()}`;
            if(db.get('SELECT id FROM meter_devices WHERE device_id=?',[deviceCode]))throw new Error('Demo meter identifier collision.');
            let reading=kind==='electricity'?1100+i*173:80+i*11;
            const meterId=track('meter_devices',db.run('INSERT INTO meter_devices(device_id,meter_type,type,apartment_id,previous_reading,present_reading,current_reading,rate,last_updated) VALUES (?,?,?,?,?,?,?,?,?)',[deviceCode,kind==='electricity'?'electricity_meter':'water_meter','meter',apartmentIds[i],reading,reading,reading,rate,timestamp(date(months[0].year,months[0].month-1,10))]).insertId,`meter-${i+1}-${kind}`);
            for(let m=0;m<6;m++){
              const period=months[m],current=m===5,readingDate=date(period.year,period.month,current?Math.min(10,day):10);
              const consumption=kind==='electricity'?110+(i*19+m*23)%190:8+(i*3+m*2)%13;
              const previous=reading;reading+=consumption;
              const cost=Math.round(consumption*rate*100)/100;
              track('meter_history',db.run('INSERT INTO meter_history(tenant_name,apartment_number,device_id,meter_type,previous_reading,present_reading,consumption,rate,total_cost,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[accounts[i+1].display_name,unitName(i),deviceCode,kind==='electricity'?'electricity_meter':'water_meter',previous,reading,consumption,rate,cost,timestamp(readingDate)]).insertId,`reading-${i+1}-${kind}-${readingDate.slice(0,7)}`);
              if(current)db.run('UPDATE meter_devices SET previous_reading=?,present_reading=?,current_reading=?,consumption=?,total_cost=?,last_reading_date=?,last_updated=? WHERE id=?',[previous,reading,reading,consumption,cost,timestamp(readingDate),timestamp(readingDate),meterId]);
              const paid=current?i%4===0:!(i%6===5&&m===4);
              const paidDay=current?Math.min(14,day):i%4===1?23:18;
              createBill(kind,cost,date(period.year,period.month,20),timestamp(readingDate),paid,date(period.year,period.month,paidDay),`${kind}-${i+1}-${readingDate.slice(0,7)}`);
            }
          }
        }
        assert.deepEqual(snapshot(db,true),preserved,'Existing non-demo records must be byte-for-byte preserved.');
        if(db.all('PRAGMA foreign_key_check').length)throw new Error('Foreign-key validation failed.');
      });
      if(!hosted){fs.linkSync(stage,manifestPath);fs.unlinkSync(stage);}
      console.log('[demo] Fictional property, accounts, bills, payments, and readings committed successfully.');
    }
    if(hosted){console.log('[demo] Fictional hosted seed ready. Credentials are derived privately from Render environment secrets; no manifest was written.');return;}
    // Refresh private, expiring QR assets using the same issuer as the authenticated API.
    for(const tenant of db.all("SELECT t.id,t.tenant_id FROM tenants t JOIN demo_seed_records d ON d.record_id=t.id AND d.table_name='tenants' AND d.seed_key=?",[SEED_KEY])){
      const token=require('../services/tenantQr').createTenantToken(tenant.id);
      writePrivate(path.join(directory,tenant.tenant_id+'.png'),await QRCode.toBuffer(token,{width:360}));
    }
    const summary=summarize(db);
    writePrivate(path.join(stateDir,'summary.local.json'),JSON.stringify(summary,null,2));
    console.log('[demo] SUCCESS — FICTIONAL DEMO DATA ONLY');
    console.log('[demo] '+JSON.stringify(summary.counts));
    console.log('[demo] '+JSON.stringify(summary.finances));
    console.log('[demo] Credentials: '+manifestPath+' (passwords were not printed).');
    console.log('[demo] Unit types are labels; contracts/deposits, partial balances, hardware events, and notification UI were not invented.');
  } finally { if(db && !keepOpen)db.close();fs.unlinkSync(lock); }
}
if(require.main===module)main().catch(error=>{console.error('[demo] FAILED: '+error.message);process.exitCode=1;});
module.exports={main};
