/**
 * Rendition warm-up — compressed audio plays from a WAV rendition that the
 * server makes on first request, which can take seconds for a long file.
 * Asking for every rendition as soon as a document is on screen means the
 * first Play does not wait for ffmpeg.
 * @module utils/playback/warmup
 */

import { needsTranscode, transcodeUrl } from '#utils/playback/mediaUrl.js';

/** URLs already asked for (the server caches renditions on disk). */
const requested = new Set();
/** @type {any[]|null} */
let lastTracks = null;

/**
 * Sources in the document whose sound plays from a WAV rendition.
 * @param {any[]} tracks
 * @returns {string[]} Distinct rendition URLs
 */
export function renditionUrls(tracks) {
  const urls = new Set();
  for (const track of tracks || []) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips || []) {
      if (clip.sourceFile && needsTranscode(clip.sourceFile))
        urls.add(transcodeUrl(clip.sourceFile));
    }
  }
  return [...urls];
}

/**
 * Ask the server (HEAD, no body) for every rendition the document needs
 * and has not been asked for yet. Cheap to call on every document change.
 * @param {any[]} tracks
 * @param {(url: string, init: { method: string }) => Promise<any>} [request] - Injectable fetch
 * @returns {number} Requests started
 */
export function warmAudio(tracks, request = globalThis.fetch) {
  if (tracks === lastTracks) return 0;
  lastTracks = tracks;
  let started = 0;
  for (const url of renditionUrls(tracks)) {
    if (requested.has(url)) continue;
    requested.add(url);
    started++;
    request(url, { method: 'HEAD' }).catch((err) => {
      // Offline or server restarting: let a later document change try again.
      requested.delete(url);
      console.warn('[playback] could not prepare audio rendition:', err.message);
    });
  }
  return started;
}
