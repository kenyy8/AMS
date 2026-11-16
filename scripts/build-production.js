const path=require('path');
const fs=require('fs');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const cli=path.join(root,'frontend/node_modules/react-scripts/bin/react-scripts.js');
if(!fs.existsSync(cli))throw new Error('Frontend dependencies are missing. Run npm run setup locally or the Render build command.');
const environment={...process.env,NODE_ENV:'production',CI:'true',GENERATE_SOURCEMAP:'false',INLINE_RUNTIME_CHUNK:'false',REACT_APP_API_URL:'',REACT_APP_HOSTED_DEMO:'true'};
for(const key of ['JWT_SECRET','QR_SECRET','DEMO_PASSWORD_SEED'])delete environment[key];
const result=spawnSync(process.execPath,['--max-old-space-size=384',cli,'build'],{cwd:path.join(root,'frontend'),stdio:'inherit',env:environment});
process.exitCode=result.status||0;
if(result.error){console.error('[build] '+result.error.message);process.exitCode=1;}
