/**
 * A child process as one stage of the cutout pipeline: started with an
 * argument array (never a shell), its stderr kept for the error message,
 * its stdout read in pieces of exactly one frame and its stdin written one
 * frame at a time. Nothing is read ahead of the caller and no write is
 * started before the last one was taken, so a slow stage holds back the
 * ones before it instead of filling memory.
 * @module api/cutout/process
 */

import { spawn } from 'node:child_process';

/** After a process has ended, its last words on stderr are waited for this long. */
const STDERR_GRACE_MS = 500;

/**
 * @typedef {Object} Stage
 * @property {string} name - For messages: "the matte program"
 * @property {import('node:child_process').ChildProcess} child
 * @property {Promise<number|null>} exited - The exit code, once the process
 *   has ended and its stderr is read; null when it was killed or never started
 * @property {() => string} said - The end of what it wrote on stderr
 * @property {() => boolean} failedToStart
 * @property {(piece: Buffer) => Promise<void>} write - Resolves once the
 *   process has taken the piece; rejects when it cannot (it has gone)
 * @property {() => void} end - No more input
 * @property {() => void} kill
 */

/**
 * Start a stage.
 * @param {string} name
 * @param {{ cmd: string, args: string[] }} command
 * @param {{ stdin?: boolean, stdout?: boolean }} [pipes] - Which of them the caller uses
 * @returns {Stage}
 */
export function startStage(name, { cmd, args }, pipes = {}) {
  const stdio = [pipes.stdin ? 'pipe' : 'ignore', pipes.stdout ? 'pipe' : 'ignore', 'pipe'];
  const child = spawn(cmd, args, { stdio: /** @type {any} */ (stdio), windowsHide: true });
  let tail = '';
  let unstarted = false;
  /** @type {Error|null} */
  let broken = null;
  child.stderr.on('data', (chunk) => {
    tail = (tail + chunk).slice(-4000);
  });
  // A stage that has gone shows as EPIPE on its stdin; `write` reports it.
  child.stdin?.on('error', (err) => {
    broken = err;
  });
  // Over when the process has ended and what it said is read — not when its
  // other pipes close: a pipe nobody reads any more would never do that.
  const exited = new Promise((resolve) => {
    child.on('error', (err) => {
      unstarted = true;
      tail += `\n${err.message}`;
      resolve(null);
    });
    child.on('exit', (code) => {
      const said = () => resolve(code);
      if (child.stderr.readableEnded || child.stderr.destroyed) return said();
      child.stderr.once('close', said);
      setTimeout(said, STDERR_GRACE_MS).unref();
    });
  });
  return {
    ...{ name, child, exited },
    said: () =>
      tail
        .trim()
        .split(/[\r\n]+/)
        .slice(-4)
        .join(' | '),
    failedToStart: () => unstarted,
    write(piece) {
      return new Promise((resolve, reject) => {
        if (broken || !child.stdin?.writable) return reject(broken || new Error('closed'));
        child.stdin.write(piece, (err) => (err ? reject(err) : resolve()));
      });
    },
    end: () => void child.stdin?.end(),
    kill() {
      child.kill('SIGKILL');
      // What is still in its pipes is of no use to anyone.
      child.stdin?.destroy();
      child.stdout?.destroy();
    },
  };
}

/**
 * Read a stream in pieces of exactly `size` bytes. The stream stays paused
 * between calls — that is what holds the process behind it back.
 * @param {import('node:stream').Readable} stream
 * @param {number} size
 * @returns {{ next: () => Promise<Buffer|null>, rest: () => number }} `next`
 *   gives the next piece, or null at the end; `rest` then says how many
 *   bytes of an unfinished piece the stream ended with
 */
export function pieceReader(stream, size) {
  let ended = false;
  let rest = 0;
  /** @type {(() => void)|null} */
  let wake = null;
  const poke = () => {
    const waiting = wake;
    wake = null;
    waiting?.();
  };
  const finish = () => {
    ended = true;
    poke();
  };
  stream.on('readable', poke).on('end', finish).on('error', finish).on('close', finish);
  return {
    async next() {
      for (;;) {
        const piece = stream.read(size);
        if (piece?.length === size) return piece;
        if (piece) rest += piece.length;
        if (piece || ended) return null;
        await new Promise((resolve) => {
          wake = /** @type {() => void} */ (resolve);
        });
      }
    },
    rest: () => rest,
  };
}
