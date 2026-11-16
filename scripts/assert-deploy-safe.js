const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
function check() {
  const tracked=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>['.git','node_modules','build','.npm-cache'].includes(entry.name)?[]:entry.isDirectory()?walk(path.join(dir,entry.name)):[path.relative(root,path.join(dir,entry.name)).replaceAll('\\','/')]);}
  const files=tracked.status===0?tracked.stdout.split('\0').filter(Boolean):walk(root);
  const unsafe=files.filter(file=>/^backend\/data\//.test(file)||(/(^|\/)\.env(?:$|\.)/.test(file)&&!file.endsWith('.example'))||/\.local(?:\.[^.]+)*\.(csv|json|env)$/.test(file)||/\.(?:db|sqlite3?)(?:-(?:wal|shm))?$/.test(file)||/\.(pem|key)$/.test(file));
  if(unsafe.length)throw new Error('Deployment refused: remove private runtime artifacts from the deployment source: '+unsafe.join(', '));
  console.log('[deploy] Source check passed: no tracked/deployed local database, credentials, private environment, or key files.');
}
if(require.main===module){try{check();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={check};
