const crypto = require('crypto');
const names=['Alya Mercado','Nico Villareal','Mira Salcedo','Enzo Dalisay','Tala Navarro','Rafael Alonzo','Lia Mendoza','Marco Sarmiento','Amara Bautista','Paolo Reyes','Sofia Valdez','Mateo Soriano','Isla de Leon','Gabriel Santos','Nina Aguinaldo'];
const specifications=[['Studio',6500],['Studio',7000],['1BR',9500],['Studio',7500],['1BR',10500],['Studio',6800],['1BR',9800],['1BR',11000],['2BR',14000],['Studio',7800],['1BR',11500],['2BR',15000],['2BR',16000],['1BR',10000],['2BR',17500],['Studio',6000],['1BR',9000],['2BR',13500],['Studio',7200],['1BR',10800]];
const unitName=i=>`DEMO-${Math.floor(i/5)+1}0${i%5+1} (${specifications[i][0]})`;
const email=i=>`tenant${String(i+1).padStart(2,'0')}@example.com`;
const managerEmail='ams.demo.manager@example.com';
const hostedManagerEmail='admin@ams.test',hostedTenantEmail='tenant@ams.test';
function hostedPassword(role,environment=process.env) {
  const key=role==='manager'?'HOSTED_MANAGER_PASSWORD':'HOSTED_TENANT_PASSWORD';
  const password=environment[key];
  if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw new Error(key+' is required and must contain 12 or more characters and at most 72 UTF-8 bytes.');
  return password;
}
function accounts({ passwordSeed, origin = 'http://localhost:3000',hosted=false,environment=process.env } = {}) {
  const profiles=[{role:'manager',display_name:'Demo Celina Amihan',email:managerEmail,unit:'All demo units'},...names.map((name,i)=>({role:'tenant',display_name:'Demo '+name,email:email(i),unit:unitName(i)}))];
  if (passwordSeed !== undefined && passwordSeed.length < 32) throw new Error('Use a random demo credential seed of at least 32 characters.');
  if(hosted){if(!passwordSeed)throw new Error('Hosted credentials require the private seed.');profiles[0].email=hostedManagerEmail;profiles[1].email=hostedTenantEmail;for(const a of profiles){a.display_name=a.display_name.replace(/^Demo /,'');a.unit=a.unit==='All demo units'?'All apartments':a.unit.replace(/^DEMO-/,'');}}
  return profiles.map((a,i)=>{
    let password=passwordSeed?'D'+crypto.createHmac('sha256',passwordSeed).update('ams-hosted-credentials-v1:'+a.role+':'+a.email).digest('base64url').slice(0,31):crypto.randomBytes(18).toString('base64url');
    if(hosted&&i<2)password=hostedPassword(a.role,environment);
    return {...a,temporary_password:password,login_page:origin+(a.role==='manager'?'/property-manager-login':'/tenant-login'),login_route:a.role==='manager'?'/api/property-managers/login':'/api/tenants/login',dataset:'ams-amihan-fictional-demo-v1'};
  });
}
module.exports = { names,specifications,unitName,email,managerEmail,hostedManagerEmail,hostedTenantEmail,accounts,hostedPassword };
