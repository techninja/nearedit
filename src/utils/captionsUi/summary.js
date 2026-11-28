/**
 * Captions of the whole timeline at a glance: which voices are switched
 * on, how many words they show, which sound clips could be switched on now
 * and which have no transcript to show. Pure — the caller says what is
 * known about each file's transcript.
 * @module utils/captionsUi/summary
 */

import { captionInfo, captionedClips, isMusicClip } from '#utils/edl/index.js';
import { playedWords } from './clipState.js';

/**
 * A voice of the timeline: a sound clip (with its linked picture), or a
 * captioned picture that has no sound clip.
 * @typedef {Object} VoiceState
 * @property {string} clipId - The clip that carries its captions
 * @property {string} file - The file whose transcript it shows; '' with words of its own
 * @property {boolean} on
 * @property {'ready'|'none'|'loading'|'failed'} words - Whether it has words to show
 * @property {number} count - Words it shows (0 unless `ready`)
 */

/**
 * @typedef {Object} CaptionSummary
 * @property {VoiceState[]} voices
 * @property {number} on - Voices switched on
 * @property {number} shown - Words those voices show
 * @property {number} ready - Voices that are off and have words: what
 *   "Caption all speech" would switch on
 * @property {{ file: string, name: string, clipIds: string[], on: boolean }[]} missing -
 *   Files without a transcript, each with the voices that play it; `on`
 *   when captions are already switched on for one of them
 */

/** @type {(path: string) => string} */
const baseName = (path) => path.split(/[\\/]/).pop() || path;

/**
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {(file: string) => import('./words.js').FileWords} wordsOf - What
 *   is known of a file's transcript
 * @returns {CaptionSummary}
 */
export function captionSummary(doc, wordsOf) {
  /** @type {Map<string, VoiceState>} */
  const voices = new Map();
  const add = (/** @type {any} */ clip) => {
    const info = captionInfo(doc, clip.clipId);
    if (!info.can || voices.has(info.carrierId)) return;
    // A music clip speaks only the words written on it.
    if (isMusicClip(clip) && !info.ownWords && !info.on) return;
    const carrier = info.carrierId === clip.clipId ? clip : null;
    const known = info.ownWords ? null : wordsOf(info.file);
    const words = info.ownWords ? 'ready' : info.file ? known.state : 'none';
    const list = info.ownWords ? carrier?.captions?.words || [] : known?.words || [];
    const count = words === 'ready' && carrier ? playedWords(list, carrier) : 0;
    voices.set(info.carrierId, {
      clipId: info.carrierId,
      file: info.file,
      on: info.on,
      words,
      count,
    });
  };
  for (const track of doc?.tracks || []) {
    if (track.type === 'audio') track.clips.forEach(add);
  }
  // A captioned picture without a sound clip is a voice too.
  for (const { clip } of captionedClips(doc)) add(clip);

  const all = [...voices.values()];
  /** @type {Map<string, CaptionSummary['missing'][number]>} */
  const missing = new Map();
  for (const voice of all) {
    if (voice.words !== 'none' || !voice.file) continue;
    const entry = missing.get(voice.file) || {
      file: voice.file,
      name: baseName(voice.file),
      clipIds: [],
      on: false,
    };
    entry.clipIds.push(voice.clipId);
    entry.on ||= voice.on;
    missing.set(voice.file, entry);
  }
  return {
    voices: all,
    on: all.filter((voice) => voice.on).length,
    shown: all.reduce((sum, voice) => sum + (voice.on ? voice.count : 0), 0),
    ready: all.filter((voice) => !voice.on && voice.words === 'ready').length,
    missing: [...missing.values()],
  };
}

/**
 * The summary in a line.
 * @param {CaptionSummary} summary
 * @returns {string}
 */
export function summaryLine(summary) {
  if (!summary.voices.length) return 'No clip with sound on the timeline yet';
  const clips = (/** @type {number} */ n) => `${n} ${n === 1 ? 'clip' : 'clips'}`;
  if (!summary.on) return `Off — ${clips(summary.voices.length)} with sound`;
  const words = `${summary.shown} ${summary.shown === 1 ? 'word' : 'words'}`;
  return `On for ${summary.on} of ${clips(summary.voices.length)} · ${words}`;
}
