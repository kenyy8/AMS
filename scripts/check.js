const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const parser = require(require.resolve('@babel/parser', { paths: [path.join(root, 'frontend')] }));
let failures = 0, count = 0;
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => ['node_modules', 'data', 'legacy', 'build', '.npm-cache'].includes(entry.name) ? [] : entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
for (const file of [...walk(path.join(root, 'backend')), ...walk(path.join(root, 'frontend/src')), ...walk(path.join(root, 'scripts'))].filter(file => file.endsWith('.js'))) {
  count++;
  const source = fs.readFileSync(file, 'utf8');
  try {
    const tree = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
    const references = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) references.push(node.source.value);
      if (node.type === 'CallExpression' && node.callee?.name === 'require' && node.arguments[0]?.type === 'StringLiteral') references.push(node.arguments[0].value);
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
    visit(tree);
    for (const reference of references) {
      if (reference.startsWith('.')) {
        const target = path.resolve(path.dirname(file), reference);
        if (![target, target + '.js', target + '.json', path.join(target, 'index.js')].some(file => fs.existsSync(file))) throw new Error('Missing import ' + reference);
      } else require.resolve(reference, { paths: [path.dirname(file)] });
    }
  } catch (error) { failures++; console.error(path.relative(root, file) + ': ' + error.message); }
}
const schema = spawnSync(process.execPath, ['-e', "const db=require('./backend/config/sqlite'); db.migrate(); if(db.get('PRAGMA integrity_check').integrity_check!=='ok'||db.all('PRAGMA foreign_key_check').length)process.exitCode=1; db.close();"], { cwd: root, env: { ...process.env, SQLITE_PATH: ':memory:' }, encoding: 'utf8' });
if (schema.status) { failures++; console.error(schema.stderr); }
console.log(`[check] ${count} JavaScript files checked; in-memory SQLite initialization, rerun, and integrity ${schema.status ? 'FAILED' : 'passed'}.`);
process.exitCode = failures ? 1 : 0;
