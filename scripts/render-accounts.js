const fs=require('fs');
const path=require('path');
const readline=require('readline');
const {accounts}=require('../backend/services/demoAccounts');
const {root,writePrivate,csv,readAccounts}=require('../backend/scripts/demo-support');
const secretsFile=path.join(root,'backend/data/render-secrets.local.json');
const output=path.join(root,'render-demo-accounts.local.csv');
function writeManifest(seed) {
  if(typeof seed!=='string'||seed.length<32)throw new Error('A private DEMO_PASSWORD_SEED of at least 32 characters is required.');
  const profiles=accounts({passwordSeed:seed,origin:process.env.DEMO_LOGIN_ORIGIN || ''});
  if(fs.existsSync(output)) {
    const old=readAccounts(output);
    if(old.length!==profiles.length || old.some((row,i)=>row.email!==profiles[i].email || row.temporary_password!==profiles[i].temporary_password)) throw new Error('A hosted credential manifest with different credentials already exists. Preserve it privately before deriving a replacement.');
  }
  writePrivate(output,csv(profiles));
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
