/**
 * Voices — the clips of a timeline whose captions are shown, and the words
 * each one says in timeline time. Only audio tracks make sound, and a video
 * file's sound is a clip of its own, linked to its picture; so a captioned
 * clip is heard through itself when it is on an audio track, and through
 * its linked sound clip when it is the picture of a pair. The compositor
 * and the subtitle writer both ask here, so what is drawn and what is
 * written agree.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § In the document.
 * @module utils/captions/voices
 */

import { activeTracks } from '#utils/edl/query.js';
import { wordsFromTranscript } from './transcript.js';
import { normalizeCaptions, repairWords } from './words.js';

/**
 * @typedef {import('./types.js').Word} Word
 * @typedef {{ clipId?: string, sourceFile?: string, sourceIn: number, timelineStart: number,
 *   timelineEnd: number, linkedClipId?: string, captions?: any }} Clip
 */

/**
 * A captioned clip that is heard.
 * @typedef {Object} Voice
 * @property {Clip} clip - The clip that carries `captions`: its words are the ones shown
 * @property {Clip} sound - The clip that is heard — the same one, or its
 *   linked sound: its place on the timeline and its source window time the words
 * @property {any} track - The track `sound` is on
 */

/** @type {(track: any) => Clip[]} The clips of a track, when it has a list of them */
const clipsOf = (track) => (Array.isArray(track.clips) ? track.clips : []);

/** @type {WeakMap<object, Voice[]>} Voices by document */
const voicesOf = new WeakMap();
/** @type {WeakMap<object, { words: unknown, own: unknown, out: Word[] }>} Words by sound clip */
const wordsOf = new WeakMap();

/**
 * The captioned clips of a document that are heard, in track order (the
 * front-most first), then in time order. A clip on a muted track — or, when
 * a track is soloed, on any other — has no voice; the picture and the sound
 * of a linked pair are one voice even when both are switched on.
 * @param {{ tracks?: any[] }} edl
 * @returns {Voice[]} The same array for the same document
 */
export function captionVoices(edl) {
  if (edl === null || typeof edl !== 'object') return [];
  const known = voicesOf.get(edl);
  if (known) return known;
  const tracks = Array.isArray(edl.tracks) ? edl.tracks.filter((track) => track) : [];
  const heard = new Set(activeTracks(tracks, 'audio'));
  const seen = new Set(activeTracks(tracks, 'video'));
  /** @type {Map<string, { clip: Clip, track: any }>} */
  const byId = new Map();
  for (const track of tracks) {
    for (const clip of clipsOf(track)) if (clip?.clipId) byId.set(clip.clipId, { clip, track });
  }
  /** @type {Voice[]} */
  const voices = [];
  const taken = new Set();
  for (const track of tracks) {
    for (const clip of clipsOf(track)) {
      if (clip?.captions?.on !== true) continue;
      const partner = byId.get(clip.linkedClipId);
      const picture = track.type !== 'audio';
      // A picture speaks through its linked sound; alone, it is shown while it is seen.
      const sound = picture && partner?.track.type === 'audio' ? partner : { clip, track };
      const on = sound.track.type === 'audio' ? heard.has(sound.track) : seen.has(sound.track);
      if (!on || taken.has(sound.clip)) continue;
      taken.add(sound.clip);
      // Words written on the sound clip win over its picture's.
      const carrier = sound.clip.captions?.on === true ? sound.clip : clip;
      voices.push({ clip: carrier, sound: sound.clip, track: sound.track });
    }
  }
  voicesOf.set(edl, voices);
  return voices;
}

/**
 * The voices sounding at a time, in the order their captions stack: the
 * first is lane 0.
 * @param {{ tracks?: any[] }} edl
 * @param {number} time - Timeline seconds
 * @returns {Voice[]}
 */
export function voicesAt(edl, time) {
  return captionVoices(edl).filter(
    ({ sound }) => time >= sound.timelineStart && time < sound.timelineEnd,
  );
}

/**
 * The files whose transcripts a document's captions are made from: the
 * source file of every voice that carries no words of its own. A host
 * loads these before it draws (the server) or while it draws (the preview).
 * @param {{ tracks?: any[] }} edl
 * @returns {string[]} Paths, each once
 */
export function voiceFiles(edl) {
  const files = new Set();
  for (const { clip } of captionVoices(edl)) {
    if (!Array.isArray(clip.captions?.words) && clip.sourceFile) files.add(clip.sourceFile);
  }
  return [...files];
}

/**
 * The words a voice says, in timeline seconds: the clip's own words when it
 * carries any, otherwise the ones given (its file's transcript), repaired,
 * cut to the stretch of the source the clip plays — a word belongs to the
 * clip when its middle does — and moved to where the clip sits.
 * @param {Voice} voice
 * @param {unknown} [words] - The transcript of the clip's file: triples, a
 *   sidecar, or its list of words
 * @returns {Word[]} The same array for the same voice and words, so groups
 *   are worked out once
 */
export function voiceWords(voice, words) {
  const { clip, sound } = voice;
  const known = wordsOf.get(sound);
  if (known && known.words === words && known.own === clip.captions) return known.out;
  const own = normalizeCaptions(clip.captions).words;
  const triples = Array.isArray(words) && Array.isArray(words[0]);
  const source = own ? repairWords(own) : triples ? repairWords(words) : wordsFromTranscript(words);
  const shift = sound.timelineStart - sound.sourceIn;
  const [from, to] = [sound.timelineStart, sound.timelineEnd];
  /** @type {Word[]} */
  const out = [];
  for (const [start, end, text] of source) {
    const middle = (start + end) / 2 + shift;
    if (middle < from || middle >= to) continue;
    out.push([Math.max(from, start + shift), Math.min(to, end + shift), text]);
  }
  wordsOf.set(sound, { words, own: clip.captions, out });
  return out;
}
