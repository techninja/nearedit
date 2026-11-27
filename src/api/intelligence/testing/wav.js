/**
 * WAV writer for tests that need real audio files on disk.
 * @module api/intelligence/testing/wav
 */

import { writeFileSync } from 'node:fs';

/**
 * Write mono 16-bit PCM WAV.
 * @param {string} filePath
 * @param {Float32Array} samples - -1..1
 * @param {number} [sampleRate=22050]
 */
export function writeWav(filePath, samples, sampleRate = 22050) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clipped * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, data);
}
