/**
 * The canvas render workers of one job: processes that each draw one
 * segment at a time (`worker.js`). They are started when first needed,
 * reused from segment to segment, and killed when the job ends or is
 * cancelled — with their FFmpeg children.
 * @module api/render/canvas/workers
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./worker.js', import.meta.url));

/**
 * @typedef {Object} Task
 * @property {(result: any) => void} resolve
 * @property {(err: Error) => void} reject
 * @property {(done: number) => void} onFrames
 */

/**
 * Start a worker process and teach it the document.
 * @param {{ edl: any, options: object }} job
 * @param {(message: string) => void} warn
 * @returns {{ child: import('node:child_process').ChildProcess, task: Task|null }}
 */
function start(job, warn) {
  // Its console goes to our stderr, never into a caller's stdout.
  const child = fork(WORKER, [], { execArgv: [], stdio: ['ignore', 2, 2, 'ipc'] });
  /** @type {{ child: typeof child, task: Task|null }} */
  const worker = { child, task: null };
  const settle = (/** @type {(task: Task) => void} */ how) => {
    const { task } = worker;
    worker.task = null;
    if (task) how(task);
  };
  child.on('message', (/** @type {any} */ message) => {
    if (message.type === 'warn') warn(message.message);
    else if (message.type === 'frames') worker.task?.onFrames(message.done);
    else if (message.type === 'done') settle((task) => task.resolve(message.result));
    else if (message.type === 'failed') {
      const error = new Error(message.message);
      settle((task) =>
        task.reject(Object.assign(error, message.aborted && { killedBy: 'aborted' })),
      );
    }
  });
  const lost = (/** @type {string} */ why) =>
    settle((task) => task.reject(new Error(`The canvas renderer stopped unexpectedly (${why})`)));
  child.on('error', (err) => lost(err.message));
  child.on('exit', (code, signal) => lost(signal || `exit code ${code}`));
  child.send({ type: 'init', ...job });
  return worker;
}

/**
 * Wait for a worker process to end; one that ignores the request is killed.
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function gone(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
  });
}

/**
 * Create the workers of a job. No process exists until a segment is rendered.
 * @param {any} edl - A checked document
 * @param {object} options - Plan options shared by every segment (`probes`, `preset`…)
 * @param {{ signal?: AbortSignal, warn?: (message: string) => void }} [hooks]
 * @returns {{ render: (options: object, onFrames?: (done: number) => void) => Promise<any>,
 *   close: () => Promise<void> }} `render` draws one segment (its `range` and
 *   `outputPath` in `options`) on an idle worker, starting one if there is
 *   none: the caller's own concurrency is the limit. `close` resolves when
 *   every worker has gone
 */
export function createCanvasWorkers(edl, options, hooks = {}) {
  const { signal, warn = () => {} } = hooks;
  /** @type {ReturnType<typeof start>[]} */
  const all = [];
  let next = 0;
  let closed = false;
  const stop = () => {
    closed = true;
    for (const worker of all) worker.child.kill('SIGTERM');
  };
  signal?.addEventListener('abort', stop, { once: true });

  return {
    render(segment, onFrames = () => {}) {
      if (closed || signal?.aborted)
        return Promise.reject(Object.assign(new Error('render aborted'), { killedBy: 'aborted' }));
      let worker = all.find((candidate) => !candidate.task && candidate.child.connected);
      if (!worker) all.push((worker = start({ edl, options }, warn)));
      return new Promise((resolve, reject) => {
        worker.task = { resolve, reject, onFrames };
        worker.child.send({ type: 'segment', id: String(next++), options: segment });
      });
    },
    async close() {
      signal?.removeEventListener('abort', stop);
      stop();
      await Promise.all(all.map((worker) => gone(worker.child)));
    },
  };
}
