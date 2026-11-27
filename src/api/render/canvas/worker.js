/**
 * A canvas render worker — a process of its own, started by `workers.js`.
 * Drawing is synchronous and CPU-bound, so it must not run on the server's
 * event loop; a process per worker also gives each its own compositor
 * environment, real parallelism, and memory that is returned to the system
 * when the render is over.
 *
 * Messages in: `{ type: 'init', edl, options }` once, then
 * `{ type: 'segment', id, options }` per segment. Messages out:
 * `{ type: 'frames', id, done }`, `{ type: 'done', id, result }`,
 * `{ type: 'warn', message }`, `{ type: 'failed', id, message, aborted }`.
 * @module api/render/canvas/worker
 */

import { createCanvasHost } from './host.js';
import { renderCanvasSegment } from './segment.js';

/** Milliseconds between progress messages. */
const REPORT_EVERY = 200;

const host = createCanvasHost();
const stopping = new AbortController();
/** @type {{ edl: any, options: object }|null} */
let job = null;
/** The segment being rendered, settled when it is over. */
let running = Promise.resolve();

/** @param {object} message */
const send = (message) => {
  if (process.connected) process.send(message);
};

/**
 * @param {string} id
 * @param {object} options - What differs per segment: `range`, `outputPath`
 */
async function render(id, options) {
  let reported = 0;
  const onFrame = (done, total) => {
    const now = Date.now();
    if (done < total && now - reported < REPORT_EVERY) return;
    reported = now;
    send({ type: 'frames', id, done });
  };
  const warn = (message) => send({ type: 'warn', message });
  try {
    const all = { ...job.options, ...options };
    const hooks = { host, onFrame, warn, signal: stopping.signal };
    send({ type: 'done', id, result: await renderCanvasSegment(job.edl, all, hooks) });
  } catch (err) {
    send({ type: 'failed', id, message: err.message, aborted: err.killedBy === 'aborted' });
  }
}

/** Kill what is running, wait for it to clean up, then leave. */
function stop() {
  stopping.abort();
  const patience = new Promise((resolve) => setTimeout(resolve, 2000));
  Promise.race([running, patience]).then(() => process.exit(0));
}

process.on('message', (/** @type {any} */ message) => {
  if (message.type === 'init') job = { edl: message.edl, options: message.options };
  else if (message.type === 'segment') running = render(message.id, message.options);
});
// The parent went away (or asked us to): nothing may keep running.
process.on('disconnect', stop);
process.on('SIGTERM', stop);
// Ctrl+C in a terminal reaches every process of the group. The parent
// decides what an interrupt means; it stops us through the two above.
process.on('SIGINT', () => {});
