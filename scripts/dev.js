require('./preflight');
const path = require('path');
const concurrently = require('concurrently');
const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start with npm run dev.');
const command = folder => `"${process.execPath}" "${npmCli}" --prefix ${folder} run dev`;
const { result, commands } = concurrently([
  { name: 'backend', command: command('backend'), prefixColor: 'cyan', env: { PORT: '5001', HOST: '127.0.0.1' } },
  { name: 'frontend', command: command('frontend'), prefixColor: 'magenta', env: { PORT: '3000', HOST: '127.0.0.1', BROWSER: 'none' } }
], { cwd: root, killOthersOn: ['success', 'failure'], killTimeout: 5000 });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\n[launcher] Stopping AMS child processes...');
  for (const child of commands) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', data => { if (data.includes(3) || data.includes(4)) stop(); });
}
function finish(code) {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(code);
}
result.then(() => finish(0), () => finish(stopping ? 0 : 1));
