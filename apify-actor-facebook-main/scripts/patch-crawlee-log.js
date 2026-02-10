#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const actorPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'crawlee-one',
  'dist',
  'cjs',
  'lib',
  'actor',
  'actor.js'
);

if (!fs.existsSync(actorPath)) {
  console.warn('patch-crawlee-log: crawlee-one actor.js not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(actorPath, 'utf8');

const logRequire = "const { Log, LEVELS } = require('@apify/log');";

if (!content.includes('LEVELS.INFO')) {
  if (content.startsWith("'use strict';")) {
    content = content.replace("'use strict';", "'use strict';\n" + logRequire);
  } else {
    content = logRequire + '\n' + content;
  }
}

content = content.replace(
  /(new\s+Log\s*\(\s*\{[\s\S]*?)level\s*:\s*[^,}\n]+/g,
  '$1level: LEVELS.INFO'
);

fs.writeFileSync(actorPath, content, 'utf8');
console.log('patch-crawlee-log: patched crawlee-one');
