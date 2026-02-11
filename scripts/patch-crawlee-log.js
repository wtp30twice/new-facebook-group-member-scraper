const fs = require('fs');
const path = require('path');

const actorJsPath = path.join(__dirname, '..', 'node_modules', 'crawlee-one', 'dist', 'cjs', 'lib', 'actor', 'actor.js');

console.log('Patching crawlee-one actor.js...');

if (!fs.existsSync(actorJsPath)) {
  console.log('ERROR: actor.js not found at', actorJsPath);
  process.exit(1);
}

let content = fs.readFileSync(actorJsPath, 'utf8');

// Find and replace the Log constructor at line 170
// Look for the specific pattern around that line
const before = content;

// Replace ALL instances of new Log(...) with safe version
content = content.replace(
  /new\s+Log\s*\(\s*({[^}]+})\s*\)/g,
  'new Log({ level: 4 })'
);

if (content === before) {
  console.log('WARNING: No changes made - pattern not found!');
  console.log('Dumping first 500 chars around line 170...');
  const lines = content.split('\n');
  console.log(lines.slice(165, 175).join('\n'));
} else {
  fs.writeFileSync(actorJsPath, content, 'utf8');
  console.log('✓ Patch applied successfully!');
}
