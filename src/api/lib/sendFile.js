/**
 * File responses — one place that decides how a file from disk is sent:
 * HTTP range support (video scrubbing), an explicit content type for every
 * media format the app lists, and headers that stop a stray file in a media
 * folder from being rendered as a page on the app's own origin.
 * @module api/lib/sendFile
 */

import { basename, extname } from 'node:path';

/** Content type per extension. Anything not listed is sent as a download. */
export const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.srt': 'text/plain',
  '.ass': 'text/plain',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
};

/**
 * @param {string} filePath
 * @returns {string|null} null when the extension is not a known media type
 */
export function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || null;
}

/**
 * Stream a file with range, conditional-GET and HEAD support. Failures
 * (missing file, unsatisfiable range) reach the router's error middleware.
 * The caller is responsible for having validated `filePath`.
 * @param {import('express').Response} res
 * @param {string} filePath - Absolute path
 * @param {{ type?: string }} [opts] - Override the content type
 */
export function sendFile(res, filePath, opts = {}) {
  const type = opts.type || contentTypeFor(filePath);
  if (type) {
    res.type(type);
  } else {
    res.attachment(basename(filePath));
    res.type('application/octet-stream');
  }
  res.set('X-Content-Type-Options', 'nosniff');
  // Always revalidate: the file behind a URL changes when the source is edited.
  res.set('Cache-Control', 'private, no-cache');
  // The path was validated by the caller, so dot-directories are legitimate here.
  res.sendFile(filePath, { dotfiles: 'allow', cacheControl: false });
}
