/**
 * Render presets — every preset produces H.264 (yuv420p) + AAC in MP4 with
 * the moov atom up front; they differ in size, speed and quality only.
 * @module api/render/presets
 */

/**
 * @typedef {Object} RenderPreset
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {number} scale - Output size as a fraction of the EDL resolution
 * @property {'420'|'444'} chroma - Chroma layout the layers are composited in
 * @property {string} scaleFlags - swscale flags for clip scaling
 * @property {string} x264Preset
 * @property {number} crf
 * @property {string} audioBitrate
 */

/** @type {RenderPreset[]} */
const PRESETS = [
  {
    id: 'draft',
    label: 'Draft',
    description: 'Half resolution, fastest encode — for checking an edit',
    scale: 0.5,
    chroma: '420',
    scaleFlags: 'bilinear',
    x264Preset: 'veryfast',
    crf: 28,
    audioBitrate: '128k',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Full resolution, balanced quality and size — for sharing',
    scale: 1,
    chroma: '444',
    scaleFlags: 'bicubic+accurate_rnd',
    x264Preset: 'medium',
    crf: 20,
    audioBitrate: '192k',
  },
  {
    id: 'high',
    label: 'High',
    description: 'Full resolution, near-lossless, slow encode — for archiving',
    scale: 1,
    chroma: '444',
    scaleFlags: 'lanczos+accurate_rnd',
    x264Preset: 'slow',
    crf: 16,
    audioBitrate: '320k',
  },
];

export const DEFAULT_PRESET = 'standard';

/**
 * @param {string} [id] - Omit for the default preset
 * @returns {RenderPreset|null} null when the id is unknown
 */
export function getPreset(id) {
  return PRESETS.find((p) => p.id === (id || DEFAULT_PRESET)) || null;
}

/** @returns {{ id: string, label: string, description: string }[]} */
export function listPresets() {
  return PRESETS.map(({ id, label, description }) => ({ id, label, description }));
}

/**
 * Output frame size of a preset: scaled, and even on both axes (yuv420p).
 * @param {{ width: number, height: number }} resolution - EDL resolution
 * @param {RenderPreset} preset
 * @returns {{ width: number, height: number }}
 */
export function outputSize(resolution, preset) {
  const even = (v) => Math.max(2, Math.round((v * preset.scale) / 2) * 2);
  return { width: even(resolution.width), height: even(resolution.height) };
}

/**
 * Encoder arguments for a preset.
 * @param {RenderPreset} preset
 * @param {{ fps: number, fpsText: string }} timing
 * @returns {string[]}
 */
export function encodeArgs(preset, timing) {
  const bt709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  return [
    ...['-c:v', 'libx264', '-preset', preset.x264Preset, '-crf', String(preset.crf)],
    ...['-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', timing.fpsText],
    ...['-g', String(Math.max(1, Math.round(timing.fps * 2)))],
    ...bt709,
    ...['-color_range', 'tv'],
    ...['-c:a', 'aac', '-b:a', preset.audioBitrate, '-ar', '48000', '-ac', '2'],
    ...['-movflags', '+faststart', '-map_metadata', '-1', '-f', 'mp4'],
  ];
}
