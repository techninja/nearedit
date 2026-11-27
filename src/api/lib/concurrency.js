/**
 * Small concurrency primitives for work that spawns processes: a limiter so a
 * burst of requests cannot start hundreds of ffmpeg/ffprobe children, and a
 * single-flight map so concurrent requests for one result share one run.
 * @module api/lib/concurrency
 */

/**
 * Create a function that runs async tasks at most `limit` at a time, in
 * arrival order.
 * @param {number} limit
 * @returns {<T>(task: () => Promise<T> | T) => Promise<T>}
 */
export function createLimiter(limit) {
  const max = Math.max(1, Math.floor(limit) || 1);
  /** @type {(() => void)[]} */
  const queue = [];
  let active = 0;

  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (!start) return;
    active++;
    start();
  };

  return (task) =>
    new Promise((resolvePromise, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolvePromise, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

/**
 * Create a single-flight runner: while a task for `key` is in progress, every
 * further call with that key receives the same promise instead of starting
 * another run. The entry is released when the task settles.
 * @returns {(<T>(key: string, task: () => Promise<T>) => Promise<T>) & { size: () => number }}
 */
export function createSingleFlight() {
  /** @type {Map<string, Promise<any>>} */
  const flights = new Map();

  const run = (key, task) => {
    const existing = flights.get(key);
    if (existing) return existing;
    const flight = Promise.resolve()
      .then(task)
      .finally(() => flights.delete(key));
    flights.set(key, flight);
    return flight;
  };
  run.size = () => flights.size;
  return run;
}
