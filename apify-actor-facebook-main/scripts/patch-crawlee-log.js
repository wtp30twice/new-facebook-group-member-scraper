#!/usr/bin/env node
/**
 * Patch crawlee-one so it always passes a valid log level (LEVELS.INFO) to @apify/log.
 * Run after npm install so the actor doesn't crash with "Options level must be one of log.LEVELS enum!"
 *
 * Usage: node scripts/patch-crawlee-log.js
 */
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

// Already patched?
if (content.includes('LEVELS.INFO') && content.includes('@apify/log')) {
  console.log('patch-crawlee-log: already patched');
  process.exit(0);
}

// 1) Add exact require at top (after "use strict" if present): const { Log, LEVELS } = require('@apify/log');
const logRequire = "const { Log, LEVELS } = require('@apify/log');";
if (!content.includes('LEVELS.INFO')) {
  if (content.startsWith("'use strict';")) {
    content = content.replace("'use strict';", "'use strict';\n" + logRequire);
  } else {
    content = logRequire + '\n' + content;
  }
}

// 2) Force new Log({ ... }) to use level: LEVELS.INFO (fixes "Options level must be one of log.LEVELS enum!")
content = content.replace(
  /(new\s+Log\s*\(\s*\{[^}]*?)level\s*:\s*[^,}\n]+/g,
  '$1level: LEVELS.INFO'
);
content = content.replace(
  /(new\s+Log\s*\(\s*\{[\s\S]*?)level\s*:\s*[^,}\n]+/g,
  '$1level: LEVELS.INFO'
);

fs.writeFileSync(actorPath, content, 'utf8');
console.log('patch-crawlee-log: patched crawlee-one to use LEVELS.INFO');
