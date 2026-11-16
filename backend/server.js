const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');
const db = require('./config/sqlite');
const {isProduction,publicOrigin}=require('./config/environment');
function startServer() {
  if(isProduction){const run=db.get("SELECT metadata_json FROM demo_seed_runs WHERE seed_key='ams-amihan-fictional-demo-v1'");if(!run||JSON.parse(run.metadata_json).hosted!==true)throw new Error('Hosted demo is not initialized. Start from the project root with npm start.');}
  const app = createApp();
  const server = http.createServer(app);
  const allowed=isProduction?[publicOrigin()]:['http://localhost:3000','http://127.0.0.1:3000'];
  const io = new Server(server, { cors: { origin: allowed }, allowRequest:(req,done)=>done(null,!req.headers.origin||allowed.includes(req.headers.origin)) });
  app.set('io', io);
  require('./services/meterGateway').initMeterGateway(io, app);
  const host = isProduction?'0.0.0.0':(process.env.HOST || '127.0.0.1'), port = Number(process.env.PORT || (isProduction?10000:5001));
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be a valid TCP port.');
  server.listen(port, host, () => {
    console.log('[backend] AMS API ready at http://' + host + ':' + server.address().port + ' (SQLite initialized)');
    if(isProduction)console.log('[backend] Initial process RSS: '+Math.ceil(process.memoryUsage().rss/1024/1024)+' MiB');
  });
  server.on('error', error => { console.error('[backend] Unable to listen: ' + error.code); db.close(); process.exitCode = 1; });
  function stop() { io.close(); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); }
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return { app, server, io };
}
if (require.main === module) { try { startServer(); } catch (error) { console.error('[backend] Startup failed: ' + error.message); process.exitCode = 1; } }
module.exports = { startServer };
