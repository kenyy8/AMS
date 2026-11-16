const fs=require('fs');
const path=require('path');
const readline=require('readline');
const {accounts}=require('../backend/services/demoAccounts');
const {root,writePrivate,csv,readAccounts}=require('../backend/scripts/demo-support');
const secretsFile=path.join(root,'backend/data/render-secrets.local.json');
const output=path.join(root,'render-demo-accounts.local.csv');
function writeManifest(seed) {
  if(typeof seed!=='string'||seed.length<32)throw new Error('A private DEMO_PASSWORD_SEED of at least 32 characters is required.');
  const privateFile=path.join(root,'backend/data/hosted-accounts.local.json');
  if(fs.existsSync(privateFile)){
    const values=JSON.parse(fs.readFileSync(privateFile,'utf8'));
    for(const key of ['HOSTED_MANAGER_PASSWORD','HOSTED_TENANT_PASSWORD'])if(process.env[key]===undefined&&typeof values[key]==='string')process.env[key]=values[key];
  }
  const profiles=accounts({passwordSeed:seed,origin:process.env.DEMO_LOGIN_ORIGIN || '',hosted:true});
  if(fs.existsSync(output)) {
    const old=readAccounts(output);
    const matches=expected=>old.length===expected.length && old.every((row,i)=>row.email===expected[i].email && row.temporary_password===expected[i].temporary_password);
    if(!matches(profiles)) {
      const preferredOnly=old.length===profiles.length&&old.every((row,i)=>row.email===profiles[i].email&&(i<2||row.temporary_password===profiles[i].temporary_password));
      if(!preferredOnly&&!matches(accounts({passwordSeed:seed,origin:''})))throw new Error('The existing manifest has unrelated credentials; preserve it privately before replacement.');
      const backup=path.join(root,'backend/data','render-accounts-before-preferred-'+Date.now()+'.local.csv');
      writePrivate(backup,fs.readFileSync(output,'utf8'),true);
      console.log('[render] Previous hosted credentials preserved privately in '+backup);
    }
  }
  writePrivate(output,csv(profiles));
  writePrivate(path.join(root,'backend/data/hosted-accounts.local.json'),JSON.stringify({HOSTED_MANAGER_PASSWORD:profiles[0].temporary_password,HOSTED_TENANT_PASSWORD:profiles[1].temporary_password},null,2)+'\n');
  console.log('[render] Hosted demo credentials saved privately to '+output+'. No passwords were printed.');
}
async function main() {
  const prompt=process.argv.includes('--prompt');
  let seed=prompt?undefined:process.env.DEMO_PASSWORD_SEED;
  if(!prompt && !seed && fs.existsSync(secretsFile))seed=JSON.parse(fs.readFileSync(secretsFile,'utf8')).DEMO_PASSWORD_SEED;
  if(!seed) {
    if(!process.stdin.isTTY)throw new Error('Run interactively and paste the Render DEMO_PASSWORD_SEED at the hidden prompt.');
    const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
    process.stdout.write('Render DEMO_PASSWORD_SEED (hidden): ');
    rl._writeToOutput=()=>{};
    seed=await new Promise(resolve=>rl.question('',resolve));
    rl.close();process.stdout.write('\n');
  }
  writeManifest(seed);
}
if(require.main===module)main().catch(error=>{console.error('[render] '+error.message);process.exitCode=1;});
module.exports={writeManifest,secretsFile};
