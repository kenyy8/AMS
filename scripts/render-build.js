const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
require('./assert-deploy-safe').check();
const cli=process.env.npm_execpath;
if(!cli)throw new Error('Run npm run render:build.');
// Runtime needs only backend packages. The frontend compiler is used only at build time.
for(const [folder,args]of [['backend',['ci','--omit=dev','--no-audit','--no-fund']],['frontend',['ci','--include=dev','--no-audit','--no-fund']]]){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:path.join(root,folder),stdio:'inherit',env:{...process.env,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'}});
  if(result.status!==0)process.exit(result.status||1);
}
require('./build-production');
