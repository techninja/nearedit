/**
 * Where people speak on the timeline: every clip that is heard in the span
 * — on an audio track that is not muted (or is soloed, when any is), not
 * music — is asked where it speaks (`#utils/director/score/speech.js`),
 * through its file's sidecar.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Under speech.
 * @module api/director/score/speech
 */

import { coverage, joinSpans } from '#utils/director/score/duck.js';
import { clipSpeech } from '#utils/director/score/speech.js';
import { isMusicClip } from '#utils/music/clip.js';
import { typedTracks } from '../result.js';

/** @typedef {import('#utils/director/score/duck.js').Span} Span */

/**
 * @typedef {Object} Heard
 * @property {Span[]} spans - Speech, in seconds from the start of the span, joined
 * @property {number} spoken - Share of the span in which someone speaks, 0 … 1
 * @property {number} clips - Clips that speak
 * @property {string[]} notes - What was assumed about files without a transcript
 */

/** Intents that mark a clip as a voice whatever its file is taken for. */
const VOICES = ['narration', 'primary'];
/** @type {(seconds: number) => number} To the millisecond. */
const tidy = (seconds) => Math.round(seconds * 1000) / 1000;
const count = (/** @type {number} */ n, /** @type {string} */ thing) =>
  `${n} ${thing}${n === 1 ? '' : 's'}`;

/**
 * @param {any} edl - The posted document
 * @param {import('./timeline.js').Span} span
 * @param {(filePath: string) => import('../context/mediaInfo.js').MediaInfo|null} lookup
 * @returns {Heard}
 */
export function findSpeech(edl, span, lookup) {
  const audio = typedTracks(edl).filter(({ type }) => type === 'audio');
  const soloed = audio.some(({ track }) => track.solo);
  /** @type {Span[]} */
  const spans = [];
  const by = { words: 0, segments: 0, sound: 0 };
  /** @type {Set<string>} */
  const unread = new Set();
  /** @type {Set<string>} */
  const guessed = new Set();
  for (const { track } of audio) {
    if (track.muted || (soloed && !track.solo) || !(track.volume ?? 1)) continue;
    for (const clip of track.clips || []) {
      const inside = clip.timelineEnd > span.start && clip.timelineStart < span.end;
      if (!inside || !clip.sourceFile || isMusicClip(clip) || clip.intent === 'music') continue;
      const media = clip.volume > 0.01 ? lookup(clip.sourceFile) : null;
      // What the clip is marked as outranks what its file was taken for.
      const marked = VOICES.includes(clip.intent);
      if (!media || (media.kind === 'music' && !marked)) continue;
      const voice = marked || media.kind === 'speech';
      const found = clipSpeech(clip, media, voice);
      if (!found.from) continue;
      if (found.spans.length) by[found.from]++;
      if (found.from === 'sound') (media.silences.length ? guessed : unread).add(media.filename);
      spans.push(...found.spans);
    }
  }
  const relative = joinSpans(
    spans.map((s) => ({
      start: tidy(Math.max(0, s.start - span.start)),
      end: tidy(Math.min(span.seconds, s.end - span.start)),
    })),
  );
  const notes = [];
  if (guessed.size) {
    notes.push(
      `${[...guessed].join(', ')}: no transcript, so everything that is not analysed as ` +
        'silence counts as speech. Transcribe for ducking by the word.',
    );
  }
  if (unread.size) {
    notes.push(
      `${[...unread].join(', ')}: a voice with neither a transcript nor a silence analysis, ` +
        'so the music stays low under the whole clip. Analyse the file for tighter ducking.',
    );
  }
  const clips = by.words + by.segments + by.sound;
  if (clips) {
    const from = [
      by.words && `the transcript of ${count(by.words, 'clip')}`,
      by.segments && `the transcript segments of ${count(by.segments, 'clip')}`,
      by.sound && `the sound of ${count(by.sound, 'clip')}`,
    ].filter(Boolean);
    notes.unshift(`Speech was found from ${from.join(' and ')}.`);
  }
  return { spans: relative, spoken: coverage(relative, span.seconds), clips, notes };
}
