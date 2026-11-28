/**
 * The export dialog's subtitle option: none, `.srt` or `.vtt` — a render
 * then saves the timeline's captions beside the video, as phrases to read
 * (the render job's `subtitles`, docs/app-spec/CAPTIONS.md § In a render).
 * Here is what the option knows by itself: which files there are, whether a
 * document has captions to save, and the choice remembered on this
 * computer. The choice of the open dialog is `subtitles` in the export state
 * (`#utils/ui/exportController.js`), and it goes out with the render request
 * (`renderRequest` in `#utils/ui/exportPlan.js`).
 * @module utils/captionsUi/exportSubtitles
 */

import { captionedClips } from '#utils/edl/index.js';
import { readStored, writeStored } from '#utils/ui/storage.js';

const STORE_KEY = 'nearedit_captions';
export const SUBTITLE_CHOICES = ['', 'srt', 'vtt'];

/**
 * @param {unknown} format
 * @returns {string} A known choice; '' for anything else
 */
export const subtitleChoice = (format) =>
  typeof format === 'string' && SUBTITLE_CHOICES.includes(format) ? format : '';

/** @returns {string} The choice made last on this computer: '', `srt` or `vtt` */
export const rememberedSubtitles = () => subtitleChoice(readStored(STORE_KEY).exportSubtitles);

/**
 * Keep the choice for the next export, and the next visit.
 * @param {string} format - '', `srt` or `vtt`
 */
export function rememberSubtitles(format) {
  writeStored(STORE_KEY, { ...readStored(STORE_KEY), exportSubtitles: subtitleChoice(format) });
}

/**
 * @param {any} doc
 * @returns {number} How many voices of a document have captions switched on
 */
export const captionedCount = (doc) => captionedClips(doc).length;

/**
 * The request of a render with the subtitle option in it.
 * @param {Record<string, any>} request - A render request without the option
 * @param {string} format - The choice
 * @param {number} captioned - Voices with captions on: without any, no file is asked for
 * @returns {Record<string, any>}
 */
export function withSubtitles(request, format, captioned) {
  const choice = subtitleChoice(format);
  return choice && captioned > 0 ? { ...request, subtitles: choice } : request;
}
