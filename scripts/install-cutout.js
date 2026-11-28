#!/usr/bin/env node

/**
 * `npm run install-cutout` — download the matting model the person cutout
 * runs (MODNet as ONNX, Apache 2.0, 26 MB) into the data folder, make sure
 * it loads, and say whether the Python it will run in has what it needs.
 * Run it once; NearEdit never downloads anything by itself.
 *
 *   node scripts/install-cutout.js [--force] [--url <url>]
 *
 * Exit status: 0 ready to cut out, 1 the model could not be installed,
 * 2 bad arguments, 3 the model is installed but the Python side is not
 * ready (the last line says what to run).
 *
 * @module scripts/install-cutout
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/api/lib/config.js';
import { installModel } from '../src/api/cutout/install.js';
import { probeBuiltin } from '../src/api/cutout/probeBuiltin.js';
import { builtinProvider } from '../src/api/cutout/provider.js';

const args = process.argv.slice(2);
const urlAt = args.indexOf('--url');
const isUrl = (/** @type {number} */ i) => urlAt >= 0 && i === urlAt + 1;
const unknown = args.find((arg, i) => !['--force', '--url'].includes(arg) && !isUrl(i));
if (unknown || (urlAt >= 0 && !args[urlAt + 1])) {
  console.error('Usage: npm run install-cutout -- [--force] [--url <url>]');
  process.exit(2);
}

// Behind a proxy Node only uses it when told to before it starts.
const proxied = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxied && !process.env.NODE_USE_ENV_PROXY) {
  const again = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(again.status ?? 1);
}

const { dataDir, cutout } = getConfig();
const worker = builtinProvider();

try {
  const installed = await installModel({
    dataDir,
    log: (line) => console.log(line),
    // The worker itself, with the Python it will run in, on the file in question.
    check: (file) => probeBuiltin({ ...worker, modelFile: file, chosen: false }),
    force: args.includes('--force'),
    ...(urlAt >= 0 && { url: args[urlAt + 1] }),
  });
  if (cutout.command.trim())
    console.log('Note: CUTOUT_COMMAND is set — NearEdit uses that program, not this model.');
  else if (worker.chosen && worker.modelFile !== installed.path)
    console.log(
      `Note: CUTOUT_MODEL is set — NearEdit reads ${worker.modelFile}, not this file. Unset it to use this one.`,
    );
  process.exit(installed.ready ? 0 : 3);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
