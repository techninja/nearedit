/**
 * The words a render's captions are made from. A captioned clip shows the
 * transcript of its file — the sidecar beside the media — unless it carries
 * words of its own. They are read once, in the main process, before
 * anything is planned or drawn, and travel to every canvas worker with the
 * job, so each worker has them before its first frame and all of them draw
 * the same words. A file without a transcript is not an error: its clips
 * render without captions and the job says so.
 * @module api/render/words
 */

import { captionVoices, voiceFiles } from '#utils/captions/voices.js';
import { readSidecar } from '../lib/sidecar.js';

/**
 * Transcripts by source file: what a sidecar says, or null when it says nothing.
 * @typedef {Record<string, { transcript: any[], segments: any[] } | null>} WordTable
 */

/**
 * @param {string} file - A media file the caller may read
 * @param {(file: string) => any} read - Its sidecar, or null
 * @returns {{ transcript: any[], segments: any[] } | null}
 */
function transcriptOf(file, read) {
  let sidecar = null;
  try {
    sidecar = read(file);
  } catch (err) {
    console.warn(`[render] cannot read the transcript of ${file}: ${err.message}`);
  }
  const list = (/** @type {unknown} */ value) => (Array.isArray(value) ? value : []);
  const [transcript, segments] = [list(sidecar?.transcript), list(sidecar?.segments)];
  return transcript.length || segments.length ? { transcript, segments } : null;
}

/**
 * Load the transcripts a document's captions need.
 * @param {{ tracks?: any[] }} edl - A checked document: its media paths may be read
 * @param {(file: string) => any} [read] - Injectable: a file's fresh sidecar
 * @returns {{ words: WordTable, warnings: string[] }} `words` has an entry
 *   for every file a heard, captioned clip without its own words plays;
 *   `warnings` name the files that have no transcript
 */
export function loadWords(edl, read = readSidecar) {
  /** @type {WordTable} */
  const words = {};
  const warnings = [];
  for (const file of voiceFiles(edl)) {
    words[file] = transcriptOf(file, read);
    if (words[file]) continue;
    warnings.push(
      `Captions are on for ${file}, which has no transcript: it is rendered without ` +
        'captions (transcribe the file, or write words on the clip)',
    );
  }
  return { words, warnings };
}

/**
 * The `env.words` of a host that holds a table.
 * @param {WordTable|undefined} table
 * @returns {(clip: { sourceFile?: string }) => any}
 */
export const wordsFrom = (table) => (clip) => table?.[clip?.sourceFile] ?? null;

/**
 * The clips whose captions will be drawn: the sound clips of every voice
 * that has words — its own, or its file's in the table. Without a table
 * every voice counts, as nothing is known yet.
 * @param {any[]} tracks
 * @param {WordTable} [table]
 * @returns {any[]} Sound clips (the pieces of a run each on their own)
 */
export function spokenClips(tracks, table) {
  return captionVoices({ tracks }).flatMap((voice) => {
    const own = Array.isArray(voice.clip.captions?.words);
    return own || !table || table[voice.clip.sourceFile] ? voice.pieces : [];
  });
}
