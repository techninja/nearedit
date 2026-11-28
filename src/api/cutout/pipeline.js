/**
 * The cutout pipeline: three processes and the two pumps between them.
 *
 *   decoder ─ frames ─► matte program ─ mattes ─► packer ─► the file
 *
 * One pump takes a frame from the decoder when the matte program has taken
 * the one before; the other takes a matte when the packer has taken the one
 * before. So the slowest stage sets the pace of all three, and this process
 * holds a frame and a matte at a time, whatever the length. A matte program
 * may answer late (several frames in before the first matte out); it must
 * answer once per frame. Whatever fails, all three are gone before this
 * returns.
 * @module api/cutout/pipeline
 */

import { HttpError } from '../lib/httpErrors.js';
import { stageFailure as failure, within } from './failure.js';
import { pieceReader, startStage } from './process.js';

/** No matte for this long: the matte program hangs. */
export const STALL_MS = 3 * 60_000;

/** @returns {Error} What a cancelled cutout throws, as `lib/ffmpeg.js` `run` does. */
export const aborted = () => Object.assign(new Error('cutout cancelled'), { killedBy: 'aborted' });

/**
 * Run the three stages to the end.
 * @param {Object} run
 * @param {{ cmd: string, args: string[] }} run.decoder - Writes `frames` frames of `frameBytes`
 * @param {{ cmd: string, args: string[] }} run.matte - Frames in, mattes of `matteBytes` out
 * @param {{ cmd: string, args: string[] }} run.packer - Reads the mattes; exits 0 when its file is whole
 * @param {number} run.frameBytes
 * @param {number} run.matteBytes
 * @param {number} run.frames
 * @param {string} [run.file] - The media file, for messages
 * @param {AbortSignal} [run.signal]
 * @param {(done: number, total: number) => void} [run.onProgress] - Mattes packed
 * @param {number} [run.stallMs]
 * @returns {Promise<void>}
 * @throws {Error} An `HttpError` naming the stage that failed and what it
 *   printed, or — when the signal fired — an error with `killedBy: 'aborted'`
 */
export async function runPipeline(run) {
  const { frameBytes, matteBytes, frames, signal, onProgress, stallMs = STALL_MS } = run;
  if (signal?.aborted) throw aborted();
  const decoder = startStage('the decoder (FFmpeg)', run.decoder, { stdout: true });
  const matte = startStage('the matte program', run.matte, { stdin: true, stdout: true });
  const packer = startStage('the packer (FFmpeg)', run.packer, { stdin: true });
  const stages = [decoder, matte, packer];
  const stop = () => stages.forEach((stage) => stage.kill());
  signal?.addEventListener('abort', stop, { once: true });
  const pictures = pieceReader(decoder.child.stdout, frameBytes);
  const mattes = pieceReader(matte.child.stdout, matteBytes);
  let fed = 0;
  let done = 0;
  const progress = () => `after ${done} of ${frames} frames`;

  const feed = async () => {
    const taken = (/** @type {Buffer} */ frame) =>
      matte.write(frame).then(
        () => true,
        () => false,
      );
    for (let frame = await pictures.next(); frame; frame = await pictures.next()) {
      // A matte program that has gone cannot be fed. How it went is for the
      // other pump to say: it reads what the program wrote, to the end.
      if (!(await taken(frame))) return;
      fed++;
    }
    const code = await decoder.exited;
    if (code !== 0) throw await failure(decoder, `after ${fed} of ${frames} frames`);
    if (fed < frames)
      throw new HttpError(422, `${run.file || 'The file'} has no picture in that range`, {
        detail: `${fed} of ${frames} frames`,
      });
    matte.end();
  };

  const nextMatte = async () => {
    const piece = await within(mattes.next(), stallMs, 'late');
    if (piece !== 'late') return /** @type {Buffer|null} */ (piece);
    const said = matte.said();
    const text = `The matte program gave nothing for ${Math.round(stallMs / 1000)} s ${progress()}`;
    throw new HttpError(504, said ? `${text}: ${said}` : text);
  };

  const drain = async () => {
    for (; done < frames; done++) {
      const piece = await nextMatte();
      if (!piece) {
        const cut = mattes.rest();
        const where = cut ? ` — in the middle of a matte (${cut} of ${matteBytes} bytes)` : '';
        throw await failure(matte, progress() + where);
      }
      await packer.write(piece).catch(async () => {
        throw await failure(packer, progress());
      });
      onProgress?.(done + 1, frames);
    }
    const extra = await nextMatte();
    if (extra || mattes.rest())
      throw new HttpError(
        500,
        `The matte program wrote more than a matte for each of the ${frames} frames (or something that is not a matte)`,
        {
          detail: `more than ${frames * matteBytes} bytes on its standard output. ${matte.said()}`,
        },
      );
    if ((await matte.exited) !== 0) throw await failure(matte, 'after the last frame');
    packer.end();
    if ((await packer.exited) !== 0) throw await failure(packer, 'while finishing the file');
  };

  try {
    await Promise.all([feed(), drain()]);
  } catch (err) {
    throw signal?.aborted ? aborted() : err;
  } finally {
    signal?.removeEventListener('abort', stop);
    stop();
    await Promise.all(stages.map((stage) => stage.exited));
  }
}
