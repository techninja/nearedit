/**
 * Express server entry point.
 * @module server
 */

import express from 'express';
import { entityRouter } from './api/entities.js';
import { eventsRouter } from './api/events.js';
import { renderRouter } from './api/render.js';
import { mediaRouter } from './api/media.js';
import { previewsRouter } from './api/previews.js';
import { projectsRouter } from './api/projects.js';
import { pickerRouter } from './api/picker.js';
import { indexerRouter } from './api/indexer.js';
import { intelligenceRouter } from './api/intelligence.js';
import { directorRouter } from './api/director.js';
import { silenceRouter } from './api/silence.js';
import { transcodeRouter } from './api/transcode.js';
import { jobsRouter } from './api/jobs.js';
import { attachWebSocket } from './api/ws.js';

const app = express();

app.use(express.json({ limit: '10mb' }));

app.use('/api', eventsRouter);
app.use('/api', projectsRouter);
app.use('/api', pickerRouter);
app.use('/api', indexerRouter);
app.use('/api', intelligenceRouter);
app.use('/api', directorRouter);
app.use('/api', silenceRouter);
app.use('/api', transcodeRouter);
app.use('/api', jobsRouter);
app.use('/api', renderRouter);
app.use('/api', mediaRouter);
app.use('/api', previewsRouter);
app.use('/api', entityRouter);

app.use(express.static('src'));
app.use('/media', express.static('media'));

// SPA fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.includes('.') && !req.path.startsWith('/api')) {
    return res.sendFile('index.html', { root: 'src' });
  }
  next();
});

/**
 * Start the server.
 * @param {number} [port=3000]
 * @returns {import('node:http').Server}
 */
export function start(port = 3000) {
  const server = app.listen(port, () => console.log(`http://localhost:${port}`));

  attachWebSocket(server);
  server.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${port} in use. Try: PORT=4354 npm start`);
    else console.error(err);
    process.exit(1);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start(parseInt(process.env.PORT) || 3000);
}

export default app;
