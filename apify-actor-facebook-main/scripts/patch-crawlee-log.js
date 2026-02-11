const fs = require('fs');
const path = require('path');

const actorJsPath = path.join(__dirname, '..', 'node_modules', 'crawlee-one', 'dist', 'cjs', 'lib', 'actor', 'actor.js');

console.log('Patching crawlee-one actor.js...');

let content = fs.readFileSync(actorJsPath, 'utf8');
const before = content;

content = content.replace(
  /new\s+crawlee_1\.Log\s*\(\s*\{\s*level:\s*logLevel\s*\?\s*log_1\.logLevelToCrawlee\[logLevel\]\s*:\s*undefined\s*\}\s*\)/g,
  "new crawlee_1.Log({ level: 'INFO' })"
);

if (content === before) {
  console.log('ERROR: Pattern not found!');
  process.exit(1);
}

fs.writeFileSync(actorJsPath, content, 'utf8');
console.log('✓ Patched successfully!');
