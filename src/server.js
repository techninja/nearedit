/**
 * Express server entry point: the API under /api, the no-build frontend from
 * src/, and the job WebSocket on /ws.
 * @module server
 */

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { browseRouter } from './api/browse.js';
import { cutoutRouter } from './api/cutout.js';
import { directorRouter } from './api/director.js';
import { indexerRouter } from './api/indexer.js';
import { intelligenceRouter } from './api/intelligence.js';
import { jobsRouter } from './api/jobs.js';
import { kitsRouter } from './api/kits.js';
import { authEnabled, requireAuth } from './api/lib/auth.js';
import { getConfig } from './api/lib/config.js';
import { apiNotFound, errorHandler } from './api/lib/httpErrors.js';
import { installProcessHandlers, stopServer } from './api/lib/shutdown.js';
import { mediaRouter } from './api/media.js';
import { musicRouter } from './api/music.js';
import { pickerRouter } from './api/picker.js';
import { previewsRouter } from './api/previews.js';
import { projectsRouter } from './api/projects.js';
import { renderRouter } from './api/render.js';
import { themesRouter } from './api/themes.js';
import { transcodeRouter } from './api/transcode.js';
import { webRouter } from './api/web.js';
import { attachWebSocket } from './api/ws.js';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
/** Timeline documents are the largest bodies; 10 MB is thousands of clips. */
const BODY_LIMIT = '10mb';

const app = express();
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  // Other sites may not embed this server's media or API responses.
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});
app.use(requireAuth);
app.use(express.json({ limit: BODY_LIMIT }));

const routers = [
  projectsRouter,
  mediaRouter,
  previewsRouter,
  transcodeRouter,
  browseRouter,
  pickerRouter,
  jobsRouter,
  indexerRouter,
  intelligenceRouter,
  directorRouter,
  renderRouter,
  webRouter,
  musicRouter,
  cutoutRouter,
  kitsRouter,
  themesRouter,
];
for (const router of routers) app.use('/api', router);
app.use('/api', apiNotFound);

app.use(express.static(SRC_DIR));

// SPA fallback: any other page URL (no file extension) loads the app shell.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.includes('.')) return next();
  res.sendFile('index.html', { root: SRC_DIR });
});

app.use(errorHandler);

/** @type {WeakMap<import('node:http').Server, import('ws').Server>} */
const socketServers = new WeakMap();

/**
 * Start the server.
 * @param {number} [port] - Defaults to PORT from the environment (3000)
 * @returns {import('node:http').Server}
 */
export function start(port = getConfig().port) {
  const { host } = getConfig();
  const onListening = (/** @type {Error} */ err) => {
    if (err) return; // Express also hands listen failures here; the 'error' handler reports them
    const address = server.address();
    const bound = address && typeof address === 'object' ? address.port : port;
    console.log(`NearEdit listening on http://${host || 'localhost'}:${bound}`);
    const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
    if (!authEnabled() && !loopback) {
      console.log('No NEAREDIT_PASSWORD set: anyone who can reach this port can use the editor.');
    }
  };
  const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);
  socketServers.set(server, attachWebSocket(server));
  server.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
    if (err.syscall !== 'listen') return console.error('[server]', err);
    if (err.code === 'EADDRINUSE') console.error(`Port ${port} in use. Try: PORT=4354 npm start`);
    else console.error('[server] Failed to start:', err.message);
    process.exit(1);
  });
  return server;
}

/**
 * Stop a server returned by start(): running jobs are cancelled, WebSocket
 * clients dropped and open HTTP connections given a moment to finish.
 * @param {import('node:http').Server} server
 * @param {{ graceMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export function stop(server, opts) {
  return stopServer(server, socketServers.get(server), opts);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const server = start();
  installProcessHandlers(() => stop(server));
}

export default app;
