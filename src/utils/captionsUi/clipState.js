/**
 * The one honest line the inspector shows about a clip's captions: how many
 * words it has, or why it has none and what can be done about it. Pure.
 * @module utils/captionsUi/clipState
 */

import { explainMissing } from '#utils/transcript/missing.js';

/**
 * @typedef {Object} CaptionLine
 * @property {'own'|'words'|'empty'|'reading'|'transcribing'|'failed'|'missing'|'silent'|
 *   'soundless'|'unavailable'} kind
 * @property {string} text - The line
 * @property {string} detail - More, for the cases that need explaining; '' otherwise
 * @property {''|'transcribe'|'cancel'} action - What the button beside it does
 * @property {string} actionLabel
 * @property {'ok'|'muted'|'busy'|'warn'} tone
 * @property {number} progress - 0..100 while transcribing
 */

/**
 * @param {number} count
 * @returns {string} `1 word`, `142 words`
 */
export const wordCount = (count) => `${count} ${count === 1 ? 'word' : 'words'}`;

/**
 * How many of a file's words a clip plays: those whose middle lies in the
 * stretch of the source it shows — the ones its captions are made of.
 * @param {import('#utils/captions/types.js').Word[]} words - Source seconds
 * @param {{ sourceIn: number, sourceOut: number }} clip
 * @returns {number}
 */
export function playedWords(words, clip) {
  let count = 0;
  for (const [start, end] of words) {
    const middle = (start + end) / 2;
    if (middle >= clip.sourceIn && middle < clip.sourceOut) count++;
  }
  return count;
}

/** @type {(line: Partial<CaptionLine> & { kind: CaptionLine['kind'], text: string }) => CaptionLine} */
const line = (parts) => ({
  detail: '',
  action: '',
  actionLabel: '',
  tone: 'muted',
  progress: 0,
  ...parts,
});

/**
 * The state of a clip's captions in a line.
 * @param {Object} facts
 * @param {import('#utils/edl/captionQuery.js').CaptionInfo} facts.info - `captionInfo`
 * @param {{ sourceIn: number, sourceOut: number, captions?: any }} facts.carrier -
 *   The clip that carries the voice (`info.carrierId`)
 * @param {import('./words.js').FileWords} facts.words - What is known of `info.file`
 * @param {import('./transcribe.js').FileJob|null} facts.job - Its transcription, if any
 * @param {Record<string, any>|null} facts.provider - `transcription` of the
 *   provider status, when known
 * @param {{ type?: string, hasAudio?: boolean }|null} [facts.item] - The file's media item
 * @returns {CaptionLine}
 */
export function captionLine({ info, carrier, words, job, provider, item = null }) {
  // Captions of a clip that is not heard are not drawn: say so rather than promise words.
  const hidden = info.on && !info.heard ? ' — not shown while its track is silent' : '';
  if (info.ownWords) {
    const count = playedWords(carrier.captions?.words || [], carrier);
    return line({
      kind: 'own',
      text: `${wordCount(count)} written on this clip${hidden}`,
      tone: 'ok',
    });
  }
  if (job?.active) {
    return line({
      kind: 'transcribing',
      text: `Transcribing… ${job.progress} %`,
      detail: job.detail,
      action: 'cancel',
      actionLabel: 'Cancel',
      tone: 'busy',
      progress: job.progress,
    });
  }
  if (words.state === 'ready') {
    const count = playedWords(words.words, carrier);
    if (count) return line({ kind: 'words', text: `${wordCount(count)}${hidden}`, tone: 'ok' });
    return line({ kind: 'empty', text: 'Nothing is said in this part of the file' });
  }
  if (words.state === 'loading') return line({ kind: 'reading', text: 'Reading the transcript…' });
  if (words.state === 'failed') {
    return line({ kind: 'reading', text: 'The transcript could not be read — trying again' });
  }
  if (job?.error) {
    return line({
      kind: 'failed',
      text: 'Transcription failed',
      detail: job.error,
      action: 'transcribe',
      actionLabel: 'Try again',
      tone: 'warn',
    });
  }
  const status = provider ? { transcription: provider } : null;
  const why = explainMissing({ file: info.file }, item, words.sidecar, status);
  if (why.title === 'Nothing to transcribe') {
    return line({ kind: 'soundless', text: 'This file has no sound to caption' });
  }
  if (why.title === 'Transcription is not available') {
    return line({
      kind: 'unavailable',
      text: 'This server cannot transcribe',
      detail: why.detail,
      tone: 'warn',
    });
  }
  const again = why.title === 'No speech found';
  return line({
    kind: again ? 'silent' : 'missing',
    text: again ? 'No speech was found in this file' : 'No transcript yet',
    action: 'transcribe',
    actionLabel: again ? 'Transcribe again' : 'Transcribe',
    tone: info.on ? 'warn' : 'muted',
  });
}
