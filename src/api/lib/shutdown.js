/**
 * Process lifecycle: stop the server cleanly on SIGTERM / SIGINT and keep it
 * alive (but loud) when a promise rejection goes unhandled.
 * @module api/lib/shutdown
 */

import { cancelJob, listJobs } from './jobs.js';

/**
 * Stop accepting work and release everything the server holds: running jobs
 * are cancelled (which kills their ffmpeg children), WebSocket clients are
 * dropped, and HTTP connections are given `graceMs` to finish.
 * @param {import('node:http').Server} server
 * @param {{ clients: Set<{ terminate: () => void }>, close: () => void }} [wss]
 * @param {{ graceMs?: number }} [opts]
 * @returns {Promise<void>} Resolves once the HTTP server has closed
 */
export function stopServer(server, wss, opts = {}) {
  const { graceMs = 5000 } = opts;
  for (const job of listJobs()) {
    if (job.status === 'queued' || job.status === 'running') cancelJob(job.id);
  }
  if (wss) {
    for (const client of wss.clients) client.terminate();
    wss.close();
  }
  return new Promise((resolvePromise) => {
    const force = setTimeout(() => server.closeAllConnections(), graceMs);
    server.close(() => {
      clearTimeout(force);
      resolvePromise();
    });
    server.closeIdleConnections();
  });
}

/**
 * Install the process-level handlers. Call once, from the entry point only
 * (never from code that tests import).
 * @param {() => Promise<void>} stop - Releases resources; the process exits when it settles
 */
export function installProcessHandlers(stop) {
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled promise rejection:', reason);
  });

  let stopping = false;
  /** @param {string} signal */
  const onSignal = (signal) => {
    if (stopping) {
      console.error(`[server] ${signal} again, exiting now`);
      process.exit(1);
    }
    stopping = true;
    console.log(`[server] ${signal} received, shutting down`);
    stop().then(
      () => process.exit(0),
      (err) => {
        console.error('[server] Shutdown failed:', err);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}
