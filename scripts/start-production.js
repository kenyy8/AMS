// No Windows paths, local .env loading, local database copies, or public manifests.
process.env.NODE_ENV = 'production';
async function main() {
  const {validateProduction,databasePath}=require('../backend/config/environment');
  validateProduction();
  process.env.SQLITE_PATH=databasePath();
  await require('../backend/scripts/seed-demo').main({keepOpen:true});
  require('../backend/server').startServer();
}
main().catch(error=>{console.error('[production] Startup refused: '+error.message);process.exit(1);});
