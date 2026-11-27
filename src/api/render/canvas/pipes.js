/**
 * FFmpeg at the two ends of the compositor: a decoder whose stdout is read
 * one raw frame at a time, and an encoder whose stdin is fed one raw frame
 * at a time. Neither side ever holds more than the frame in flight plus what
 * fits in a pipe, so a slow stage simply makes the others wait.
 * @module api/render/canvas/pipes
 */

import { spawn } from 'node:child_process';

/**
 * Start FFmpeg and keep the end of what it says on stderr.
 * @param {string[]} args
 * @param {('pipe'|'ignore')[]} stdio - stdin, stdout (stderr is always read)
 * @returns {{ child: import('node:child_process').ChildProcess,
 *   exited: Promise<number|null>, said: () => string, kill: () => void }}
 *   `exited` resolves with the exit code (null when killed or not started)
 */
function ffmpeg(args, stdio) {
  const child = spawn('ffmpeg', args, { stdio: [...stdio, 'pipe'] });
  let tail = '';
  child.stderr.on('data', (chunk) => {
    tail = (tail + chunk).slice(-2000);
  });
  const exited = new Promise((resolve) => {
    child.on('error', (err) => {
      tail += `\n${err.message}`;
      resolve(null);
    });
    child.on('close', (code) => resolve(code));
  });
  const said = () => tail.trim().split('\n').slice(-3).join(' | ');
  return { child, exited, said, kill: () => child.kill('SIGKILL') };
}

/**
 * Read a stream in pieces of exactly `size` bytes. Nothing is read ahead of
 * the caller: the stream stays paused between calls, which is what holds a
 * decoder back.
 * @param {import('node:stream').Readable} stream
 * @param {number} size
 * @returns {() => Promise<Buffer|null>} The next piece; null at the end (a
 *   last, incomplete piece is dropped)
 */
export function frameReader(stream, size) {
  let ended = false;
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
  return async () => {
    for (;;) {
      const piece = stream.read(size);
      if (piece?.length === size) return piece;
      if (piece || ended) return null;
      await new Promise((resolve) => {
        wake = /** @type {() => void} */ (resolve);
      });
    }
  };
}

/**
 * Decode footage to raw frames.
 * @param {{ args: string[], width: number, height: number, file: string }} footage
 * @returns {{ next: () => Promise<Buffer|null>, close: () => void }} `next`
 *   gives one RGBA frame, or null when the source has no more
 */
export function openDecoder(footage) {
  const running = ffmpeg(footage.args, ['ignore', 'pipe']);
  const read = frameReader(running.child.stdout, footage.width * footage.height * 4);
  let closed = false;
  return {
    async next() {
      const frame = await read();
      if (frame || closed) return frame;
      const code = await running.exited;
      if (code === 0 || closed) return null;
      throw new Error(
        `Cannot decode source file: ${footage.file} (${running.said() || 'FFmpeg failed'})`,
      );
    },
    close() {
      closed = true;
      running.kill();
    },
  };
}

/**
 * Encode raw frames.
 * @param {string[]} args - FFmpeg arguments reading raw video from `pipe:0`
 * @returns {{ write: (frame: Buffer) => Promise<void>, finish: () => Promise<void>,
 *   kill: () => Promise<void> }} `write` resolves once FFmpeg has taken the
 *   frame; `finish` once the file is complete; `kill` once the process is gone
 */
export function openEncoder(args) {
  const running = ffmpeg(args, ['pipe', 'ignore']);
  const { stdin } = running.child;
  /** @type {Error|null} */
  let broken = null;
  // A dead encoder shows as EPIPE here; what it said is the useful part.
  stdin.on('error', (err) => {
    broken = err;
  });
  const failure = async () => {
    await running.exited;
    return new Error(`FFmpeg failed: ${running.said() || broken?.message || 'encoder stopped'}`);
  };
  return {
    async write(frame) {
      if (broken) throw await failure();
      const error = await new Promise((resolve) => stdin.write(frame, (err) => resolve(err)));
      if (error) throw await failure();
    },
    async finish() {
      stdin.end();
      if ((await running.exited) !== 0) throw await failure();
    },
    async kill() {
      running.kill();
      await running.exited;
    },
  };
}
