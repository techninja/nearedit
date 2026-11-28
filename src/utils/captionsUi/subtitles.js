/**
 * Subtitle files from the editor, written at once in the browser: the
 * captions of the timeline on screen as SubRip or WebVTT — phrases for
 * reading, with the capitals and punctuation the words were transcribed
 * with, the same file a render saves beside its video
 * (`src/api/render/subtitles.js`).
 * Reference: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captionsUi/subtitles
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { SUBTITLE_GROUP, formatSrt, formatVtt, timelineCues } from '#utils/captions/cues.js';
import { voiceFiles } from '#utils/captions/voices.js';
import { getDoc } from '#utils/editor/session.js';
import { downloadBytes } from '#utils/musicUi/midiFiles.js';
import { defaultFilename } from '#utils/ui/exportPlan.js';
import { showToast } from '#utils/ui/toast.js';
import { wordBook } from './words.js';

export const SUBTITLE_FORMATS = ['srt', 'vtt'];
const TYPES = { srt: 'application/x-subrip', vtt: 'text/vtt' };

/**
 * The cues a subtitle file of a document holds.
 * @param {any} doc
 * @param {(clip: any) => unknown} wordsOf - The transcript of a clip's file
 * @returns {import('#utils/captions/types.js').Cue[]}
 */
export function subtitleCues(doc, wordsOf) {
  const stored = doc?.captions?.style;
  const base = stored !== null && typeof stored === 'object' ? stored : { preset: stored };
  // A design may shout or drop its commas; a file that is read keeps the text as it is.
  const reading = { ...base, case: 'as-is', punctuation: 'keep' };
  return timelineCues(doc, wordsOf, { style: reading, group: SUBTITLE_GROUP });
}

/**
 * The text of a subtitle file.
 * @param {import('#utils/captions/types.js').Cue[]} cues
 * @param {string} format - `srt` or `vtt`
 * @returns {string}
 */
export const subtitleText = (cues, format) =>
  format === 'vtt' ? formatVtt(cues) : formatSrt(cues);

/**
 * Write the subtitle file of the timeline on screen and save it. Every
 * transcript the captions need is read first.
 * @param {string} format - `srt` or `vtt`
 * @returns {Promise<{ name: string, cues: number }>} `cues` 0: nothing was saved
 */
export async function saveSubtitles(format) {
  const kind = SUBTITLE_FORMATS.includes(format) ? format : 'srt';
  const doc = getDoc();
  await wordBook.ready(voiceFiles(doc));
  const cues = subtitleCues(doc, (clip) => wordBook.get(clip.sourceFile).sidecar);
  const name = `${defaultFilename(store.get(ProjectState).adaptationName)}.${kind}`;
  if (!cues.length) {
    showToast({
      title: 'No captions to save',
      detail: 'Switch captions on for a clip that has a transcript first.',
    });
    return { name, cues: 0 };
  }
  downloadBytes(new TextEncoder().encode(subtitleText(cues, kind)), name, TYPES[kind]);
  showToast({ title: `Saved ${name}`, detail: `${cues.length} subtitles`, kind: 'success' });
  return { name, cues: cues.length };
}
