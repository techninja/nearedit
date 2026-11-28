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
import { SUBTITLE_FORMATS, formatSubtitles, phraseCues } from '#utils/captions/cues.js';
import { voiceFiles } from '#utils/captions/voices.js';
import { getDoc } from '#utils/editor/session.js';
import { downloadBytes } from '#utils/musicUi/midiFiles.js';
import { defaultFilename } from '#utils/ui/exportPlan.js';
import { showToast } from '#utils/ui/toast.js';
import { wordBook } from './words.js';

export { SUBTITLE_FORMATS };
const TYPES = { srt: 'application/x-subrip', vtt: 'text/vtt' };

/**
 * The cues a subtitle file of a document holds: its phrases for reading,
 * as the library defines them for every writer of such a file.
 * @param {any} doc
 * @param {(clip: any) => unknown} wordsOf - The transcript of a clip's file
 * @returns {import('#utils/captions/types.js').Cue[]}
 */
export const subtitleCues = (doc, wordsOf) => phraseCues(doc, wordsOf);

/**
 * The text of a subtitle file.
 * @param {import('#utils/captions/types.js').Cue[]} cues
 * @param {string} format - `srt` or `vtt`
 * @returns {string}
 */
export const subtitleText = (cues, format) => formatSubtitles(cues, format);

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
