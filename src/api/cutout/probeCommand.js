/**
 * Asking a matte program of one's own (`CUTOUT_COMMAND`) whether it speaks
 * the protocol: two small grey frames in, two mattes of the right size out,
 * and a clean exit when its input ends.
 * @module api/cutout/probeCommand
 */

import { within } from './failure.js';
import { pieceReader, startStage } from './process.js';
import { matteCommand } from './provider.js';

const SIDE = 64;
const FRAMES = 2;
const ANSWER_TIMEOUT = 60_000;

/**
 * Run the program on two frames.
 * @param {import('./provider.js').Provider} provider
 * @param {number} [timeout] - Milliseconds it may take to answer; for tests
 * @returns {Promise<{ model: string, reason: string, detail: string }>}
 */
export async function probeCommand(provider, timeout = ANSWER_TIMEOUT) {
  const { command } = provider;
  const size = { width: SIDE, height: SIDE, fps: 30 };
  const stage = startStage('CUTOUT_COMMAND', matteCommand(provider, size), {
    stdin: true,
    stdout: true,
  });
  const mattes = pieceReader(stage.child.stdout, SIDE * SIDE);
  const answer = async () => {
    const frame = Buffer.alloc(SIDE * SIDE * 3, 128);
    // A program that has gone cannot be written to: what it gave back says the rest.
    for (let i = 0; i < FRAMES; i++) await stage.write(frame).catch(() => {});
    stage.end();
    let got = 0;
    while (await mattes.next()) got++;
    return { bytes: got * SIDE * SIDE + mattes.rest(), code: await stage.exited };
  };
  try {
    const result = await within(answer(), timeout, null);
    const said = stage.said();
    const tail = said ? ` It printed: ${said}` : '';
    const what = `two ${SIDE} × ${SIDE} frames`;
    let reason = '';
    if (stage.failedToStart())
      reason = `CUTOUT_COMMAND cannot be started (${stage.child.spawnfile}): ${said}`;
    else if (!result)
      reason = `CUTOUT_COMMAND did not answer ${what} within ${Math.round(timeout / 1000)} s.${tail}`;
    else if (result.bytes !== FRAMES * SIDE * SIDE || result.code !== 0)
      reason =
        `CUTOUT_COMMAND does not speak the matte protocol: for ${what} it gave ${result.bytes} bytes ` +
        `(expected ${FRAMES * SIDE * SIDE}) and exit code ${result.code}.${tail}`;
    return reason
      ? { model: '', reason, detail: '' }
      : { model: `command:${command}`, reason: '', detail: `CUTOUT_COMMAND: ${command}` };
  } finally {
    stage.kill();
    await stage.exited;
  }
}
