/**
 * Media URLs — the one place playback builds server URLs for source files.
 * Routes: docs/app-spec/API.md § Media. Pure and isomorphic.
 * @module utils/playback/mediaUrl
 */

/**
 * Compressed audio is played from its cached WAV rendition, which seeks
 * sample-accurately (VBR MP3/AAC seek positions are only estimates).
 */
const TRANSCODED_AUDIO = ['mp3', 'aac', 'ogg', 'flac', 'm4a'];

/**
 * Lower-case extension of a path, without the dot.
 * @param {string} path
 * @returns {string}
 */
export function fileExtension(path) {
  const name = String(path || '')
    .split(/[\\/]/)
    .pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * URL that streams a source file as-is (HTTP range supported).
 * @param {string} path - Absolute path on the server
 * @returns {string}
 */
export function mediaFileUrl(path) {
  return `/api/media/file?path=${encodeURIComponent(path)}`;
}

/**
 * URL of the WAV rendition of a compressed audio file.
 * @param {string} path - Absolute path on the server
 * @returns {string}
 */
export function transcodeUrl(path) {
  return `/api/transcode?path=${encodeURIComponent(path)}`;
}

/**
 * True when a file's sound should be played from its WAV rendition.
 * @param {string} path
 * @returns {boolean}
 */
export function needsTranscode(path) {
  return TRANSCODED_AUDIO.includes(fileExtension(path));
}

/**
 * URL to play the sound of a clip's source from: the WAV rendition for
 * compressed audio, the file itself for WAV and for video containers.
 * @param {string} path - Absolute path on the server
 * @returns {string}
 */
export function audioUrl(path) {
  return needsTranscode(path) ? transcodeUrl(path) : mediaFileUrl(path);
}

/**
 * URL to read the picture of a clip's source (video or still) from.
 * @param {string} path - Absolute path on the server
 * @returns {string}
 */
export function pictureUrl(path) {
  return mediaFileUrl(path);
}
