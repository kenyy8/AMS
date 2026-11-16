const fs=require('fs');
const crypto=require('crypto');
const {writePrivate}=require('../backend/scripts/demo-support');
const {secretsFile,writeManifest}=require('./render-accounts');
try {
  let values;
  if(fs.existsSync(secretsFile))values=JSON.parse(fs.readFileSync(secretsFile,'utf8'));
  else {
    values=Object.fromEntries(['JWT_SECRET','QR_SECRET','DEMO_PASSWORD_SEED'].map(key=>[key,crypto.randomBytes(48).toString('base64url')]));
    writePrivate(secretsFile,JSON.stringify(values,null,2),true);
  }
  const keys=['JWT_SECRET','QR_SECRET','DEMO_PASSWORD_SEED'];
  if(keys.some(key=>typeof values[key]!=='string'||values[key].length<32)||new Set(keys.map(key=>values[key])).size!==3)throw new Error('Existing hosted secrets file is invalid; it was not overwritten.');
  console.log('[render] Private Render environment values: '+secretsFile+'. Open locally and copy into the Render Environment panel; never commit or paste them into chat.');
  writeManifest(values.DEMO_PASSWORD_SEED);
} catch(error) { console.error('[render] '+error.message);process.exitCode=1; }
