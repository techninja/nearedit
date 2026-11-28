/**
 * The music clips of a standalone document. Their renderings live beside
 * the document, in `.nearedit/music/`, under the key of the song. Loading a
 * document attaches the renderings that exist and says which are missing
 * and what is wrong with a song — without rendering anything; `render` and
 * `frame` make the missing ones first (`musicMissing.js`).
 * Reference: docs/app-spec/MUSIC.md § Server and command line.
 * @module bin/lib/musicClips
 */

import { songKey } from '#utils/music/key.js';
import { validateSong } from '#utils/music/validate.js';
import { attachMusic } from '../../src/api/music/timeline.js';

/** @typedef {import('./repairs.js').Finding} Finding */
/** @typedef {import('../../src/api/music/timeline.js').Unrendered} Unrendered */

/**
 * @param {any} clip - As it was written
 * @returns {boolean} True for a music clip: it holds a song, and is no web clip
 */
function holdsSong(clip) {
  const song = clip?.music?.song;
  return Boolean(song) && typeof song === 'object' && !Array.isArray(song) && !clip.web?.recipe;
}

/**
 * What is wrong with the songs of a document, as they were written.
 * @param {any[]} tracks - The raw `tracks`
 * @returns {Finding[]} Errors, with paths like `tracks[1].clips[0].music.song.parts[2].notes[7]`
 */
export function songFindings(tracks) {
  /** @type {Finding[]} */
  const findings = [];
  tracks.forEach((track, t) => {
    (Array.isArray(track?.clips) ? track.clips : []).forEach((clip, c) => {
      if (!holdsSong(clip)) return;
      const at = `tracks[${t}].clips[${c}].music.song`;
      for (const { path, message } of validateSong(clip.music.song).problems)
        findings.push({ path: path ? `${at}.${path}` : at, level: 'error', message });
    });
  });
  return findings;
}

/**
 * Whether a difference between a document as written and as read is none
 * for a music clip. Its song may be written in shorthand — note names, lanes
 * spaced for the eye, velocities left out — and `songFindings` says what is
 * wrong with it; the file it plays and the key of that file follow from the
 * song, whatever the document says. A field a song does not have is still
 * worth a warning.
 * @param {Finding} finding - Of `repairFindings`
 * @param {any[]} tracks - The raw `tracks`
 * @returns {boolean}
 */
export function isSongsOwn(finding, tracks) {
  const at = /^tracks\[(\d+)\]\.clips\[(\d+)\]\.(.+)$/.exec(finding.path);
  if (!at || !holdsSong(tracks[Number(at[1])]?.clips?.[Number(at[2])])) return false;
  if (['sourceFile', 'placeholder', 'music.key'].includes(at[3])) return true;
  return /^music\.song[.[]/.test(at[3]) && !/is not a field/.test(finding.message);
}

/**
 * Point every music clip at the rendering of its song — beside the document
 * or in one of the `--media` folders (a project folder keeps its renderings
 * the same way) — or, when there is none yet, leave it a placeholder and
 * say so.
 * @param {any} edl - Normalised
 * @param {string} dir - The document's folder
 * @param {string[]} [folders] - The `--media` folders
 * @returns {{ edl: any, unrendered: Unrendered[] }}
 */
export function attachRenderings(edl, dir, folders = []) {
  const { edl: attached, missing } = attachMusic(edl, [dir, ...folders], { placeholders: true });
  return { edl: attached, unrendered: missing };
}

/**
 * Say which music clips still have to be rendered — at their place in the
 * document as it was written (loading may add and reorder tracks).
 * @param {any[]} tracks - The raw `tracks`
 * @param {Unrendered[]} unrendered
 * @returns {Finding[]} Warnings: `render` and `frame` render them first
 */
export function unrenderedFindings(tracks, unrendered) {
  const keys = new Set(unrendered.map((entry) => entry.key));
  /** @type {Finding[]} */
  const findings = [];
  tracks.forEach((track, t) => {
    (Array.isArray(track?.clips) ? track.clips : []).forEach((clip, c) => {
      if (!holdsSong(clip) || !keys.has(songKey(clip.music.song))) return;
      const message = 'music clip not rendered yet: "nearedit render" and "frame" render it first';
      findings.push({ path: `tracks[${t}].clips[${c}].music`, level: 'warning', message });
    });
  });
  return findings;
}
