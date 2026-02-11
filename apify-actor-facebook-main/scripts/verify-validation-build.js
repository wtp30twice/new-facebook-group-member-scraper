/**
 * Run after npm run build:ci to ensure dist/cjs/actors/groupMedia/validation.js
 * includes the cookies field in the Joi schema. Exit 1 if not found.
 */
const fs = require('fs');
const path = require('path');

const validationPath = path.join(__dirname, '..', 'dist', 'cjs', 'actors', 'groupMedia', 'validation.js');

if (!fs.existsSync(validationPath)) {
  console.error('ERROR: dist/cjs/actors/groupMedia/validation.js not found. Run npm run build:ci first.');
  process.exit(1);
}

const content = fs.readFileSync(validationPath, 'utf8');

if (!content.includes('cookies')) {
  console.error('ERROR: validation.js does not contain "cookies". Build is out of sync with src.');
  process.exit(1);
}

console.log('OK: dist/cjs/actors/groupMedia/validation.js includes cookies in Joi schema.');
process.exit(0);
