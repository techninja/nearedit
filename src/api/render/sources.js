/**
 * Source description — turns an ffprobe result into what the graph builder
 * needs: the size a viewer actually sees (rotation metadata and non-square
 * pixels applied) and the colour matrix to convert from. Pure.
 * @module api/render/sources
 */

/**
 * @typedef {Object} SourceInfo
 * @property {boolean} hasVideo
 * @property {boolean} hasAudio
 * @property {number} width - Displayed width in square pixels
 * @property {number} height - Displayed height in square pixels
 * @property {boolean} anamorphic - Stored with non-square pixels
 * @property {string} matrix - 'bt709', 'bt601', 'bt2020', or '' for RGB sources
 * @property {number} channels - Audio channel count (0 when there is no audio)
 */

const RGB_FORMATS = /^(rgb|bgr|gbr|argb|abgr|rgba|bgra|pal|gray|ya|mono|x2|0rgb|0bgr)/;
const TAGGED = {
  bt709: 'bt709',
  smpte170m: 'bt601',
  bt470bg: 'bt601',
  bt2020nc: 'bt2020',
  bt2020c: 'bt2020',
};

/**
 * Parse an ffprobe sample aspect ratio ("16:15").
 * @param {unknown} value
 * @returns {number} 1 when missing or invalid
 */
export function parseSar(value) {
  const [n, d] = String(value ?? '')
    .split(':')
    .map(Number);
  return n > 0 && d > 0 ? n / d : 1;
}

/**
 * Which YUV matrix a source was encoded with. Tagged files say so; for the
 * rest JPEG-family sources are BT.601 by definition and everything else
 * follows the usual rule (HD is BT.709, SD is BT.601).
 * @param {{ colorSpace?: string, pixFmt?: string, codec?: string, height?: number }} probe
 * @returns {string}
 */
export function sourceMatrix(probe) {
  const pixFmt = probe.pixFmt || '';
  if (RGB_FORMATS.test(pixFmt)) return '';
  if (TAGGED[probe.colorSpace]) return TAGGED[probe.colorSpace];
  if (pixFmt.startsWith('yuvj') || probe.codec === 'mjpeg') return 'bt601';
  return (probe.height || 0) >= 720 ? 'bt709' : 'bt601';
}

/**
 * @param {any} probe - `lib/ffmpeg.js` probe result plus optional `sar` and `colorSpace`
 * @returns {SourceInfo}
 */
export function describeSource(probe) {
  const info = {
    hasVideo: !!probe?.hasVideo && probe.width > 0 && probe.height > 0,
    hasAudio: !!probe?.hasAudio,
    width: 0,
    height: 0,
    anamorphic: false,
    matrix: '',
    channels: probe?.hasAudio ? probe.channels || 2 : 0,
  };
  if (!info.hasVideo) return info;
  const sar = parseSar(probe.sar);
  const squareWidth = Math.max(1, Math.round(probe.width * sar));
  const sideways = Math.abs(Math.round(probe.rotation || 0)) % 180 === 90;
  return {
    ...info,
    width: sideways ? probe.height : squareWidth,
    height: sideways ? squareWidth : probe.height,
    anamorphic: Math.abs(sar - 1) > 0.001,
    matrix: sourceMatrix(probe),
  };
}
