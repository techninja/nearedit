#!/usr/bin/env node

/**
 * Post-install setup — makes a fresh clone runnable: creates the local env
 * file `npm run dev` expects, vendors browser dependencies and fonts, and
 * builds the icon sprite.
 * @module scripts/setup
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ENV_LOCAL_TEMPLATE = `# Local settings for this machine (git-ignored). Values here override .env.
# Every variable is described in docs/app-spec/CONFIGURATION.md.
`;

/**
 * `npm run dev` passes --env-file=.env.local, and Node refuses to start when
 * that file is missing. Create it once; never touch an existing one.
 */
function ensureEnvLocal() {
  const file = resolve(ROOT, '.env.local');
  try {
    writeFileSync(file, ENV_LOCAL_TEMPLATE, { flag: 'wx' });
    console.log('✓ Created .env.local');
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

ensureEnvLocal();
await import(pathToFileURL(resolve(ROOT, 'scripts/vendor-deps.js')).href);
await import(pathToFileURL(resolve(ROOT, 'scripts/vendor-fonts.js')).href);
await import(pathToFileURL(resolve(ROOT, 'scripts/build-icons.js')).href);
