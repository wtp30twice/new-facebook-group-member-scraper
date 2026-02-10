# Fix crawlee-one log level crash

**Error:** `Options "level" must be one of log.LEVELS enum!` at `node_modules/crawlee-one/dist/cjs/lib/actor/actor.js:170`

**Cause:** crawlee-one calls `new Log({ level })` with an invalid value. `@apify/log` requires a value from `log.LEVELS`.

## Automatic patch (recommended)

Run `npm install` in the project root. The `postinstall` script runs `scripts/patch-crawlee-log.js`, which patches the file automatically.

## Manual patch

If you need to edit the file by hand (e.g. in Apify build or in `node_modules`):

1. Open: `node_modules/crawlee-one/dist/cjs/lib/actor/actor.js`
2. At the **top** of the file (after `'use strict';` if present), add:
   ```js
   const { Log, LEVELS } = require('@apify/log');
   ```
3. Find the `new Log(...)` call around **line 170**.
4. Replace it so the options use a valid enum. For example change:
   ```js
   new Log({ level: someVariable })
   ```
   to:
   ```js
   new Log({
     level: LEVELS.INFO,
   })
   ```

Result: the logger always uses `LEVELS.INFO` and the runtime crash is fixed.
