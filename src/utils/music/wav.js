/**
 * WAV files: 16-bit PCM, stereo. Whole (`encodeWav`) or in pieces — a
 * header and then chunk after chunk (`wavHeader`, `pcm16`) — so the server
 * can write a long song as it is rendered. Isomorphic and pure.
 * @module utils/music/wav
 */

const CHANNELS = 2;
const BYTES = 2;
const HEADER = 44;

/**
 * Samples as 16-bit little-endian PCM. A sample is scaled by 32767 and
 * rounded to the nearest whole number (halves upwards), the same in every
 * runtime; anything beyond ±1 is clipped and anything that is not a number
 * becomes silence.
 * @param {Float32Array|number[]} samples - Interleaved, −1 … 1
 * @returns {Uint8Array} Two bytes per sample
 */
export function pcm16(samples) {
  const bytes = new Uint8Array(samples.length * BYTES);
  for (let i = 0; i < samples.length; i++) {
    const scaled = Math.round(samples[i] * 32767);
    const value = scaled > 32767 ? 32767 : scaled < -32767 ? -32767 : scaled || 0;
    bytes[i * 2] = value & 0xff;
    bytes[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return bytes;
}

/**
 * The 44 bytes in front of the samples of a stereo 16-bit WAV file.
 * @param {number} frames - Frames (pairs of samples) that follow
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function wavHeader(frames, sampleRate) {
  const bytes = new Uint8Array(HEADER);
  const view = new DataView(bytes.buffer);
  const size = Math.max(0, Math.floor(frames)) * CHANNELS * BYTES;
  const text = (at, word) => [...word].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, HEADER - 8 + size, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * CHANNELS * BYTES, true);
  view.setUint16(32, CHANNELS * BYTES, true);
  view.setUint16(34, BYTES * 8, true);
  text(36, 'data');
  view.setUint32(40, size, true);
  return bytes;
}

/**
 * A whole WAV file from rendered samples.
 * @param {Float32Array|Float32Array[]} chunks - Interleaved stereo samples,
 *   in one piece or several (what `render` returned, in order)
 * @param {number} [sampleRate=48000]
 * @returns {Uint8Array}
 */
export function encodeWav(chunks, sampleRate = 48000) {
  const list = Array.isArray(chunks) ? chunks : [chunks];
  const samples = list.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(HEADER + samples * BYTES);
  bytes.set(wavHeader(samples / CHANNELS, sampleRate));
  let at = HEADER;
  for (const chunk of list) {
    bytes.set(pcm16(chunk), at);
    at += chunk.length * BYTES;
  }
  return bytes;
}
