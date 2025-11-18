const fs = require('fs');
const path = require('path');

const pkgDir = path.join(__dirname, '..', 'node_modules', '@yudiel', 'react-qr-scanner', 'dist');

function stripSourceMapComments(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    // remove both single-line and block style sourceMappingURL comments
    const cleaned = content
      .replace(/\/\/#\s*sourceMappingURL=.*$/gim, '')
      .replace(/\/\*#\s*sourceMappingURL=.*?\*\//gims, '');
    if (cleaned !== content) {
      fs.writeFileSync(filePath, cleaned, 'utf8');
      console.log('Patched:', filePath);
    }
  } catch (err) {
    // ignore missing files quietly
  }
}

function walkDir(dir) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        walkDir(p);
      } else if (stat.isFile()) {
        if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.map') || p.endsWith('.cjs') || p.endsWith('.cjs.js')) {
          stripSourceMapComments(p);
        }
      }
    }
  } catch (err) {
    // ignore and continue
  }
}

try {
  if (fs.existsSync(pkgDir)) {
    walkDir(pkgDir);
    console.log('Done patching @yudiel/react-qr-scanner dist files.');
  } else {
    console.log('QR scanner dist folder not found, skipping.');
  }
} catch (err) {
  console.error('Error while patching qr-scanner files:', err.message || err);
  process.exit(0);
}
